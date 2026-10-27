import type { ModelKey } from '@zenthos/domain';
import type { ModelKeysPort, ModelProviderPort } from '@zenthos/ports';
import { modelKeyStatusOf, removeModelKey, setModelKey } from './model-keys.js';

/** Map-backed fakes; the application layer may not import adapters, even in tests. */
class Keys implements ModelKeysPort {
  readonly byWorkspace = new Map<string, ModelKey>();
  get = async (workspaceId: string) => this.byWorkspace.get(workspaceId);
  save = async (key: ModelKey) => void this.byWorkspace.set(key.workspaceId, key);
  remove = async (workspaceId: string) => void this.byWorkspace.delete(workspaceId);
}
const provider: ModelProviderPort = { verify: async ({ apiKey }) => { if (apiKey.endsWith('bad')) throw new Error('invalid x-api-key'); } };
const W = '00000000-0000-4000-8000-0000000000a1';
const owner = { workspaceId: W, login: 'yuri', role: 'owner' as const };
const now = new Date('2026-10-27T10:00:00Z');

describe('model keys', () => {
  it('checks the key with the provider before storing it, shows only its status, replaces and removes it', async () => {
    const modelKeys = new Keys();
    const deps = { modelKeys, modelProvider: provider };
    expect(await modelKeyStatusOf(deps, W)).toEqual({ configured: false });
    await expect(setModelKey(deps, owner, 'sk-ant-api03-bad')).rejects.toMatchObject({ code: 'model_key_invalid', context: { reason: 'invalid x-api-key' } });
    expect(await modelKeyStatusOf(deps, W)).toEqual({ configured: false });
    expect(await setModelKey(deps, owner, 'sk-ant-api03-first-1234', now)).toEqual({ configured: true, provider: 'anthropic', last4: '1234', createdAt: now.toISOString() });
    expect((await modelKeys.get(W))?.apiKey).toBe('sk-ant-api03-first-1234');
    await setModelKey(deps, owner, 'sk-ant-api03-second-5678', now);
    expect((await modelKeyStatusOf(deps, W)).last4).toBe('5678');
    await removeModelKey(deps, owner);
    expect(await modelKeyStatusOf(deps, W)).toEqual({ configured: false });
  });

  it('members may neither enter nor remove a key', async () => {
    const deps = { modelKeys: new Keys(), modelProvider: provider };
    const member = { ...owner, role: 'member' as const };
    await expect(setModelKey(deps, member, 'sk-ant-api03-x')).rejects.toMatchObject({ code: 'forbidden' });
    await expect(removeModelKey(deps, member)).rejects.toMatchObject({ code: 'forbidden' });
  });
});
