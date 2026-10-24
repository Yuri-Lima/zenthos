import { query, type Options, type Query, type SDKMessage, type SDKUserMessage } from '@anthropic-ai/claude-agent-sdk';
import { addTokens, DomainError, NO_TOKENS, traceSessionId, type Implementation, type TokenUsage } from '@zenthos/domain';
import type { AgentTracingPort, CodingAgentPort, ImplementInput, ModelUsage } from '@zenthos/ports';
import { claudeCodeEnv, credentialRefusal } from './credentials.js';
import { decideToolUse } from './permissions.js';
import { CLAUDE_CODE_AGENT_VERSION, implementationPrompt } from './prompt.js';

export type ClaudeCodeAgentOptions = {
  /** ZenthOs's own Claude Code config directory: the Console sign-in lives here, a personal claude.ai login never does. */
  configDir: string;
  model?: string;
  maxTurns?: number;
  /** Puts each run into the ticket's trace (ADR 015); without it the run is not traced. */
  tracing?: AgentTracingPort;
};

/**
 * Claude Code, headless, inside the checkout. Edits are auto-approved; shell commands must be in
 * the repository profile's allowlist; web tools are removed. It runs on organisation credentials only and
 * never on a key held by ZenthOs (ADR 018, credentials.ts).
 */
export class ClaudeCodeAgent implements CodingAgentPort {
  constructor(private readonly options: ClaudeCodeAgentOptions) {}

  async implement(input: ImplementInput): Promise<Implementation> {
    const context = { sessionId: traceSessionId(input.spec.ticketKey), version: CLAUDE_CODE_AGENT_VERSION, name: 'coding agent' };
    const run = (exportEnv: Record<string, string>) => this.run(input, exportEnv);
    return this.options.tracing ? this.options.tracing.traceRun(context, run) : (await run({})).value;
  }

  /** Asks Claude Code which account it would run on, without sending a message; the worker calls it at boot. */
  async verifyAccess(): Promise<void> {
    const { session, check } = guardedSession(undefined, { env: claudeCodeEnv(this.options.configDir), settingSources: [] });
    try {
      for await (const message of session) void message;
    } catch {
      // Ending the input before any message stops Claude Code; the check already has what it needs.
    }
    if (!check.done) throw new Error(`could not ask Claude Code for its account: ${String(check.error)}`);
    if (check.refusal) throw new Error(`the coding agent cannot run: ${check.refusal}`);
  }

  private async run(input: ImplementInput, exportEnv: Record<string, string>) {
    const { session, check } = guardedSession(implementationPrompt(input), {
      cwd: input.checkout.path,
      model: this.options.model,
      maxTurns: this.options.maxTurns ?? 60,
      permissionMode: 'acceptEdits',
      disallowedTools: ['WebFetch', 'WebSearch'],
      settingSources: ['project'],
      canUseTool: async (toolName, toolInput) => decideToolUse(input.profile, toolName, toolInput),
      env: claudeCodeEnv(this.options.configDir, exportEnv),
    });

    let sessionModel: string | undefined;
    try {
      for await (const message of session) {
        if (message.type === 'system' && message.subtype === 'init') sessionModel = message.model;
        const result = asResult(message, sessionModel);
        if (!result) continue;
        const usage = { estimatedCostUsd: result.estimatedCostUsd, tokens: result.tokens };
        // A `success` with `is_error` is a turn that ended on an API error (an expired login, an overloaded model): its text is the error.
        if (result.subtype === 'success' && !result.isError) return { value: { summary: result.result, ...usage }, usageByModel: result.usageByModel };
        throw new DomainError('implementation_failed', { reason: result.isError ? `api_error: ${result.result.slice(0, 300)}` : result.subtype, ...usage });
      }
    } catch (error) {
      if (!check.refusal) throw error;
    }
    throw new DomainError('implementation_failed', { reason: check.refusal ? `credential_refused: ${check.refusal}` : 'no result message' });
  }
}

type CredentialCheck = { done: boolean; refusal?: string; error?: unknown };

/**
 * Starts Claude Code and sends `prompt` only once the account it runs on is accepted, so a refused credential never
 * reaches the model. The SDK reads the prompt as soon as `query` is called, before it returns, hence the hand-over.
 */
function guardedSession(prompt: string | undefined, options: Options): { session: Query; check: CredentialCheck } {
  let handOver: (session: Query) => void = () => undefined;
  const started = new Promise<Query>((resolve) => (handOver = resolve));
  const check: CredentialCheck = { done: false };
  async function* messages(): AsyncGenerator<SDKUserMessage> {
    try {
      check.refusal = credentialRefusal(await (await started).accountInfo(), options.env ?? process.env);
      check.done = true;
    } catch (error) {
      check.error = error;
      return;
    }
    if (prompt && !check.refusal) yield { type: 'user', message: { role: 'user', content: prompt }, parent_tool_use_id: null };
  }
  const session = query({ prompt: messages(), options });
  handOver(session);
  return { session, check };
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
 * Cache lifetimes: on organisation credentials Claude Code writes its cache for five minutes unless
 * ENABLE_PROMPT_CACHING_1H asks for one hour (Claude Code's prompt-caching docs). `modelUsage` does not split them,
 * the main loop's `usage.cache_creation` does, so its one-hour writes are attributed to the session's model and
 * every other cache write counts as five minutes.
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
