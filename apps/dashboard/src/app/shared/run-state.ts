import { GATE_RETRYABLE, RUN_STATES, TRANSITIONS, type GateResult, type Run, type RunEvent, type RunState } from '@zenthos/domain';

export type Severity = 'good' | 'info' | 'warn' | 'crit' | 'neutral';

/** How each domain state reads at a glance: severity drives the colour, the icon and the label carry the meaning without it. */
export const STATE_META: Record<RunState, { severity: Severity; icon: string }> = {
  intake: { severity: 'neutral', icon: 'inbox' },
  spec_drafted: { severity: 'warn', icon: 'rate_review' },
  spec_approved: { severity: 'info', icon: 'task_alt' },
  implemented: { severity: 'info', icon: 'code' },
  gates_passed: { severity: 'info', icon: 'verified' },
  mr_opened: { severity: 'info', icon: 'merge' },
  reviewed: { severity: 'good', icon: 'fact_check' },
  verified: { severity: 'good', icon: 'done_all' },
  done: { severity: 'good', icon: 'check_circle' },
  failed: { severity: 'crit', icon: 'error' },
  needs_human: { severity: 'warn', icon: 'person_alert' },
};

/** The states a person acts on: a drafted spec waits for a decision; needs_human waits for anyone. */
export const ATTENTION_STATES: RunState[] = ['spec_drafted', 'needs_human'];
export const IN_FLIGHT_STATES: RunState[] = ['intake', 'spec_approved', 'implemented', 'gates_passed', 'mr_opened'];

/** The canonical path, in the order the domain declares its states; the two off-ramps are drawn as exits, not steps. */
export const PATH_STATES: RunState[] = RUN_STATES.filter((s) => s !== 'failed' && s !== 'needs_human');
export const OFF_RAMPS: RunState[] = ['needs_human', 'failed'];
export { RUN_STATES, TRANSITIONS };

export const awaitsDecision = (run: Run) => run.state === 'spec_drafted';
export const usd = (value: number) => new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(value);

export type Step = { state: RunState; status: 'done' | 'current' | 'pending' | 'skipped'; visits: number; lastAt?: string; by?: string };

/**
 * The stepper for one run, derived from its history: a state is done when the run left it, current when the
 * run is in it, and visited more than once when a retry sent the run back. Nothing here is drawn by hand.
 */
export function stepsFor(run: Run): Step[] {
  const visits = new Map<RunState, { count: number; lastAt?: string; by?: string }>([['intake', { count: 1, lastAt: run.createdAt }]]);
  for (const entry of run.history) {
    const seen = visits.get(entry.to) ?? { count: 0 };
    visits.set(entry.to, { count: seen.count + 1, lastAt: entry.at, by: entry.by });
  }
  const currentIndex = PATH_STATES.indexOf(run.state);
  return PATH_STATES.map((state, index) => {
    const seen = visits.get(state);
    const status = state === run.state ? 'current' : seen ? 'done' : currentIndex >= 0 && index < currentIndex ? 'skipped' : 'pending';
    return { state, status, visits: seen?.count ?? 0, lastAt: seen?.lastAt, by: seen?.by };
  });
}

/** The edges of the state machine this run actually travelled, as "from->to" keys for the graph view. */
export function travelledEdges(run: Run): Set<string> {
  return new Set(run.history.map((e) => `${e.from}->${e.to}`));
}

/** Every edge of the machine, from the domain's transition table. */
export const MACHINE_EDGES: { from: RunState; to: RunState; event: RunEvent }[] = (Object.keys(TRANSITIONS) as RunState[]).flatMap((from) =>
  (Object.entries(TRANSITIONS[from]) as [RunEvent, RunState][]).map(([event, to]) => ({ from, to, event })),
);

export const gateSeverity = (gate: GateResult): Severity => (gate.passed ? (gate.detail ? 'neutral' : 'good') : GATE_RETRYABLE[gate.gate] ? 'warn' : 'crit');

export const minutesBetween = (from: string, to: string) => Math.max(0, Math.round((Date.parse(to) - Date.parse(from)) / 60_000));

/** "3 min", "2 h 05", "4 d 3 h": enough for a table; the exact time sits in the title attribute. */
export function duration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  if (minutes < 60 * 48) return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')}`;
  return `${Math.floor(minutes / 1440)} d ${Math.floor((minutes % 1440) / 60)} h`;
}

export const age = (iso: string, now = Date.now()): string => duration(Math.max(0, Math.round((now - Date.parse(iso)) / 60_000)));
