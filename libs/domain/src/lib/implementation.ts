import type { RepoProfile } from './repo-profile.js';

/** An isolated checkout of the target repository on a branch of its own. */
export type Workspace = {
  id: string;
  /** Absolute path on the worker that prepared it. Activities that use it must run on that worker. */
  path: string;
  repo: RepoProfile['repo'];
  baseBranch: string;
  branch: string;
};

export type CommandResult = {
  command: string;
  exitCode: number;
  stdout: string;
  stderr: string;
};

export type Diff = {
  files: string[];
  changedLines: number;
  patch: string;
};

/** Token counts as the model reports them. Cached tokens are counted separately because they are priced separately. */
export type TokenUsage = {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
};

export const NO_TOKENS: TokenUsage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };

export const addTokens = (a: TokenUsage, b: TokenUsage): TokenUsage => ({
  inputTokens: a.inputTokens + b.inputTokens,
  outputTokens: a.outputTokens + b.outputTokens,
  cacheReadTokens: a.cacheReadTokens + b.cacheReadTokens,
  cacheWriteTokens: a.cacheWriteTokens + b.cacheWriteTokens,
});

/**
 * What a coding agent reports back. The diff is read from the sandbox, not trusted from the agent.
 * `estimatedCostUsd` is the agent's own estimate at list price, never a bill: under a subscription
 * nothing is charged, and under an API key the invoice is the Console's number, not this one.
 */
export type Implementation = {
  summary: string;
  estimatedCostUsd: number;
  tokens: TokenUsage;
};

export type PullRequest = {
  url: string;
  number: number;
};
