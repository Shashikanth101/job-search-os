// src/llm/index.js
// Model-agnostic LLM client. Switch providers by changing .env — no code changes needed.
// Every call goes through callLlm(), which classifies failures, returns token usage and logs to llm_usage.
import { estimateCostUsd } from './pricing.js';
import { recordUsage } from './usage.js';
import { getConfig } from '../config/env.js';

const PROVIDERS = {
  anthropic: {
    baseURL: 'https://api.anthropic.com/v1',
    defaultModel: 'claude-sonnet-4-6',
    native: 'anthropic',
    headers: (apiKey) => ({
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    }),
  },
  openai: {
    baseURL: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini',
    headers: (apiKey) => ({
      'Authorization': `Bearer ${apiKey}`,
      'content-type': 'application/json',
    }),
  },
  groq: {
    baseURL: 'https://api.groq.com/openai/v1',
    defaultModel: 'llama-3.1-8b-instant', // fast + free tier
    headers: (apiKey) => ({
      'Authorization': `Bearer ${apiKey}`,
      'content-type': 'application/json',
    }),
  },
  ollama: {
    baseURL: 'http://localhost:11434/v1', // fully local, free
    defaultModel: 'llama3.2',
    headers: () => ({
      'content-type': 'application/json',
    }),
  },
};

const DEFAULT_TIMEOUT_MS = 60_000;
const QUOTA_PATTERN = /insufficient_quota|credit balance|billing|quota|payment required|exceeded your current/i;
let logged = false;
let injectedClient = null;

/** Error thrown by the LLM client. `kind` drives retry and circuit-breaker decisions. */
export class LlmError extends Error {
  /**
   * @param {string} message Description.
   * @param {object} details Error details.
   * @param {number} [details.status] HTTP status.
   * @param {'aborted'|'disabled'|'config'|'auth'|'quota'|'rate_limit'|'server'|'timeout'|'network'|'bad_request'} details.kind Failure class.
   */
  constructor(message, { status = null, kind, code = null } = {}) {
    super(message);
    this.name = 'LlmError';
    this.status = status;
    this.kind = kind;
    this.code = code ?? kind;
  }
}

/** Failures that will repeat for every job (auth, billing, config, kill switch): abort the whole run. */
export function isFatalLlmError(error) {
  return error instanceof LlmError && ['disabled', 'config', 'auth', 'quota', 'bad_request'].includes(error.kind);
}

/** Failures worth retrying shortly: rate limit, 5xx, timeouts and network errors. */
export function isTransientLlmError(error) {
  return error instanceof LlmError && ['rate_limit', 'server', 'timeout', 'network'].includes(error.kind);
}

/**
 * Install a mock transport (tests) or clear it with null. The client receives
 * {provider, model, system, user, maxTokens, temperature, kind} and returns {text, usage?: {input_tokens, output_tokens}}.
 * @param {Function|null} client Mock client.
 * @returns {void}
 */
export function setLlmClient(client) {
  injectedClient = client;
}

function classifyHttpError(status, rawBody) {
  let body = rawBody;
  let label = '';
  try {
    const detail = JSON.parse(rawBody)?.error;
    if (detail?.message) {
      label = detail.type ? ` ${detail.type}:` : '';
      body = detail.message;
    }
  } catch { /* non-JSON body: keep the raw text */ }
  const message = `LLM API error (${status})${label} ${body}`.replace(/\s+/g, ' ').slice(0, 600);
  if (status === 401 || status === 403) return new LlmError(message, { status, kind: 'auth' });
  if (status === 402 || (status >= 400 && status < 500 && QUOTA_PATTERN.test(body))) return new LlmError(message, { status, kind: 'quota' });
  if (status === 429) return new LlmError(message, { status, kind: 'rate_limit' });
  if (status >= 500) return new LlmError(message, { status, kind: 'server' });
  return new LlmError(message, { status, kind: 'bad_request' });
}

/**
 * Ranker settings come directly from LLM_*; resume provider, key, and model
 * each fall back from RESUME_LLM_* to LLM_* when unset or empty.
 * URL overrides are client-scoped and Ollama-only; a resume URL override
 * additionally requires RESUME_LLM_PROVIDER=ollama and never falls back to LLM_BASE_URL.
 * @param {'ranker'|'resume'} [client] Which configuration to resolve.
 * @param {{model?: string, provider?: string}} [overrides] Per-call overrides (eval harness). The configured API key is reused.
 * @returns {{provider: string, apiKey?: string, model: string, baseURL: string, config?: object}} Resolved settings.
 */
