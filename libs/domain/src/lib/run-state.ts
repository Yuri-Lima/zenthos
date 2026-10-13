import { DomainError } from './errors.js';

export const RUN_STATES = [
  'intake',
  'spec_drafted',
  'spec_approved',
  'implemented',
  'gates_passed',
  'reviewed',
  'mr_opened',
  'verified',
  'done',
  'failed',
  'needs_human',
] as const;

export type RunState = (typeof RUN_STATES)[number];

export const RUN_EVENTS = [
  'spec_drafted',
  'spec_approved',
  'spec_rejected',
  'implemented',
  'gates_passed',
  'gates_failed',
  'review_passed',
  'review_failed',
  'mr_opened',
  'verified',
  'verification_failed',
  'merged',
  'escalated',
  'human_resumed',
  'human_abandoned',
  'failed',
] as const;

export type RunEvent = (typeof RUN_EVENTS)[number];

/**
 * The one definition of how a run moves. The worker, the API and the dashboard all read it.
 * `failed` is accepted from every non-terminal state and is handled in `transition`.
 */
export const TRANSITIONS: Readonly<
  Record<RunState, Partial<Record<RunEvent, RunState>>>
> = {
  intake: { spec_drafted: 'spec_drafted' },
  spec_drafted: { spec_approved: 'spec_approved', spec_rejected: 'intake' },
  spec_approved: { implemented: 'implemented' },
  implemented: {
    gates_passed: 'gates_passed',
    gates_failed: 'spec_approved',
    escalated: 'needs_human',
  },
  gates_passed: {
    review_passed: 'reviewed',
    review_failed: 'spec_approved',
    escalated: 'needs_human',
  },
  reviewed: { mr_opened: 'mr_opened' },
  mr_opened: { verified: 'verified', verification_failed: 'needs_human' },
  verified: { merged: 'done' },
  needs_human: { human_resumed: 'spec_approved', human_abandoned: 'failed' },
  done: {},
  failed: {},
};

export function isTerminal(state: RunState): boolean {
  return state === 'done' || state === 'failed';
}

export function transition(state: RunState, event: RunEvent): RunState {
  if (event === 'failed' && !isTerminal(state)) {
    return 'failed';
  }
  const next = TRANSITIONS[state][event];
  if (!next) {
    throw new DomainError('invalid_transition', { state, event });
  }
  return next;
}
