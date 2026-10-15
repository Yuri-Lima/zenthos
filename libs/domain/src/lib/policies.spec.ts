import { checkCostCeiling, checkDiffBudget, checkForbiddenPaths, checkSecrets, DEFAULT_POLICY } from './policies.js';

describe('policies', () => {
  it('passes a run under the cost ceiling and fails one over it', () => {
    expect(checkCostCeiling(14.99, DEFAULT_POLICY).passed).toBe(true);
    expect(checkCostCeiling(15.01, DEFAULT_POLICY)).toEqual({
      gate: 'cost_ceiling',
      passed: false,
      detail: 'estimated 15.01 USD at list price, ceiling is 15 USD',
    });
  });

  it('passes a diff inside the budget and fails one outside it', () => {
    expect(checkDiffBudget(800, DEFAULT_POLICY).passed).toBe(true);
    expect(checkDiffBudget(801, DEFAULT_POLICY).passed).toBe(false);
  });

  it('names the kind of secret it finds in a diff', () => {
    expect(checkSecrets('+const x = 1;').passed).toBe(true);
    expect(checkSecrets('+token = "ghp_abcdefghijklmnopqrstuvwxyz0123"')).toEqual({
      gate: 'secret_scan',
      passed: false,
      detail: 'diff contains what looks like: GitHub token',
    });
  });

  it('names every forbidden path it finds', () => {
    const result = checkForbiddenPaths(
      ['src/a.ts', 'migrations/001.sql', '.github/workflows/ci.yml'],
      DEFAULT_POLICY,
    );
    expect(result).toEqual({
      gate: 'forbidden_paths',
      passed: false,
      detail: 'paths need human approval: migrations/001.sql, .github/workflows/ci.yml',
    });
  });
});
