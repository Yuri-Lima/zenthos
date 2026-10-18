import { z } from 'zod';
import { DomainError } from './errors.js';
import { DEFAULT_POLICY, RunPolicySchema, TOOLING_PATH_PREFIXES, type RunPolicy } from './policies.js';

/**
 * Everything the pipeline needs to know about one target repository. One profile per repo, kept in
 * the repository-profiles store (ADR 006; the dry run seeds it from apps/worker/src/repos.ts); the
 * sandbox and the coding agent both enforce `allowedCommands` through `isCommandAllowed`.
 */
export const RepoProfileSchema = z.object({
  /** Ticket keys start with this, e.g. "owner/name" for GitHub. */
  repo: z.string().min(1),
  cloneUrl: z.string().min(1),
  /** Branch runs start from and merge requests target. */
  baseBranch: z.string().min(1),
  /** Exact command lines the agent and the gates may run in the sandbox. Nothing else runs. */
  allowedCommands: z.array(z.string().min(1)),
  /** Subset of allowedCommands that must exit 0 before a merge request opens. */
  gateCommands: z.array(z.string().min(1)),
  policy: RunPolicySchema,
  /** The provider connection whose credentials act on this repository; absent for in-memory dry runs. */
  connectionId: z.uuid().optional(),
});

export type RepoProfile = z.infer<typeof RepoProfileSchema>;

export function repoProfile(profile: Omit<RepoProfile, 'policy'> & { policy?: Partial<RunPolicy> }): RepoProfile {
  const gateNotAllowed = profile.gateCommands.filter((command) => !profile.allowedCommands.includes(command));
  if (gateNotAllowed.length > 0) {
    throw new DomainError('invalid_profile', { reason: 'gate commands must be allowed commands', gateNotAllowed });
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

/** The repository a ticket key names: everything before the last "#". */
export function repoOfTicket(key: string): string {
  const hash = key.lastIndexOf('#');
  if (hash <= 0) throw new DomainError('invalid_ticket', { key, reason: 'expected owner/repo#number' });
  return key.slice(0, hash);
}

/** Every branch the pipeline creates starts with this; it force-pushes only there and nowhere else. */
export const PIPELINE_BRANCH_PREFIX = 'zenthos/';

export const isPipelineBranch = (branch: string): boolean => branch.startsWith(PIPELINE_BRANCH_PREFIX);

/** Branch a run works on. Ticket keys carry "/" and "#", which git refs reject. */
export function branchNameFor(ticketKey: string): string {
  return `${PIPELINE_BRANCH_PREFIX}${ticketKey.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;
}
