import { query, type SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import { addTokens, DomainError, NO_TOKENS, traceSessionId, type Implementation, type TokenUsage } from '@zenthos/domain';
import type { AgentTracingPort, CodingAgentPort, ImplementInput, ModelUsage } from '@zenthos/ports';
import { decideToolUse } from './permissions.js';
import { CLAUDE_CODE_AGENT_VERSION, implementationPrompt } from './prompt.js';

export type ClaudeCodeAgentOptions = {
  model?: string;
  maxTurns?: number;
  /** Puts each run into the ticket's trace (ADR 015); without it the run is not traced. */
  tracing?: AgentTracingPort;
};

/**
 * Claude Code, headless, inside the workspace. Edits are auto-approved; shell commands must be in
 * the repository profile's allowlist; web tools are removed. Authentication is Claude Code's own
 * (its login or the Anthropic credential chain), never a key held by ZenthOs.
 */
export class ClaudeCodeAgent implements CodingAgentPort {
  constructor(private readonly options: ClaudeCodeAgentOptions = {}) {}

  async implement(input: ImplementInput): Promise<Implementation> {
    const context = { sessionId: traceSessionId(input.spec.ticketKey), version: CLAUDE_CODE_AGENT_VERSION, name: 'coding agent' };
    const run = (exportEnv: Record<string, string>) => this.run(input, exportEnv);
    return this.options.tracing ? this.options.tracing.traceRun(context, run) : (await run({})).value;
  }

  private async run(input: ImplementInput, exportEnv: Record<string, string>) {
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
        // In TypeScript `env` replaces the inherited environment, so it is passed only when there is something to add.
        ...(Object.keys(exportEnv).length ? { env: { ...process.env, ...exportEnv } } : {}),
      },
    });

    let sessionModel: string | undefined;
    for await (const message of session) {
      if (message.type === 'system' && message.subtype === 'init') sessionModel = message.model;
      const result = asResult(message, sessionModel);
      if (!result) continue;
      const usage = { estimatedCostUsd: result.estimatedCostUsd, tokens: result.tokens };
      // A `success` with `is_error` is a turn that ended on an API error (an expired login, an overloaded model): its text is the error.
      if (result.subtype === 'success' && !result.isError) return { value: { summary: result.result, ...usage }, usageByModel: result.usageByModel };
      throw new DomainError('implementation_failed', { reason: result.isError ? `api_error: ${result.result.slice(0, 300)}` : result.subtype, ...usage });
    }
    throw new DomainError('implementation_failed', { reason: 'no result message' });
  }
}

type RawModelUsage = { inputTokens?: number; outputTokens?: number; cacheReadInputTokens?: number; cacheCreationInputTokens?: number; costUSD?: number; canonicalModel?: string };
type RawUsage = { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number; cache_creation?: { ephemeral_1h_input_tokens?: number } };
type RawResult = { subtype?: string; result?: string; is_error?: boolean; total_cost_usd?: number; usage?: RawUsage; modelUsage?: Record<string, RawModelUsage> };

export type ParsedResult = { subtype: string; result: string; isError: boolean; estimatedCostUsd: number; tokens: TokenUsage; usageByModel: ModelUsage[] };

/**
 * The SDK's result union is wide; only these fields matter here. Tokens and cost come from `modelUsage`, which
 * covers every model call of the run (subagents and auxiliary calls included); the SDK documents `usage` as the
 * main agent loop only, so it is the fallback when `modelUsage` is absent. Costs are the SDK's own estimates at
 * list price ("estimates, not billing").
 *
 * Cache lifetimes: on a Claude subscription the main conversation writes its cache for one hour, subagents and
 * helpers for five minutes; on an API key everything uses five minutes (Claude Code's prompt-caching docs).
 * `modelUsage` does not split them, the main loop's `usage.cache_creation` does, so its one-hour writes are
 * attributed to the session's model and every other cache write counts as five minutes.
 */
export function asResult(message: SDKMessage, sessionModel?: string): ParsedResult | undefined {
  if (message.type !== 'result') return undefined;
  const raw = message as unknown as RawResult;
  const loop = raw.usage ?? {};
  const oneHour = loop.cache_creation?.ephemeral_1h_input_tokens ?? 0;
  const entries = Object.entries(raw.modelUsage ?? {});
  const mainKey = entries.find(([key, u]) => key === sessionModel || u.canonicalModel === sessionModel)?.[0] ?? [...entries].sort(([, a], [, b]) => (b.cacheCreationInputTokens ?? 0) - (a.cacheCreationInputTokens ?? 0))[0]?.[0];
  const usageByModel: ModelUsage[] = entries.map(([key, u]) => ({
    model: u.canonicalModel ?? key,
    tokens: { inputTokens: u.inputTokens ?? 0, outputTokens: u.outputTokens ?? 0, cacheReadTokens: u.cacheReadInputTokens ?? 0, cacheWriteTokens: u.cacheCreationInputTokens ?? 0 },
    cacheWriteOneHourTokens: key === mainKey ? Math.min(oneHour, u.cacheCreationInputTokens ?? 0) : 0,
    estimatedCostUsd: u.costUSD ?? 0,
  }));
  const tokens = usageByModel.length
    ? usageByModel.reduce((sum, u) => addTokens(sum, u.tokens), NO_TOKENS)
    : { inputTokens: loop.input_tokens ?? 0, outputTokens: loop.output_tokens ?? 0, cacheReadTokens: loop.cache_read_input_tokens ?? 0, cacheWriteTokens: loop.cache_creation_input_tokens ?? 0 };
  return { subtype: raw.subtype ?? 'unknown', result: raw.result ?? '', isError: raw.is_error === true, estimatedCostUsd: raw.total_cost_usd ?? 0, tokens, usageByModel };
}
