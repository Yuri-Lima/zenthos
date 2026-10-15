/** Every quality gate the pipeline can run, in the order they usually run. */
export const GATES = [
  'spec_schema',
  'approval',
  'sandbox_allowlist',
  'secret_scan',
  'forbidden_paths',
  'diff_budget',
  'cost_ceiling',
  'ci',
  'review_threshold',
] as const;

export type Gate = (typeof GATES)[number];

export type GateResult = {
  gate: Gate;
  passed: boolean;
  /** Why it failed, or why a passing result deserves a note (a command skipped because it fails on the base branch). */
  detail?: string;
};

/**
 * Whether another implementation round can fix a failure of this gate. A breached cost ceiling or a
 * missing approval cannot be coded around, so the run escalates to a human instead of retrying.
 */
export const GATE_RETRYABLE: Record<Gate, boolean> = {
  spec_schema: false,
  approval: false,
  sandbox_allowlist: true,
  secret_scan: true,
  forbidden_paths: true,
  diff_budget: true,
  cost_ceiling: false,
  ci: true,
  review_threshold: true,
};

export const canRetryAfter = (gates: GateResult[]): boolean =>
  gates.filter((gate) => !gate.passed).every((gate) => GATE_RETRYABLE[gate.gate]);

export const pass = (gate: Gate): GateResult => ({ gate, passed: true });

export const fail = (gate: Gate, detail: string): GateResult => ({
  gate,
  passed: false,
  detail,
});

/** Passed with a note: the check could not judge this change and says why. */
export const skipped = (gate: Gate, detail: string): GateResult => ({ gate, passed: true, detail });
