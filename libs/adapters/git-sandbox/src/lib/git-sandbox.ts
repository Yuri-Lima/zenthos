import { execFile } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { DomainError, isCommandAllowed, type CommandResult, type Diff, type RepoProfile, type Workspace } from '@zenthos/domain';
import type { SandboxPort } from '@zenthos/ports';

const run = promisify(execFile);

export type GitSandboxOptions = {
  /** Directory that holds one subdirectory per workspace. */
  root: string;
  /** Every repository this worker may work on; a workspace names its repo and the profile is looked up here. */
  profiles: readonly RepoProfile[];
  /**
   * A token for the repository, asked for right before each clone and each push so short-lived
   * installation tokens stay valid. Undefined for local or public pulls.
   */
  credential?: (profile: RepoProfile) => Promise<string | undefined>;
  /** Seconds a single command may run. */
  commandTimeoutSeconds?: number;
};

/**
 * A fresh shallow clone per run, on its own branch. The allowlist is checked here as well as in the
 * coding agent, so a command the agent was not allowed to run cannot slip in through a gate either.
 */
export class GitSandbox implements SandboxPort {
  constructor(private readonly options: GitSandboxOptions) {}

  async prepare(profile: RepoProfile, branch: string): Promise<Workspace> {
    const dir = await mkdtemp(path.join(this.options.root, 'ws-'));
    await git(this.options.root, ['clone', '--quiet', '--depth', '50', '--branch', profile.baseBranch, await this.remoteUrl(profile), dir]);
    await git(dir, ['checkout', '--quiet', '-b', branch]);
    return { id: path.basename(dir), path: dir, repo: profile.repo, baseBranch: profile.baseBranch, branch };
  }

  async run(workspace: Workspace, command: string): Promise<CommandResult> {
    if (!isCommandAllowed(command, this.profile(workspace).allowedCommands)) {
      throw new DomainError('command_not_allowed', { command, repo: workspace.repo });
    }
    try {
      const { stdout, stderr } = await run('/bin/sh', ['-c', command], {
        cwd: workspace.path,
        timeout: (this.options.commandTimeoutSeconds ?? 900) * 1000,
        maxBuffer: 16 * 1024 * 1024,
        env: { ...process.env, CI: '1', GIT_TERMINAL_PROMPT: '0' },
      });
      return { command, exitCode: 0, stdout, stderr };
    } catch (error) {
      const failed = error as { code?: number | string; stdout?: string; stderr?: string };
      return { command, exitCode: typeof failed.code === 'number' ? failed.code : 1, stdout: failed.stdout ?? '', stderr: failed.stderr ?? String(error) };
    }
  }

  async diff(workspace: Workspace): Promise<Diff> {
    await git(workspace.path, ['add', '--all']);
    const numstat = await git(workspace.path, ['diff', '--cached', '--numstat']);
    const rows = numstat.split('\n').filter(Boolean).map((line) => line.split('\t'));
    return {
      files: rows.map(([, , file]) => file),
      changedLines: rows.reduce((n, [added, deleted]) => n + (Number(added) || 0) + (Number(deleted) || 0), 0),
      patch: await git(workspace.path, ['diff', '--cached']),
    };
  }

  /**
   * Safe to retry: commits only when something is staged, and force-pushes because the pipeline owns
   * every `zenthos/*` branch. A stale branch left by an earlier escalated run of the same ticket is
   * replaced, never merged into.
   */
  async commitAndPush(workspace: Workspace, message: string): Promise<void> {
    await git(workspace.path, ['add', '--all']);
    const staged = await git(workspace.path, ['diff', '--cached', '--quiet']).then(() => false, () => true);
    if (staged) {
      await git(workspace.path, ['-c', 'user.name=ZenthOs', '-c', 'user.email=zenthos@users.noreply.github.com', 'commit', '--quiet', '-m', message]);
    }
    await git(workspace.path, ['remote', 'set-url', 'origin', await this.remoteUrl(this.profile(workspace))]);
    await git(workspace.path, ['push', '--quiet', '--force', '--set-upstream', 'origin', workspace.branch]);
  }

  async cleanup(workspace: Workspace): Promise<void> {
    await rm(workspace.path, { recursive: true, force: true });
  }

  /** Looked up by repository, not by instance memory, so any worker on this host can continue a run. */
  private profile(workspace: Workspace): RepoProfile {
    const profile = this.options.profiles.find((candidate) => candidate.repo === workspace.repo);
    if (!profile) throw new DomainError('unknown_repository', { repo: workspace.repo });
    return profile;
  }

  private async remoteUrl(profile: RepoProfile): Promise<string> {
    return withToken(profile.cloneUrl, await this.options.credential?.(profile));
  }
}

async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await run('git', args, { cwd, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' }, maxBuffer: 16 * 1024 * 1024 });
  return stdout;
}

function withToken(cloneUrl: string, token?: string): string {
  if (!token || !cloneUrl.startsWith('https://')) return cloneUrl;
  return cloneUrl.replace('https://', `https://x-access-token:${encodeURIComponent(token)}@`);
}
