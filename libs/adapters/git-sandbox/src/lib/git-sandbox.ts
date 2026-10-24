import { execFile } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { DomainError, isCommandAllowed, isPipelineBranch, type CommandResult, type Diff, type GitAuthor, type RepoProfile, type Checkout } from '@zenthos/domain';
import type { RepoProfilesPort, SandboxPort } from '@zenthos/ports';

const run = promisify(execFile);

export type GitSandboxOptions = {
  /** Directory that holds one subdirectory per checkout. */
  root: string;
  /** Every repository this worker may work on; a checkout names its repo and the profile is looked up here. */
  profiles: RepoProfilesPort;
  /**
   * A token for the repository, asked for right before each clone and each push so short-lived
   * installation tokens stay valid. Undefined for local or public pulls.
   */
  credential?: (profile: RepoProfile) => Promise<string | undefined>;
  /** Who commits are attributed to, from the provider's own identity. Without it, a name that links to no account. */
  author?: (profile: RepoProfile) => Promise<GitAuthor>;
  /** Seconds a single command may run. */
  commandTimeoutSeconds?: number;
};

/** Links to no GitHub account: the domain is not GitHub's no-reply domain. */
const UNLINKED_AUTHOR: GitAuthor = { name: 'ZenthOs', email: 'zenthos@pipeline.invalid' };

/**
 * A fresh shallow clone per run, on its own branch. The allowlist is checked here as well as in the
 * coding agent, so a command the agent was not allowed to run cannot slip in through a gate either.
 */
export class GitSandbox implements SandboxPort {
  constructor(private readonly options: GitSandboxOptions) {}

  async prepare(profile: RepoProfile, branch: string): Promise<Checkout> {
    const dir = await mkdtemp(path.join(this.options.root, 'ws-'));
    await git(this.options.root, ['clone', '--quiet', '--depth', '50', '--branch', profile.baseBranch, await this.remoteUrl(profile), dir]);
    await git(dir, ['checkout', '--quiet', '-b', branch]);
    return { id: path.basename(dir), path: dir, repo: profile.repo, baseBranch: profile.baseBranch, branch };
  }

  async run(checkout: Checkout, command: string): Promise<CommandResult> {
    if (!isCommandAllowed(command, (await this.profile(checkout)).allowedCommands)) {
      throw new DomainError('command_not_allowed', { command, repo: checkout.repo });
    }
    try {
      const { stdout, stderr } = await run('/bin/sh', ['-c', command], {
        cwd: checkout.path,
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

  async diff(checkout: Checkout): Promise<Diff> {
    await git(checkout.path, ['add', '--all']);
    const numstat = await git(checkout.path, ['diff', '--cached', '--numstat']);
    const rows = numstat.split('\n').filter(Boolean).map((line) => line.split('\t'));
    return {
      files: rows.map(([, , file]) => file),
      changedLines: rows.reduce((n, [added, deleted]) => n + (Number(added) || 0) + (Number(deleted) || 0), 0),
      patch: await git(checkout.path, ['diff', '--cached']),
    };
  }

  /**
   * Safe to retry: commits only when something is staged. Force-pushes, but only to a branch the
   * pipeline owns (`isPipelineBranch`), so a stale branch from an earlier escalated run of the same
   * ticket is replaced and no human branch can ever be overwritten.
   */
  async commitAndPush(checkout: Checkout, message: string): Promise<void> {
    if (!isPipelineBranch(checkout.branch)) throw new Error(`refusing to force-push to ${checkout.branch}: not a pipeline branch`);
    await git(checkout.path, ['add', '--all']);
    const staged = await git(checkout.path, ['diff', '--cached', '--quiet']).then(() => false, () => true);
    const profile = await this.profile(checkout);
    if (staged) {
      const author = (await this.options.author?.(profile)) ?? UNLINKED_AUTHOR;
      await git(checkout.path, ['-c', `user.name=${author.name}`, '-c', `user.email=${author.email}`, 'commit', '--quiet', '-m', message]);
    }
    await git(checkout.path, ['remote', 'set-url', 'origin', await this.remoteUrl(profile)]);
    await git(checkout.path, ['push', '--quiet', '--force', '--set-upstream', 'origin', checkout.branch]);
  }

  async cleanup(checkout: Checkout): Promise<void> {
    await rm(checkout.path, { recursive: true, force: true });
  }

  /** Looked up by repository, not by instance memory, so any worker on this host can continue a run. */
  private async profile(checkout: Checkout): Promise<RepoProfile> {
    const profile = await this.options.profiles.get(checkout.repo);
    if (!profile) throw new DomainError('unknown_repository', { repo: checkout.repo });
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
