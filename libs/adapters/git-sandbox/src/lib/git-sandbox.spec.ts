import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { repoProfile } from '@zenthos/domain';
import { sandboxContract } from '@zenthos/ports';
import { GitSandbox } from './git-sandbox.js';

const exec = promisify(execFile);
const git = (cwd: string, ...args: string[]) => exec('git', args, { cwd });

/** A bare "origin" with one commit on `staging`, like a real remote, but on disk. */
async function createOrigin(root: string): Promise<string> {
  const origin = path.join(root, 'origin.git');
  const seed = path.join(root, 'seed');
  await exec('git', ['init', '--quiet', '--bare', '--initial-branch=staging', origin]);
  await exec('git', ['clone', '--quiet', origin, seed]);
  await writeFile(path.join(seed, 'README.md'), '# seed\n');
  await git(seed, 'add', 'README.md');
  await git(seed, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '--quiet', '-m', 'seed');
  await git(seed, 'push', '--quiet', 'origin', 'HEAD:staging');
  return origin;
}

describe('GitSandbox', () => {
  let root: string;
  let origin: string;
  let profile: ReturnType<typeof repoProfile>;

  beforeAll(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'zenthos-git-'));
    origin = await createOrigin(root);
    profile = repoProfile({ repo: 'local/origin', cloneUrl: origin, baseBranch: 'staging', allowedCommands: ['echo ok', 'cat README.md'], gateCommands: ['echo ok'] });
  });

  afterAll(() => rm(root, { recursive: true, force: true }));

  for (const [name, check] of Object.entries(sandboxContract)) {
    it(name, () =>
      check({
        port: new GitSandbox({ root, profiles: [profile] }),
        profile,
        change: (workspace) => writeFile(path.join(workspace.path, 'feature.ts'), 'export const feature = true;\n'),
      }),
    );
  }

  it('commits and pushes the branch to origin, and leaves the base branch alone', async () => {
    const sandbox = new GitSandbox({ root, profiles: [profile] });
    const workspace = await sandbox.prepare(profile, 'zenthos/local-origin-1');
    await writeFile(path.join(workspace.path, 'feature.ts'), 'export const feature = true;\n');
    await sandbox.commitAndPush(workspace, 'Add feature (local/origin#1)');
    const { stdout } = await git(origin, 'branch', '--list');
    expect(stdout).toContain('zenthos/local-origin-1');
    const { stdout: log } = await git(origin, 'log', '--oneline', 'staging');
    expect(log.trim().split('\n')).toHaveLength(1);
    await sandbox.cleanup(workspace);
  });

  it('can be retried after a failed push and replaces a stale branch of the same name', async () => {
    const sandbox = new GitSandbox({ root, profiles: [profile] });
    const stale = await sandbox.prepare(profile, 'zenthos/local-origin-2');
    await writeFile(path.join(stale.path, 'old.ts'), 'export const old = true;\n');
    await sandbox.commitAndPush(stale, 'WIP from an escalated run');
    await sandbox.cleanup(stale);

    const fresh = await sandbox.prepare(profile, 'zenthos/local-origin-2');
    await writeFile(path.join(fresh.path, 'new.ts'), 'export const fresh = true;\n');
    await sandbox.commitAndPush(fresh, 'Real change');
    // A retry of the same step finds nothing new to commit and must still succeed.
    await sandbox.commitAndPush(fresh, 'Real change');
    const { stdout } = await git(origin, 'ls-tree', '--name-only', 'zenthos/local-origin-2');
    expect(stdout).toContain('new.ts');
    expect(stdout).not.toContain('old.ts');
    await sandbox.cleanup(fresh);
  });

  it('returns a non-zero exit code instead of throwing when an allowed command fails', async () => {
    const failing = repoProfile({ ...profile, allowedCommands: ['exit 3'], gateCommands: [] });
    const sandbox = new GitSandbox({ root, profiles: [failing] });
    const workspace = await sandbox.prepare(failing, 'zenthos/fail');
    expect((await sandbox.run(workspace, 'exit 3')).exitCode).toBe(3);
    await sandbox.cleanup(workspace);
  });
});
