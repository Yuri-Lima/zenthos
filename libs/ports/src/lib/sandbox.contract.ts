import assert from 'node:assert/strict';
import { DomainError, type RepoProfile, type Workspace } from '@zenthos/domain';
import type { SandboxPort } from './sandbox.port.js';

export type SandboxFixture = {
  port: SandboxPort;
  /** Must allow exactly one harmless command that exits 0, listed first in allowedCommands. */
  profile: RepoProfile;
  /** Makes a change inside the workspace the way an agent would. */
  change(workspace: Workspace): Promise<void>;
};

export const sandboxContract: Record<string, (fixture: SandboxFixture) => Promise<void>> = {
  'prepare gives a workspace on the requested branch': async ({ port, profile }) => {
    const workspace = await port.prepare(profile, 'zenthos/test');
    assert.equal(workspace.branch, 'zenthos/test');
    assert.equal(workspace.baseBranch, profile.baseBranch);
    await port.cleanup(workspace);
  },
  'run executes an allowed command and refuses any other': async ({ port, profile }) => {
    const workspace = await port.prepare(profile, 'zenthos/test');
    const result = await port.run(workspace, profile.allowedCommands[0]);
    assert.equal(result.exitCode, 0);
    await assert.rejects(
      port.run(workspace, 'rm -rf /'),
      (error: unknown) => error instanceof DomainError && error.code === 'command_not_allowed',
    );
    await port.cleanup(workspace);
  },
  'diff reports the files and lines a change touched': async ({ port, profile, change }) => {
    const workspace = await port.prepare(profile, 'zenthos/test');
    assert.deepEqual((await port.diff(workspace)).files, []);
    await change(workspace);
    const diff = await port.diff(workspace);
    assert.ok(diff.files.length > 0);
    assert.ok(diff.changedLines > 0);
    await port.cleanup(workspace);
  },
};
