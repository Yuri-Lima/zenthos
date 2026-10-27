import assert from 'node:assert/strict';
import { createConnection, repoProfile, withInstallation, type ProviderConnection } from '@zenthos/domain';
import type { ProviderConnectionsPort } from './provider-connections.port.js';
import type { RepoProfilesPort } from './repo-profiles.port.js';

const WORKSPACE_A = '00000000-0000-4000-8000-0000000000a1';
const WORKSPACE_B = '00000000-0000-4000-8000-0000000000b2';

/** `null` for the platform app, which no workspace owns. */
export const sampleConnection = (workspaceId: string | null = WORKSPACE_A, appId = '424242'): ProviderConnection =>
  createConnection({
    provider: 'github',
    name: 'zenthos-test',
    credentials: { type: 'github-app', appId, privateKey: '-----BEGIN RSA PRIVATE KEY-----\ntest\n-----END RSA PRIVATE KEY-----' },
    app: { slug: 'zenthos-test', webhookSecret: 'whs', clientId: 'Iv1.test', clientSecret: 'cs' },
    ...(workspaceId ? { workspaceId } : {}),
  });

export const providerConnectionsContract: Record<string, (port: ProviderConnectionsPort) => Promise<void>> = {
  'a saved connection comes back whole, by id and by app id, and save replaces': async (port) => {
    const connection = sampleConnection();
    await port.save(connection);
    assert.deepEqual(await port.get(connection.id), connection);
    assert.deepEqual(await port.findByAppId('424242'), connection);
    const updated = withInstallation(connection, { installationId: 7, account: 'owner', repositories: ['owner/repo'] });
    await port.save(updated);
    assert.deepEqual((await port.get(connection.id))?.installations, updated.installations);
    assert.ok((await port.list(WORKSPACE_A)).some((c) => c.id === connection.id));
    await port.remove(connection.id);
    assert.equal(await port.get(connection.id), undefined);
  },

  'the platform app is the app connection no workspace owns': async (port) => {
    const platform = sampleConnection(null, '424246');
    await port.save(platform);
    assert.equal((await port.platformApp())?.id, platform.id);
    await port.remove(platform.id);
    assert.equal(await port.platformApp(), undefined);
  },

  'a workspace lists only its own connections': async (port) => {
    const mine = sampleConnection(WORKSPACE_A, '424243');
    const theirs = sampleConnection(WORKSPACE_B, '424244');
    await port.save(mine);
    await port.save(theirs);
    assert.ok((await port.list(WORKSPACE_A)).every((c) => c.workspaceId === WORKSPACE_A));
    assert.ok(!(await port.list(WORKSPACE_A)).some((c) => c.id === theirs.id));
    assert.ok((await port.list(WORKSPACE_B)).some((c) => c.id === theirs.id));
    await port.remove(mine.id);
    await port.remove(theirs.id);
  },
};

export const repoProfilesContract: Record<string, (port: RepoProfilesPort) => Promise<void>> = {
  'a saved profile comes back whole and save replaces': async (port) => {
    const profile = repoProfile({ repo: `owner/contract-${Date.now()}`, cloneUrl: 'https://example.test/x.git', baseBranch: 'main', allowedCommands: ['echo ok'], gateCommands: ['echo ok'], policy: { costCeilingUsd: 3 }, workspaceId: WORKSPACE_A });
    await port.save(profile);
    assert.deepEqual(await port.get(profile.repo), profile);
    const updated = { ...profile, baseBranch: 'develop' };
    await port.save(updated);
    assert.equal((await port.get(profile.repo))?.baseBranch, 'develop');
    assert.ok((await port.list(WORKSPACE_A)).some((p) => p.repo === profile.repo));
    await port.remove(profile.repo);
    assert.equal(await port.get(profile.repo), undefined);
  },

  'a workspace lists only its own profiles': async (port) => {
    const stamp = Date.now();
    const mine = repoProfile({ repo: `owner/mine-${stamp}`, cloneUrl: 'x', baseBranch: 'main', allowedCommands: [], gateCommands: [], workspaceId: WORKSPACE_A });
    const theirs = repoProfile({ repo: `owner/theirs-${stamp}`, cloneUrl: 'x', baseBranch: 'main', allowedCommands: [], gateCommands: [], workspaceId: WORKSPACE_B });
    await port.save(mine);
    await port.save(theirs);
    assert.ok((await port.list(WORKSPACE_A)).some((p) => p.repo === mine.repo));
    assert.ok(!(await port.list(WORKSPACE_A)).some((p) => p.repo === theirs.repo));
    await port.remove(mine.repo);
    await port.remove(theirs.repo);
  },
};
