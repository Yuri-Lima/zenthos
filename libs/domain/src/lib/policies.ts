import { fail, pass, type GateResult } from './gate.js';

/** Limits enforced per run by deterministic code, never by a prompt. */
export type RunPolicy = {
  costCeilingUsd: number;
  diffBudgetLines: number;
  /** Any changed path starting with one of these needs a human approval. */
  forbiddenPathPrefixes: string[];
};

export const DEFAULT_POLICY: RunPolicy = {
  costCeilingUsd: 5,
  diffBudgetLines: 800,
  forbiddenPathPrefixes: ['migrations/', '.github/workflows/'],
};

export function checkCostCeiling(costUsd: number, policy: RunPolicy): GateResult {
  return costUsd <= policy.costCeilingUsd
    ? pass('cost_ceiling')
    : fail('cost_ceiling', `spent ${costUsd} USD, ceiling is ${policy.costCeilingUsd} USD`);
}

export function checkDiffBudget(changedLines: number, policy: RunPolicy): GateResult {
  return changedLines <= policy.diffBudgetLines
    ? pass('diff_budget')
    : fail('diff_budget', `${changedLines} changed lines, budget is ${policy.diffBudgetLines}`);
}

export function checkForbiddenPaths(changedPaths: string[], policy: RunPolicy): GateResult {
  const hits = changedPaths.filter((path) =>
    policy.forbiddenPathPrefixes.some((prefix) => path.startsWith(prefix)),
  );
  return hits.length === 0
    ? pass('forbidden_paths')
    : fail('forbidden_paths', `paths need human approval: ${hits.join(', ')}`);
}
