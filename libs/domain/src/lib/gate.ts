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
  /** Why it failed, in words a ticket comment can show. Absent when passed. */
  detail?: string;
};

export const pass = (gate: Gate): GateResult => ({ gate, passed: true });

export const fail = (gate: Gate, detail: string): GateResult => ({
  gate,
  passed: false,
  detail,
});
