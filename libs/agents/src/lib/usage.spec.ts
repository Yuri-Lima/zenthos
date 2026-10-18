import { costEstimator } from './pricing.js';
import { UsageCollector } from './usage.js';

describe('UsageCollector', () => {
  it('sums usage_metadata across every generation of an invocation', () => {
    const collector = new UsageCollector();
    const end = (input: number, output: number, cacheRead = 0, cacheCreation = 0) =>
      collector.handleLLMEnd({ generations: [[{ text: '', message: { usage_metadata: { input_tokens: input, output_tokens: output, input_token_details: { cache_read: cacheRead, cache_creation: cacheCreation } } } } as never]] });
    end(1000, 100);
    end(500, 50, 400, 100);
    collector.handleLLMEnd({ generations: [[{ text: 'no usage' } as never]] });
    expect(collector.tokens).toEqual({ inputTokens: 1500, outputTokens: 150, cacheReadTokens: 400, cacheWriteTokens: 100 });
  });
});

describe('costEstimator', () => {
  it('prices tokens at list price and knows nothing about unknown models', () => {
    const tokens = { inputTokens: 1_000_000, outputTokens: 100_000, cacheReadTokens: 1_000_000, cacheWriteTokens: 1_000_000 };
    expect(costEstimator('claude-opus-5-5')(tokens)).toBeCloseTo(4 + 2 + 0.2 + 5, 6);
    expect(costEstimator('claude-sonnet-5-5')(tokens)).toBeCloseTo(2 + 1 + 0.2 + 2.5, 6);
    expect(costEstimator('some-future-model')(tokens)).toBe(0);
  });
});
