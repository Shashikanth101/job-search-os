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
 * Send a chat completion request to the configured LLM provider.
 * @param {string} systemPrompt
 * @param {string} userMessage
 * @returns {Promise<string>} - the model's text response
 */
export async function chat(systemPrompt, userMessage) {
  const provider = process.env.LLM_PROVIDER || 'anthropic';
  const apiKey = process.env.LLM_API_KEY;
  const model = process.env.LLM_MODEL || PROVIDERS[provider]?.defaultModel;
  const config = PROVIDERS[provider];

  if (!config) {
    throw new Error(`Unknown LLM provider: "${provider}". Valid options: ${Object.keys(PROVIDERS).join(', ')}`);
  }

  const baseURL = process.env.LLM_BASE_URL || config.baseURL;

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
        ? { max_completion_tokens: 1024 }
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
  return data.choices[0].message.content;
}
