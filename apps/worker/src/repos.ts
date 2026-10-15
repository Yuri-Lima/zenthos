import { repoProfile, type RepoProfile } from '@zenthos/domain';

/**
 * The repositories ZenthOs may work on. One entry per repo, nothing else decides what the agent or
 * the gates may run. Ticket keys select the profile by prefix (`owner/name#123`).
 */
export const REPO_PROFILES: RepoProfile[] = [
  repoProfile({
    repo: 'nairaromero/mara-sandra-connect',
    cloneUrl: 'https://github.com/nairaromero/mara-sandra-connect.git',
    baseBranch: 'staging',
    allowedCommands: ['bun install', 'bun run lint', 'bun run format:check'],
    gateCommands: ['bun install', 'bun run lint', 'bun run format:check'],
    policy: { costCeilingUsd: 25, forbiddenPathPrefixes: ['planning/sql-migrations/', 'supabase/', '.github/workflows/'] },
  }),
  /** Dry runs: `pnpm cli run memory#1` with the in-memory adapters. */
  repoProfile({
    repo: 'memory',
    cloneUrl: 'memory',
    baseBranch: 'main',
    allowedCommands: ['echo ok'],
    gateCommands: ['echo ok'],
  }),
];
