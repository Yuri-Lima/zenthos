import { BaseCallbackHandler } from '@langchain/core/callbacks/base';
import type { Callbacks } from '@langchain/core/callbacks/manager';
import type { LLMResult } from '@langchain/core/outputs';
import { addTokens, NO_TOKENS, type TokenUsage } from '@zenthos/domain';

type UsageMetadata = { input_tokens?: number; output_tokens?: number; input_token_details?: { cache_read?: number; cache_creation?: number } };

/**
 * Sums the tokens every model call in one graph invocation reports. LangChain puts Anthropic's usage on
 * the message as `usage_metadata`; structured output hides the message, so a callback is the one place
 * that still sees it. One collector per invocation, read when the graph returns.
 */
export class UsageCollector extends BaseCallbackHandler {
  override name = 'zenthos-usage';
  tokens: TokenUsage = NO_TOKENS;

  override handleLLMEnd(output: LLMResult): void {
    for (const generation of output.generations.flat()) {
      const usage = (generation as { message?: { usage_metadata?: UsageMetadata } }).message?.usage_metadata;
      if (!usage) continue;
      this.tokens = addTokens(this.tokens, {
        inputTokens: usage.input_tokens ?? 0,
        outputTokens: usage.output_tokens ?? 0,
        cacheReadTokens: usage.input_token_details?.cache_read ?? 0,
        cacheWriteTokens: usage.input_token_details?.cache_creation ?? 0,
      });
    }
  }
}

/** The tracer's callbacks plus the collector; `Callbacks` is a handler list or a manager, and only the list form is appended to. */
export function withCollector(callbacks: Callbacks | undefined, collector: UsageCollector): Callbacks {
  return Array.isArray(callbacks) ? [...callbacks, collector] : callbacks ? callbacks : [collector];
}
