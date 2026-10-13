import { checkCostCeiling, checkDiffBudget, checkForbiddenPaths, DEFAULT_POLICY } from './policies.js';

describe('policies', () => {
  it('passes a run under the cost ceiling and fails one over it', () => {
    expect(checkCostCeiling(4.99, DEFAULT_POLICY).passed).toBe(true);
    expect(checkCostCeiling(5.01, DEFAULT_POLICY)).toEqual({
      gate: 'cost_ceiling',
      passed: false,
      detail: 'spent 5.01 USD, ceiling is 5 USD',
    });
  });

  it('passes a diff inside the budget and fails one outside it', () => {
    expect(checkDiffBudget(800, DEFAULT_POLICY).passed).toBe(true);
    expect(checkDiffBudget(801, DEFAULT_POLICY).passed).toBe(false);
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
