import { fail, pass, type GateResult } from './gate.js';

/** Limits enforced per run by deterministic code, never by a prompt. */
export type RunPolicy = {
  costCeilingUsd: number;
  diffBudgetLines: number;
  /** Any changed path starting with one of these needs a human approval. */
  forbiddenPathPrefixes: string[];
  /** Implementation attempts before the run escalates; each retry sees the failed gates. */
  maxImplementRounds: number;
};

/**
 * Files that define the gates themselves. An agent that edits these to make a check pass has gamed
 * the gate, so they always need a human. Every profile includes them.
 */
export const TOOLING_PATH_PREFIXES = [
  'eslint.config',
  '.eslintrc',
  '.prettierrc',
  'prettier.config',
  'tsconfig',
  'package.json',
  'bun.lock',
  'pnpm-lock',
  'package-lock',
  'playwright.config',
  'jest.config',
  'vitest.config',
  '.github/workflows/',
];

export const DEFAULT_POLICY: RunPolicy = {
  /** A real ticket on a frontier model runs 5 to 15 USD; profiles raise this for larger repos. */
  costCeilingUsd: 15,
  diffBudgetLines: 800,
  forbiddenPathPrefixes: [...TOOLING_PATH_PREFIXES, 'migrations/'],
  maxImplementRounds: 2,
};

/** Shapes of credentials that must never land in a diff. Named so a gate message can say which. */
export const SECRET_PATTERNS: Record<string, RegExp> = {
  'Anthropic key': /sk-ant-[A-Za-z0-9_-]{10,}/,
  'GitHub token': /\bgh[pousr]_[A-Za-z0-9]{20,}/,
  'AWS access key': /\bAKIA[0-9A-Z]{16}\b/,
  'private key block': /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  'Supabase service key': /\beyJ[A-Za-z0-9_-]{20,}\.eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/,
};

export function checkSecrets(patch: string): GateResult {
  const hits = Object.entries(SECRET_PATTERNS)
    .filter(([, pattern]) => pattern.test(patch))
    .map(([name]) => name);
  return hits.length === 0
    ? pass('secret_scan')
    : fail('secret_scan', `diff contains what looks like: ${hits.join(', ')}`);
}

/** Judged on the estimate at list price, so the ceiling holds the same way under a subscription and under an API key. */
export function checkCostCeiling(estimatedCostUsd: number, policy: RunPolicy): GateResult {
  return estimatedCostUsd <= policy.costCeilingUsd
    ? pass('cost_ceiling')
    : fail('cost_ceiling', `estimated ${estimatedCostUsd} USD at list price, ceiling is ${policy.costCeilingUsd} USD`);
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
