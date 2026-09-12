// src/llm/index.js
// Model-agnostic LLM client using OpenAI-compatible API format
// Switch providers by changing .env — no code changes needed

const PROVIDERS = {
  anthropic: {
    baseURL: 'https://api.anthropic.com/v1',
    defaultModel: 'claude-sonnet-4-6',
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

let logged = false;

/**
 * Ranker settings come directly from LLM_*; resume provider, key, and model
 * each fall back from RESUME_LLM_* to LLM_* when unset or empty.
 * URL overrides are client-scoped and Ollama-only; a resume URL override
 * additionally requires RESUME_LLM_PROVIDER=ollama and never falls back to LLM_BASE_URL.
 */
async function sendChat(systemPrompt, userMessage, client) {
  const settings = client === 'resume'
    ? {
      provider: process.env.RESUME_LLM_PROVIDER || process.env.LLM_PROVIDER,
      apiKey: process.env.RESUME_LLM_API_KEY || process.env.LLM_API_KEY,
      model: process.env.RESUME_LLM_MODEL || process.env.LLM_MODEL,
      baseURL: process.env.RESUME_LLM_PROVIDER === 'ollama'
        ? process.env.RESUME_LLM_BASE_URL
        : undefined,
    }
    : {
      provider: process.env.LLM_PROVIDER,
      apiKey: process.env.LLM_API_KEY,
      model: process.env.LLM_MODEL,
      baseURL: process.env.LLM_BASE_URL,
    };
  const provider = settings.provider || 'anthropic';
  const apiKey = settings.apiKey;
  const model = settings.model || PROVIDERS[provider]?.defaultModel;
  const config = PROVIDERS[provider];

  if (!config) {
    throw new Error(`Unknown LLM provider: "${provider}". Valid options: ${Object.keys(PROVIDERS).join(', ')}`);
  }

  const baseURL = provider === 'ollama'
    ? settings.baseURL || config.baseURL
    : config.baseURL;

  if (!logged) {
    console.log(`[LLM] provider=${provider} model=${model} baseURL=${baseURL}`);
    logged = true;
  }

  const response = await fetch(`${baseURL}/chat/completions`, {
    method: 'POST',
    headers: config.headers(apiKey),
    body: JSON.stringify({
      model,
      ...(provider === 'openai'
        ? { max_completion_tokens: 16000 }
        : { max_tokens: 1024 }),
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`LLM API error (${response.status}): ${err}`);
  }

  const data = await response.json();
  const content = data.choices[0].message.content;
  if (data.choices[0].finish_reason === 'length') {
    console.warn('[LLM Warning] Response was cut off due to token limit. Consider increasing max_completion_tokens.');
  }
  return content;
}

/**
 * Send a chat completion request to the configured LLM provider.
 * @param {string} systemPrompt
 * @param {string} userMessage
 * @returns {Promise<string>} - the model's text response
 */
export async function chat(systemPrompt, userMessage) {
  return sendChat(systemPrompt, userMessage, 'ranker');
}

/**
 * Send a resume-tailoring chat completion using the optional dedicated LLM configuration.
 * @param {string} systemPrompt
 * @param {string} userMessage
 * @returns {Promise<string>} - the model's text response
 */
export async function resumeChat(systemPrompt, userMessage) {
  return sendChat(systemPrompt, userMessage, 'resume');
}
