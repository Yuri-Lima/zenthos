import type { TokenUsage } from '@zenthos/domain';

/**
 * List prices per million tokens, from Anthropic's price table read on 2026-10-18. Cache writes are
 * billed at 1.25x input on every current model. An estimate at list price, never a bill: a profile or
 * federation account is invoiced from the Console's usage page.
 */
export const PRICES_PER_MILLION: Record<string, { input: number; output: number; cacheRead: number }> = {
  'claude-opus-5-5': { input: 4, output: 20, cacheRead: 0.2 },
  'claude-sonnet-5-5': { input: 2, output: 10, cacheRead: 0.2 },
};

export type CostEstimator = (tokens: TokenUsage) => number;

/** The estimator for a model id; an unknown model estimates zero rather than guessing a price. */
export function costEstimator(model: string): CostEstimator {
  const price = PRICES_PER_MILLION[model];
  if (!price) return () => 0;
  return ({ inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens }) =>
    (inputTokens * price.input + outputTokens * price.output + cacheReadTokens * price.cacheRead + cacheWriteTokens * price.input * 1.25) / 1_000_000;
}
