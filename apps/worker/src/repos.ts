import { DRY_RUN_WORKSPACE, repoProfile, type RepoProfile } from '@zenthos/domain';

/**
 * The repositories ZenthOs may work on when it runs without Postgres. One entry per repo, nothing else decides
 * what the agent or the gates may run. Ticket keys select the profile by prefix (`owner/name#123`). They belong
 * to the dry-run workspace (ADR 019); with Postgres, profiles come from the dashboard and its workspaces.
 */
export const REPO_PROFILES: RepoProfile[] = [
  repoProfile({
    repo: 'nairaromero/mara-sandra-connect',
    cloneUrl: 'https://github.com/nairaromero/mara-sandra-connect.git',
    baseBranch: 'staging',
    allowedCommands: ['bun install', 'bun run lint', 'bun run format:check'],
    gateCommands: ['bun install', 'bun run lint', 'bun run format:check'],
    policy: { costCeilingUsd: 25, forbiddenPathPrefixes: ['planning/sql-migrations/', 'supabase/', '.github/workflows/'] },
    workspaceId: DRY_RUN_WORKSPACE.id,
  }),
  /** Dry runs: `pnpm cli run memory#1` with the in-memory adapters. */
  repoProfile({
    repo: 'memory',
    cloneUrl: 'memory',
    baseBranch: 'main',
    allowedCommands: ['echo ok'],
    gateCommands: ['echo ok'],
    workspaceId: DRY_RUN_WORKSPACE.id,
  }),
];
