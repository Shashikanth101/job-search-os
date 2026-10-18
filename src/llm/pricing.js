/** Per-model list prices in USD per million tokens. Edit here when prices change. */
export const MODEL_PRICING = {
  'claude-haiku-5-5': { input: 0.10, output: 0.50 },
  'claude-sonnet-4-6': { input: 3.00, output: 15.00 },
  'gpt-4o-mini': { input: 0.15, output: 0.60 },
  'llama-3.1-8b-instant': { input: 0.05, output: 0.08 },
  llama3_2: { input: 0, output: 0 },
};

/** Conservative fallback for models missing from MODEL_PRICING (deliberately expensive). */
export const DEFAULT_PRICING = { input: 5.00, output: 25.00 };

const warned = new Set();

/**
 * Look up pricing for a model, warning once for unknown models.
 * @param {string} model Model id.
 * @returns {{input: number, output: number}} USD per million tokens.
 */
export function pricingFor(model) {
  const known = MODEL_PRICING[model] ?? (/^llama3(?:\.\d+)?(?::|$)/.test(model ?? '') ? MODEL_PRICING.llama3_2 : null);
  if (known) return known;
  if (!warned.has(model)) {
    warned.add(model);
    console.warn(`[LLM] No pricing configured for model "${model}"; using conservative default ${JSON.stringify(DEFAULT_PRICING)}.`);
  }
  return DEFAULT_PRICING;
}

/**
 * Estimate the USD cost of one call.
 * @param {string} model Model id.
 * @param {number} inputTokens Prompt tokens.
 * @param {number} outputTokens Completion tokens.
 * @returns {number} Estimated USD.
 */
export function estimateCostUsd(model, inputTokens = 0, outputTokens = 0) {
  const price = pricingFor(model);
  return (inputTokens * price.input + outputTokens * price.output) / 1_000_000;
}
