import { query, type SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import { DomainError, type Implementation, type TokenUsage } from '@zenthos/domain';
import type { CodingAgentPort, ImplementInput } from '@zenthos/ports';
import { decideToolUse } from './permissions.js';
import { implementationPrompt } from './prompt.js';

export type ClaudeCodeAgentOptions = {
  model?: string;
  maxTurns?: number;
};

/**
 * Claude Code, headless, inside the workspace. Edits are auto-approved; shell commands must be in
 * the repository profile's allowlist; web tools are removed. Authentication is Claude Code's own
 * (its login or the Anthropic credential chain), never a key held by ZenthOs.
 */
export class ClaudeCodeAgent implements CodingAgentPort {
  constructor(private readonly options: ClaudeCodeAgentOptions = {}) {}

  async implement(input: ImplementInput): Promise<Implementation> {
    const session = query({
      prompt: implementationPrompt(input),
      options: {
        cwd: input.workspace.path,
        model: this.options.model,
        maxTurns: this.options.maxTurns ?? 60,
        permissionMode: 'acceptEdits',
        disallowedTools: ['WebFetch', 'WebSearch'],
        settingSources: ['project'],
        canUseTool: async (toolName, toolInput) => decideToolUse(input.profile, toolName, toolInput),
      },
    });

    for await (const message of session) {
      const result = asResult(message);
      if (!result) continue;
      if (result.subtype === 'success') return { summary: result.result, estimatedCostUsd: result.total_cost_usd, tokens: result.tokens };
      throw new DomainError('implementation_failed', { reason: result.subtype, estimatedCostUsd: result.total_cost_usd, tokens: result.tokens });
    }
    throw new DomainError('implementation_failed', { reason: 'no result message' });
  }
}

type ResultMessage = { subtype: string; result: string; total_cost_usd: number; tokens: TokenUsage };
type RawUsage = { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number };

/**
 * The SDK's result union is wide; only these fields matter here. `total_cost_usd` is the SDK's own
 * estimate from a bundled price table (its docs call it "estimates, not billing"); `usage` is what a bill
 * would be based on, so both are kept.
 */
function asResult(message: SDKMessage): ResultMessage | undefined {
  if (message.type !== 'result') return undefined;
  const raw = message as unknown as Partial<ResultMessage> & { usage?: RawUsage };
  const usage = raw.usage ?? {};
  return {
    subtype: raw.subtype ?? 'unknown',
    result: raw.result ?? '',
    total_cost_usd: raw.total_cost_usd ?? 0,
    tokens: {
      inputTokens: usage.input_tokens ?? 0,
      outputTokens: usage.output_tokens ?? 0,
      cacheReadTokens: usage.cache_read_input_tokens ?? 0,
      cacheWriteTokens: usage.cache_creation_input_tokens ?? 0,
    },
  };
}
