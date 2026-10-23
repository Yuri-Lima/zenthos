import type { TokenUsage } from '@zenthos/domain';

/** What one model cost inside an agent run, as the agent reported it. */
export type ModelUsage = { model: string; tokens: TokenUsage; estimatedCostUsd: number };

export type TracedRun<T> = { value: T; usageByModel: ModelUsage[] };

export type AgentTraceContext = {
  /** The trace session, `traceSessionId(ticketKey)` for a workflow run (ADR 015). */
  sessionId: string;
  /** `coding-agent/v1`: the version names the agent in the cost check. */
  version: string;
  name: string;
};

/**
 * Puts one run of an agent that is not a LangChain graph into the ticket's trace (ADR 015). The run executes inside
 * a span, so an agent process that honours W3C trace context nests its own spans there; `exportEnv` is what that
 * process needs to send them to the same backend. The usage per model is recorded when the run returns.
 */
export interface AgentTracingPort {
  traceRun<T>(context: AgentTraceContext, run: (exportEnv: Record<string, string>) => Promise<TracedRun<T>>): Promise<T>;
}