export function resolveLlmSettings(client = 'ranker', overrides = {}) {
  const config = getConfig();
  const settings = client === 'resume'
    ? { ...config.resumeLlm, baseURL: config.resumeLlm.baseUrl }
    : { ...config.llm, baseURL: config.llm.baseUrl };
  const provider = overrides.provider || settings.provider || 'anthropic';
  const providerConfig = PROVIDERS[provider];
  if (!providerConfig) {
    throw new LlmError(`Unknown LLM provider: "${provider}". Valid options: ${Object.keys(PROVIDERS).join(', ')}`, { kind: 'config' });
  }
  return {
    provider,
    apiKey: settings.apiKey,
    // An explicit model wins; switching provider without a model falls back to that provider's default.
    model: overrides.model || (overrides.provider ? undefined : settings.model) || providerConfig.defaultModel,
    baseURL: provider === 'ollama' ? settings.baseURL || providerConfig.baseURL : providerConfig.baseURL,
    config: providerConfig,
  };
}

function inTestRun() {
  return getConfig().nodeEnv === 'test' || Boolean(process.env.NODE_TEST_CONTEXT);
}

async function httpTransport({ settings, system, user, maxTokens, temperature, disableThinking, signal }) {
  const { provider, apiKey, model, baseURL, config } = settings;
  if (provider !== 'ollama' && !apiKey) throw new LlmError(`LLM_API_KEY is not set for provider "${provider}".`, { kind: 'config' });
  if (!logged) {
    console.log(`[LLM] provider=${provider} model=${model} baseURL=${baseURL}`);
    logged = true;
  }
  const native = config.native === 'anthropic';
  const body = native
    ? { model, max_tokens: maxTokens ?? 1024, system, messages: [{ role: 'user', content: user }],
      // Opt-in until verified for the model: LLM_ANTHROPIC_DISABLE_THINKING=1 sends thinking:{type:'disabled'} on ranking calls.
      ...(disableThinking && getConfig().llm.disableThinking && { thinking: { type: 'disabled' } }) } // Anthropic rejects `temperature` on current models.
    : {
      model,
      ...(provider === 'openai' ? { max_completion_tokens: maxTokens ?? 16000 } : { max_tokens: maxTokens ?? 1024 }),
      ...(temperature != null && { temperature }),
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
    };
  let response;
  try {
    response = await fetch(native ? `${baseURL}/messages` : `${baseURL}/chat/completions`, {
      method: 'POST',
      headers: config.headers(apiKey),
      body: JSON.stringify(body),
      signal: signal ? AbortSignal.any([AbortSignal.timeout(getConfig().llm.timeoutMs || DEFAULT_TIMEOUT_MS), signal]) : AbortSignal.timeout(getConfig().llm.timeoutMs || DEFAULT_TIMEOUT_MS),
    });
  } catch (error) {
    if (signal?.aborted) throw new LlmError('LLM request aborted.', { kind: 'aborted' });
    const timedOut = error?.name === 'TimeoutError' || error?.name === 'AbortError';
    throw new LlmError(`LLM request ${timedOut ? 'timed out' : 'failed'}: ${error.message}`, { kind: timedOut ? 'timeout' : 'network' });
  }
  if (!response.ok) {
    const error = classifyHttpError(response.status, await response.text?.().catch(() => '') ?? '');
    console.error(`[LLM] ${error.message}`);
    throw error;
  }

  const data = await response.json();
  if (native) {
    const text = (data.content ?? []).filter((part) => part.type === 'text').map((part) => part.text).join('');
    // usage.output_tokens already includes thinking tokens; surface the breakdown when the API reports it.
    const thinking = data.usage?.output_tokens_details?.thinking_tokens;
    if (thinking) console.log(`[LLM] thinking_tokens=${thinking} (included in output_tokens)`);
    return { text, usage: { input_tokens: data.usage?.input_tokens ?? 0, output_tokens: data.usage?.output_tokens ?? 0, ...(thinking && { thinking_tokens: thinking }) }, truncated: data.stop_reason === 'max_tokens' };
  }
  const choice = data.choices?.[0];
  return {
    text: choice?.message?.content ?? '',
    usage: { input_tokens: data.usage?.prompt_tokens ?? 0, output_tokens: data.usage?.completion_tokens ?? 0 },
    truncated: choice?.finish_reason === 'length',
  };
}

