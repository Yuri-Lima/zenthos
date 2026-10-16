import assert from 'node:assert/strict';
import { createConnection, repoProfile, withInstallation, type ProviderConnection } from '@zenthos/domain';
import type { ProviderConnectionsPort } from './provider-connections.port.js';
import type { RepoProfilesPort } from './repo-profiles.port.js';

export const sampleConnection = (): ProviderConnection =>
  createConnection({
    provider: 'github',
    name: 'zenthos-test',
    credentials: { type: 'github-app', appId: '424242', privateKey: '-----BEGIN RSA PRIVATE KEY-----\ntest\n-----END RSA PRIVATE KEY-----' },
    app: { slug: 'zenthos-test', webhookSecret: 'whs', clientId: 'Iv1.test', clientSecret: 'cs' },
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
    assert.ok((await port.list()).some((c) => c.id === connection.id));
    await port.remove(connection.id);
    assert.equal(await port.get(connection.id), undefined);
  },
};

export const repoProfilesContract: Record<string, (port: RepoProfilesPort) => Promise<void>> = {
  'a saved profile comes back whole and save replaces': async (port) => {
    const profile = repoProfile({ repo: `owner/contract-${Date.now()}`, cloneUrl: 'https://example.test/x.git', baseBranch: 'main', allowedCommands: ['echo ok'], gateCommands: ['echo ok'], policy: { costCeilingUsd: 3 } });
    await port.save(profile);
    assert.deepEqual(await port.get(profile.repo), profile);
    const updated = { ...profile, baseBranch: 'develop' };
    await port.save(updated);
    assert.equal((await port.get(profile.repo))?.baseBranch, 'develop');
    assert.ok((await port.list()).some((p) => p.repo === profile.repo));
    await port.remove(profile.repo);
    assert.equal(await port.get(profile.repo), undefined);
  },
};
