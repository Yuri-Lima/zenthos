import { z } from 'zod';
import { addUsage, NO_USAGE, TokenUsageSchema, type Usage } from './implementation.js';

/** The three agents a run pays for. Their usage is kept apart so each can be checked and priced on its own. */
export const AGENT_ROLES = ['spec_writer', 'coding_agent', 'reviewer'] as const;
export type AgentRole = (typeof AGENT_ROLES)[number];

export const UsageSchema = z.object({ tokens: TokenUsageSchema, estimatedCostUsd: z.number().min(0) });
export const UsageByAgentSchema = z.partialRecord(z.enum(AGENT_ROLES), UsageSchema);
export type UsageByAgent = z.infer<typeof UsageByAgentSchema>;

export const addAgentUsage = (byAgent: UsageByAgent, agent: AgentRole, usage: Usage): UsageByAgent => ({ ...byAgent, [agent]: addUsage(byAgent[agent] ?? NO_USAGE, usage) });

/**
 * The agents whose model calls reach LangFuse, by the prefix of their trace version (ADR 015). The spec writer and
 * the reviewer trace through LangChain callbacks; the coding agent through a span the worker opens around Claude
 * Code, with Claude Code's own OpenTelemetry spans inside it and one generation per model it used.
 */
export const TRACED_ROLES = ['spec_writer', 'coding_agent', 'reviewer'] as const satisfies readonly AgentRole[];
export type TracedRole = (typeof TRACED_ROLES)[number];
export const TRACE_VERSION_PREFIX: Record<TracedRole, string> = { spec_writer: 'spec-writer/', coding_agent: 'coding-agent/', reviewer: 'reviewer/' };

export const roleOfTraceVersion = (version: string): TracedRole | undefined => TRACED_ROLES.find((role) => version.startsWith(TRACE_VERSION_PREFIX[role]));

/**
 * Why an agent was called, which decides the trace session it lands in. Only the workflow's own calls trace under
 * the bare ticket key, so a run's session holds exactly what the run paid for; evals and manual re-reviews of the
 * same ticket trace beside it, never inside it.
 */
export const TRACE_PURPOSES = ['run', 'eval', 'manual'] as const;
export type TracePurpose = (typeof TRACE_PURPOSES)[number];
export const traceSessionId = (ticketKey: string, purpose: TracePurpose = 'run'): string => (purpose === 'run' ? ticketKey : `${purpose}:${ticketKey}`);

/** What the tracing backend recorded for one agent of one run, priced with its own model table. */
export const TracedUsageSchema = z.object({ estimatedCostUsd: z.number().min(0), totalTokens: z.number().int().min(0) });
export type TracedUsage = z.infer<typeof TracedUsageSchema>;
export type TracedUsageByAgent = Partial<Record<TracedRole, TracedUsage>>;

/**
 * Two estimates of the same calls agree within 5% or one cent. They are computed apart: ZenthOs prices the tokens
 * each call reported with its own list prices, LangFuse with its model table, so exact equality is not expected.
 */
export const TRACE_MATCH_TOLERANCE = { relative: 0.05, absoluteUsd: 0.01 } as const;

export const TRACE_VERDICTS = ['match', 'mismatch', 'not_recorded', 'not_traced'] as const;

export const TraceComparisonSchema = z.object({
  agent: z.enum(TRACED_ROLES),
  /** Absent for runs stored before usage was kept per agent. */
  stored: UsageSchema.optional(),
  traced: TracedUsageSchema.optional(),
  verdict: z.enum(TRACE_VERDICTS),
});
export type TraceComparison = z.infer<typeof TraceComparisonSchema>;

const agree = (a: number, b: number) => Math.abs(a - b) <= Math.max(TRACE_MATCH_TOLERANCE.absoluteUsd, TRACE_MATCH_TOLERANCE.relative * Math.max(a, b));

/** The phase gate "the numbers match LangFuse", per traced agent of one run. */
export function compareWithTraces(stored: UsageByAgent, traced: TracedUsageByAgent): TraceComparison[] {
  return TRACED_ROLES.map((agent) => {
    const mine = stored[agent];
    const theirs = traced[agent];
    const verdict = !mine ? 'not_recorded' : !theirs ? 'not_traced' : agree(mine.estimatedCostUsd, theirs.estimatedCostUsd) ? 'match' : 'mismatch';
    return { agent, ...(mine ? { stored: mine } : {}), ...(theirs ? { traced: theirs } : {}), verdict };
  });
}
