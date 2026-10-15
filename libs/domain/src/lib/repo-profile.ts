import { DomainError } from './errors.js';
import { DEFAULT_POLICY, TOOLING_PATH_PREFIXES, type RunPolicy } from './policies.js';

/**
 * Everything the pipeline needs to know about one target repository. One profile per repo,
 * declared once in the worker (apps/worker/src/repos.ts); the sandbox and the coding agent both
 * enforce `allowedCommands` through `isCommandAllowed`.
 */
export type RepoProfile = {
  /** Ticket keys start with this, e.g. "owner/name" for GitHub. */
  repo: string;
  cloneUrl: string;
  /** Branch runs start from and merge requests target. */
  baseBranch: string;
  /** Exact command lines the agent and the gates may run in the sandbox. Nothing else runs. */
  allowedCommands: string[];
  /** Subset of allowedCommands that must exit 0 before a merge request opens. */
  gateCommands: string[];
  policy: RunPolicy;
};

export function repoProfile(profile: Omit<RepoProfile, 'policy'> & { policy?: Partial<RunPolicy> }): RepoProfile {
  const gateNotAllowed = profile.gateCommands.filter((command) => !profile.allowedCommands.includes(command));
  if (gateNotAllowed.length > 0) {
    throw new Error(`gate commands must be allowed commands: ${gateNotAllowed.join(', ')}`);
  }
  const policy = { ...DEFAULT_POLICY, ...profile.policy };
  return { ...profile, policy: { ...policy, forbiddenPathPrefixes: [...new Set([...TOOLING_PATH_PREFIXES, ...policy.forbiddenPathPrefixes])] } };
}

const collapse = (command: string) => command.trim().replace(/\s+/g, ' ');

/** Exact match after whitespace normalisation. No globs, no prefixes: an allowlist you can read. */
export function isCommandAllowed(command: string, allowedCommands: readonly string[]): boolean {
  const wanted = collapse(command);
  return allowedCommands.some((allowed) => collapse(allowed) === wanted);
}

export function profileForTicket(key: string, profiles: readonly RepoProfile[]): RepoProfile {
  const profile = profiles.find((candidate) => key.startsWith(`${candidate.repo}#`));
  if (!profile) throw new DomainError('unknown_repository', { key });
  return profile;
}

/** Every branch the pipeline creates starts with this; it force-pushes only there and nowhere else. */
export const PIPELINE_BRANCH_PREFIX = 'zenthos/';

export const isPipelineBranch = (branch: string): boolean => branch.startsWith(PIPELINE_BRANCH_PREFIX);

/** Branch a run works on. Ticket keys carry "/" and "#", which git refs reject. */
export function branchNameFor(ticketKey: string): string {
  return `${PIPELINE_BRANCH_PREFIX}${ticketKey.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;
}
