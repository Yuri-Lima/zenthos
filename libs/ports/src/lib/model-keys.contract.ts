import assert from 'node:assert/strict';
import type { ModelKeysPort, ModelProviderPort } from './model-keys.port.js';

export const modelKeysContract: Record<string, (port: ModelKeysPort, workspaceId: string) => Promise<void>> = {
  'a saved key comes back whole, saving again replaces it, and it is gone after removal': async (port, workspaceId) => {
    const key = { workspaceId, provider: 'anthropic' as const, apiKey: 'sk-ant-api03-contract-first', createdAt: '2026-10-27T10:00:00.000Z' };
    await port.save(key);
    assert.deepEqual(await port.get(workspaceId), key);
    const replaced = { ...key, apiKey: 'sk-ant-api03-contract-second', createdAt: '2026-10-27T11:00:00.000Z' };
    await port.save(replaced);
    assert.deepEqual(await port.get(workspaceId), replaced);
    await port.remove(workspaceId);
    assert.equal(await port.get(workspaceId), undefined);
  },
};

export const modelProviderContract: Record<string, (port: ModelProviderPort, fixture: { accepted: string; rejected: string }) => Promise<void>> = {
  'an accepted key verifies, a rejected one fails with the provider\'s error': async (port, { accepted, rejected }) => {
    await port.verify({ provider: 'anthropic', apiKey: accepted });
    await assert.rejects(port.verify({ provider: 'anthropic', apiKey: rejected }));
  },
};