/**
 * Send one independent chat request (fresh messages, no shared history) and log it to llm_usage.
 * @param {string} system System prompt.
 * @param {string} user User message.
 * @param {object} [options] Call options.
 * @param {import('better-sqlite3').Database} [options.db] Ledger database; no ledger row is written without it.
 * @param {'rank'|'resume'|'extract'|'manual'} [options.kind] Ledger kind.
 * @param {number} [options.jobId] Related job id.
 * @param {string} [options.runId] Run identifier.
 * @param {'ranker'|'resume'} [options.client] Which LLM configuration to use.
 * @param {number} [options.maxTokens] Output token cap (provider default when omitted).
 * @param {number} [options.temperature] Sampling temperature (not sent to Anthropic).
 * @param {{model?: string, provider?: string}} [options.overrides] Per-call model/provider override (eval harness).
 * @param {string} [options.purpose] Ledger marker, e.g. 'eval'.
 * @param {AbortSignal} [options.signal] Aborts the request; the call then rejects with an LlmError of kind 'aborted'.
 * @param {boolean} [options.disableThinking] Request no extended thinking (Anthropic only, requires LLM_ANTHROPIC_DISABLE_THINKING=1).
 * @returns {Promise<{text: string, usage: {input_tokens: number, output_tokens: number}, model: string, estCostUsd: number}>} Response.
 * @throws {LlmError} Classified failure.
 */
export async function callLlm(system, user, { db, kind = 'extract', jobId = null, runId = null, client = 'ranker', maxTokens, temperature, disableThinking = false, signal, overrides, purpose = null } = {}) {
  if (getConfig().llm.disabled) throw new LlmError('LLM calls are disabled (LLM_DISABLED=1).', { kind: 'disabled' });
  const settings = resolveLlmSettings(client, overrides);
  const request = { provider: settings.provider, model: settings.model, system, user, maxTokens, temperature, kind, signal };
  let result;
  try {
    if (injectedClient) {
      result = await injectedClient(request);
    } else if (inTestRun() && !globalThis.fetch?.mock) {
      throw new LlmError('Real LLM calls are disabled during tests; install a mock with setLlmClient() or mock fetch.', { kind: 'config' });
    } else {
      result = await httpTransport({ settings, system, user, maxTokens, temperature, disableThinking, signal });
    }
  } catch (error) {
    const wrapped = signal?.aborted ? new LlmError('LLM request aborted.', { kind: 'aborted' })
      : error instanceof LlmError ? error : new LlmError(error.message, { kind: 'network' });
    recordUsage(db, { runId, kind, jobId, model: settings.model, status: 'error', error: wrapped.message, purpose });
    throw wrapped;
  }
  const usage = { input_tokens: result.usage?.input_tokens ?? 0, output_tokens: result.usage?.output_tokens ?? 0 };
  const estCostUsd = estimateCostUsd(settings.model, usage.input_tokens, usage.output_tokens);
  recordUsage(db, { runId, kind, jobId, model: settings.model, inputTokens: usage.input_tokens, outputTokens: usage.output_tokens, estCostUsd, status: 'ok', purpose });
  if (result.truncated) console.warn('[LLM Warning] Response was cut off due to the token limit.');
  return { text: result.text ?? '', usage, model: settings.model, estCostUsd, truncated: Boolean(result.truncated) };
}

/**
 * Send a chat completion request to the configured LLM provider (extraction etc.).
 * @param {string} systemPrompt System prompt.
 * @param {string} userMessage User message.
 * @param {object} [options] See callLlm.
 * @returns {Promise<string>} The model's text response.
 */
export async function chat(systemPrompt, userMessage, options = {}) {
  return (await callLlm(systemPrompt, userMessage, { kind: 'extract', ...options, client: 'ranker' })).text;
}

/**
 * Send a resume-tailoring chat completion using the optional dedicated LLM configuration.
 * @param {string} systemPrompt System prompt.
 * @param {string} userMessage User message.
 * @param {object} [options] See callLlm.
 * @returns {Promise<string>} The model's text response.
 */
export async function resumeChat(systemPrompt, userMessage, options = {}) {
  return (await callLlm(systemPrompt, userMessage, { kind: 'resume', ...options, client: 'resume' })).text;
}
