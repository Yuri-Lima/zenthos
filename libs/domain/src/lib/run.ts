import type { GateResult } from './gate.js';
import { NO_TOKENS, type TokenUsage } from './implementation.js';
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
  history: RunHistoryEntry[];
  /** Set once the spec writer has produced a draft. */
  spec?: Spec;
  /** Results of the last gate run. */
  gates?: GateResult[];
  /** Set once the merge request is open. */
  pullRequestUrl?: string;
  /** The branch the implementation was pushed to, set even when the run escalates, so work is never lost. */
  branch?: string;
};

/** Uses Web Crypto so this file stays free of node imports and can be bundled into a Temporal workflow. */
export function createRun(ticket: Ticket, now: Date = new Date()): Run {
  return {
    id: globalThis.crypto.randomUUID(),
    ticket,
    state: 'intake',
    createdAt: now.toISOString(),
    estimatedCostUsd: 0,
    tokens: NO_TOKENS,
    history: [],
  };
}

export function applyEvent(run: Run, event: RunEvent, now: Date = new Date()): Run {
  const to = transition(run.state, event);
  const entry: RunHistoryEntry = { event, from: run.state, to, at: now.toISOString() };
  return { ...run, state: to, history: [...run.history, entry] };
}
