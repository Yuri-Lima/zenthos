import assert from 'node:assert/strict';
import { DomainError, type RepoProfile, type Checkout } from '@zenthos/domain';
import type { SandboxPort } from './sandbox.port.js';

export type SandboxFixture = {
  port: SandboxPort;
  /** Must allow exactly one harmless command that exits 0, listed first in allowedCommands. */
  profile: RepoProfile;
  /** Makes a change inside the checkout the way an agent would. */
  change(checkout: Checkout): Promise<void>;
};

export const sandboxContract: Record<string, (fixture: SandboxFixture) => Promise<void>> = {
  'prepare gives a checkout on the requested branch': async ({ port, profile }) => {
    const checkout = await port.prepare(profile, 'zenthos/test');
    assert.equal(checkout.branch, 'zenthos/test');
    assert.equal(checkout.baseBranch, profile.baseBranch);
    await port.cleanup(checkout);
  },
  'run executes an allowed command and refuses any other': async ({ port, profile }) => {
    const checkout = await port.prepare(profile, 'zenthos/test');
    const result = await port.run(checkout, profile.allowedCommands[0]);
    assert.equal(result.exitCode, 0);
    await assert.rejects(
      port.run(checkout, 'rm -rf /'),
      (error: unknown) => error instanceof DomainError && error.code === 'command_not_allowed',
    );
    await port.cleanup(checkout);
  },
  'diff reports the files and lines a change touched': async ({ port, profile, change }) => {
    const checkout = await port.prepare(profile, 'zenthos/test');
    assert.deepEqual((await port.diff(checkout)).files, []);
    await change(checkout);
    const diff = await port.diff(checkout);
    assert.ok(diff.files.length > 0);
    assert.ok(diff.changedLines > 0);
    await port.cleanup(checkout);
  },
};
