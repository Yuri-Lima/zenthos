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
  costUsd: number;
  history: RunHistoryEntry[];
  /** Set once the spec writer has produced a draft. */
  spec?: Spec;
};

/** Uses Web Crypto so this file stays free of node imports and can be bundled into a Temporal workflow. */
export function createRun(ticket: Ticket, now: Date = new Date()): Run {
  return {
    id: globalThis.crypto.randomUUID(),
    ticket,
    state: 'intake',
    createdAt: now.toISOString(),
    costUsd: 0,
    history: [],
  };
}

export function applyEvent(run: Run, event: RunEvent, now: Date = new Date()): Run {
  const to = transition(run.state, event);
  const entry: RunHistoryEntry = { event, from: run.state, to, at: now.toISOString() };
  return { ...run, state: to, history: [...run.history, entry] };
}
