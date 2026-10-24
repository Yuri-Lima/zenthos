import assert from 'node:assert/strict';
import type { RepoProfile, Spec } from '@zenthos/domain';
import type { CodingAgentPort } from './coding-agent.port.js';
import type { SandboxPort } from './sandbox.port.js';

export type CodingAgentFixture = { port: CodingAgentPort; sandbox: SandboxPort; profile: RepoProfile; spec: Spec };

export const codingAgentContract: Record<string, (fixture: CodingAgentFixture) => Promise<void>> = {
  'implement changes the checkout, says what it did, and reports what it cost': async ({ port, sandbox, profile, spec }) => {
    const checkout = await sandbox.prepare(profile, 'zenthos/contract');
    try {
      const implementation = await port.implement({ checkout, spec, profile });
      assert.ok(implementation.summary.length > 0);
      assert.ok(implementation.estimatedCostUsd >= 0 && implementation.tokens.inputTokens >= 0);
      const diff = await sandbox.diff(checkout);
      assert.ok(diff.files.length > 0, 'the agent left no change in the checkout');
    } finally {
      await sandbox.cleanup(checkout);
    }
  },
};
