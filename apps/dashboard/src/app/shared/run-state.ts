import type { Run } from '../core/runs';

type Severity = 'success' | 'info' | 'warn' | 'danger' | 'secondary';

/** How a state reads at a glance; the names come from the domain's state machine. */
export const STATE_SEVERITY: Record<Run['state'], Severity> = {
  intake: 'secondary',
  spec_drafted: 'warn',
  spec_approved: 'info',
  implemented: 'info',
  gates_passed: 'info',
  mr_opened: 'info',
  reviewed: 'success',
  verified: 'success',
  done: 'success',
  failed: 'danger',
  needs_human: 'warn',
};

export const RUN_STATES = Object.keys(STATE_SEVERITY) as Run['state'][];

/** The one state a person decides on from the dashboard. */
export const awaitsDecision = (run: Run) => run.state === 'spec_drafted';

export const usd = (value: number) => new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(value);
