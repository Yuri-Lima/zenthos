import { createRun, repoProfile, type Diff, type Ticket, type Workspace } from '@zenthos/domain';
import type { SandboxPort } from '@zenthos/ports';
import { gateFeedback, runGates } from './run-gates.js';

const profile = repoProfile({
  repo: 'owner/repo',
  cloneUrl: 'https://example.test/owner/repo.git',
  baseBranch: 'staging',
  allowedCommands: ['lint', 'test'],
  gateCommands: ['lint', 'test'],
});
const ticket: Ticket = { key: 'owner/repo#1', title: 't', body: '', url: 'https://example.test/1', labels: [] };
const workspace: Workspace = { id: 'w', path: '/tmp/w', repo: profile.repo, baseBranch: 'staging', branch: 'zenthos/owner-repo-1' };
const cleanDiff: Diff = { files: ['src/a.ts'], changedLines: 10, patch: '+const a = 1;' };

function sandboxFailing(command?: string) {
  const ran: string[] = [];
  const sandbox: SandboxPort = {
    prepare: async () => workspace,
    run: async (_w, cmd) => {
      ran.push(cmd);
      return { command: cmd, exitCode: cmd === command ? 1 : 0, stdout: '', stderr: cmd === command ? '3 problems' : '' };
    },
    diff: async () => cleanDiff,
    commitAndPush: async () => undefined,
    cleanup: async () => undefined,
  };
  return { sandbox, ran };
}

describe('runGates', () => {
  it('passes every gate and runs every gate command on a clean diff', async () => {
    const { sandbox, ran } = sandboxFailing();
    const gates = await runGates({ sandbox }, createRun(ticket), workspace, cleanDiff, profile);
    expect(gates.every((g) => g.passed)).toBe(true);
    expect(ran).toEqual(['lint', 'test']);
  });

  it('skips a command that already fails on the base branch and says so', async () => {
    const { sandbox, ran } = sandboxFailing('test');
    const gates = await runGates({ sandbox }, createRun(ticket), workspace, cleanDiff, profile, ['test']);
    expect(gates.every((g) => g.passed)).toBe(true);
    expect(ran).toEqual(['lint']);
    expect(gates.find((g) => g.detail?.includes('skipped'))?.detail).toContain('already fails on staging');
  });

  it('stops before the commands when a policy gate fails', async () => {
    const { sandbox, ran } = sandboxFailing();
    const diff: Diff = { ...cleanDiff, files: ['migrations/001.sql'] };
    const gates = await runGates({ sandbox }, createRun(ticket), workspace, diff, profile);
    expect(gates.find((g) => g.gate === 'forbidden_paths')?.passed).toBe(false);
    expect(ran).toEqual([]);
  });

  it('reports the failing command with its output and stops there', async () => {
    const { sandbox, ran } = sandboxFailing('lint');
    const gates = await runGates({ sandbox }, createRun(ticket), workspace, cleanDiff, profile);
    const ci = gates.find((g) => g.gate === 'ci');
    expect(ci?.passed).toBe(false);
    expect(ci?.detail).toContain('lint exited 1');
    expect(ran).toEqual(['lint']);
    expect(gateFeedback(gates)).toContain('3 problems');
  });
});
