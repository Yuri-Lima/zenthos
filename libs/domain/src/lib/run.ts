import type { GateResult } from './gate.js';
import { NO_TOKENS, type PullRequest, type TokenUsage } from './implementation.js';
import type { Review } from './review.js';
import { DEFAULT_POLICY, type RunPolicy } from './policies.js';
import type { Spec } from './specification.js';
import type { Ticket } from './ticket.js';
import { transition, type RunEvent, type RunState } from './run-state.js';

export type RunHistoryEntry = {
  event: RunEvent;
  from: RunState;
  to: RunState;
  at: string;
};

/** One run per ticket. Immutable: every change returns a new Run. */
export type Run = {
  id: string;
  ticket: Ticket;
  state: RunState;
  createdAt: string;
  /** Sum of the agents' own estimates at list price. A budget signal, not an invoice. */
  estimatedCostUsd: number;
  /** Sum of the token counts the models reported; the figure a bill is actually based on. */
  tokens: TokenUsage;
  /** The repository profile's policy, snapshotted at intake so every gate and the workflow read one value. */
  policy: RunPolicy;
  history: RunHistoryEntry[];
  /** Set once the spec writer has produced a draft. */
  spec?: Spec;
  /** Results of the last gate run. */
  gates?: GateResult[];
  /** Set once the merge request is open; reused by later rounds on the same branch. */
  pullRequest?: PullRequest;
  /** The last review the reviewer agent posted on the pull request. */
  review?: Review;
  /** The branch the implementation was pushed to, set even when the run escalates, so work is never lost. */
  branch?: string;
};

/** Uses Web Crypto so this file stays free of node imports and can be bundled into a Temporal workflow. */
export function createRun(ticket: Ticket, options: { policy?: RunPolicy; now?: Date } = {}): Run {
  return {
    id: globalThis.crypto.randomUUID(),
    ticket,
    state: 'intake',
    createdAt: (options.now ?? new Date()).toISOString(),
    estimatedCostUsd: 0,
    tokens: NO_TOKENS,
    policy: options.policy ?? DEFAULT_POLICY,
    history: [],
  };
}

export function applyEvent(run: Run, event: RunEvent, now: Date = new Date()): Run {
  const to = transition(run.state, event);
  const entry: RunHistoryEntry = { event, from: run.state, to, at: now.toISOString() };
  return { ...run, state: to, history: [...run.history, entry] };
}
