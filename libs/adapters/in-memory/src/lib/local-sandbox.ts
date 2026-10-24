import { mkdtemp, readdir, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DomainError, isCommandAllowed, type CommandResult, type Diff, type RepoProfile, type Checkout } from '@zenthos/domain';
import { InMemoryRepoProfiles } from './in-memory-stores.js';
import type { RepoProfilesPort, SandboxPort } from '@zenthos/ports';

/**
 * A sandbox with no git and no processes: an empty local temp directory. Commands are recorded and
 * succeed unless listed in `failing`; the diff is every file written since prepare. For tests and dry runs.
 */
export class LocalSandbox implements SandboxPort {
  readonly commands: string[] = [];
  readonly pushed: { checkout: Checkout; message: string }[] = [];

  constructor(
    private readonly profiles: RepoProfilesPort = new InMemoryRepoProfiles(),
    private readonly failing: Record<string, string> = {},
  ) {}

  async prepare(profile: RepoProfile, branch: string): Promise<Checkout> {
    const dir = await mkdtemp(path.join(tmpdir(), 'zenthos-memory-'));
    return { id: path.basename(dir), path: dir, repo: profile.repo, baseBranch: profile.baseBranch, branch };
  }

  async run(checkout: Checkout, command: string): Promise<CommandResult> {
    this.commands.push(command);
    const profile = await this.profiles.get(checkout.repo);
    if (!isCommandAllowed(command, profile?.allowedCommands ?? [])) throw new DomainError('command_not_allowed', { command });
    const stderr = this.failing[command];
    return { command, exitCode: stderr ? 1 : 0, stdout: '', stderr: stderr ?? '' };
  }

  async diff(checkout: Checkout): Promise<Diff> {
    const files = (await listFiles(checkout.path)).map((file) => path.relative(checkout.path, file));
    const contents = await Promise.all(files.map((file) => readFile(path.join(checkout.path, file), 'utf8')));
    const patch = contents.map((text, i) => `+++ ${files[i]}\n${text.split('\n').map((l) => `+${l}`).join('\n')}`).join('\n');
    return { files, changedLines: contents.reduce((n, text) => n + text.split('\n').length, 0), patch };
  }

  async commitAndPush(checkout: Checkout, message: string): Promise<void> {
    this.pushed.push({ checkout, message });
  }

  async cleanup(checkout: Checkout): Promise<void> {
    await rm(checkout.path, { recursive: true, force: true });
  }
}

async function listFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir);
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const full = path.join(dir, entry);
      return (await stat(full)).isDirectory() ? listFiles(full) : [full];
    }),
  );
  return nested.flat().sort();
}
