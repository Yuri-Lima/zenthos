import { z } from 'zod';
import { DomainError } from './errors.js';
import { GateResultSchema } from './gate.js';
import { addAgentUsage, UsageByAgentSchema, type AgentRole } from './agent-usage.js';
import { addUsage, NO_TOKENS, PullRequestSchema, TokenUsageSchema, type Usage } from './implementation.js';
import { ReviewSchema } from './review.js';
import { DEFAULT_POLICY, RunPolicySchema, type RunPolicy } from './policies.js';
import { SpecSchema } from './specification.js';
import { TicketSchema, type Ticket } from './ticket.js';
import { RUN_EVENTS, RUN_STATES, transition, type RunEvent } from './run-state.js';

export const RunHistoryEntrySchema = z.object({
  event: z.enum(RUN_EVENTS),
  from: z.enum(RUN_STATES),
  to: z.enum(RUN_STATES),
  at: z.iso.datetime(),
  /** Who caused it when a person did: a dashboard login, the GitHub login that set a label, or "cli". */
  by: z.string().optional(),
});

export type RunHistoryEntry = z.infer<typeof RunHistoryEntrySchema>;

/** One run per ticket. Immutable: every change returns a new Run. The schema is the one definition the store, the API and the client share. */
export const RunSchema = z.object({
  id: z.uuid(),
  ticket: TicketSchema,
  state: z.enum(RUN_STATES),
  createdAt: z.iso.datetime(),
  /** Who started the run when a person did; absent for label polling and dry runs. */
  requestedBy: z.string().optional(),
  /** The workspace the repository belongs to, copied from its profile at intake (ADR 019); absent on runs stored before. */
  workspaceId: z.uuid().optional(),
  /** Sum of the agents' own estimates at list price. A budget signal, not an invoice. */
  estimatedCostUsd: z.number().min(0),
  /** Sum of the token counts the models reported; the figure a bill is actually based on. */
  tokens: TokenUsageSchema,
  /** The same usage split by agent, so each can be checked against LangFuse (ADR 015). Empty for runs stored before. */
  usageByAgent: UsageByAgentSchema.default({}),
  /** The repository profile's policy, snapshotted at intake so every gate and the workflow read one value. */
  policy: RunPolicySchema,
  history: z.array(RunHistoryEntrySchema),
  /** Set once the spec writer has produced a draft. */
  spec: SpecSchema.optional(),
  /** Results of the last gate run. */
  gates: z.array(GateResultSchema).optional(),
  /** Set once the merge request is open; reused by later rounds on the same branch. */
  pullRequest: PullRequestSchema.optional(),
  /** The last review the reviewer agent posted on the pull request. */
  review: ReviewSchema.optional(),
  /** The branch the implementation was pushed to, set even when the run escalates, so work is never lost. */
  branch: z.string().optional(),
});

export type Run = z.infer<typeof RunSchema>;

export function parseRun(input: unknown): Run {
  const result = RunSchema.safeParse(input);
  if (!result.success) throw new DomainError('invalid_run', { issues: result.error.issues });
  return result.data;
}

/** Uses Web Crypto so this file stays free of node imports and can be bundled into a Temporal workflow. */
/** `id` is for callers without `crypto` at hand, such as workflow code that must stay deterministic. */
export function createRun(ticket: Ticket, options: { policy?: RunPolicy; now?: Date; id?: string; requestedBy?: string; workspaceId?: string } = {}): Run {
  return {
    id: options.id ?? globalThis.crypto.randomUUID(),
    ticket,
    state: 'intake',
    createdAt: (options.now ?? new Date()).toISOString(),
    ...(options.requestedBy ? { requestedBy: options.requestedBy } : {}),
    ...(options.workspaceId ? { workspaceId: options.workspaceId } : {}),
    estimatedCostUsd: 0,
    tokens: NO_TOKENS,
    usageByAgent: {},
    policy: options.policy ?? DEFAULT_POLICY,
    history: [],
  };
}

export function applyEvent(run: Run, event: RunEvent, now: Date = new Date(), by?: string): Run {
  const to = transition(run.state, event);
  const entry: RunHistoryEntry = { event, from: run.state, to, at: now.toISOString(), ...(by ? { by } : {}) };
  return { ...run, state: to, history: [...run.history, entry] };
}

/** The run after one more agent call: its totals and that agent's share. The spec writer, the coding agent and the reviewer all add here. */
export const withUsage = (run: Run, usage: Usage, agent: AgentRole): Run => ({
  ...run,
  ...addUsage({ tokens: run.tokens, estimatedCostUsd: run.estimatedCostUsd }, usage),
  usageByAgent: addAgentUsage(run.usageByAgent ?? {}, agent, usage),
});
