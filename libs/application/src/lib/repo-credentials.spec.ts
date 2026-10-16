import { createConnection, repoProfile } from '@zenthos/domain';
import type { ProviderConnectionsPort, RepoProfilesPort } from '@zenthos/ports';
import { credentialsForRepo } from './repo-credentials.js';

const connection = createConnection({ provider: 'github', name: 'app', credentials: { type: 'github-app', appId: '7', privateKey: 'pem' } });
const withConnection = { ...repoProfile({ repo: 'owner/a', cloneUrl: 'x', baseBranch: 'main', allowedCommands: [], gateCommands: [] }), connectionId: connection.id };
const withoutConnection = repoProfile({ repo: 'owner/b', cloneUrl: 'x', baseBranch: 'main', allowedCommands: [], gateCommands: [] });
const orphan = { ...withoutConnection, repo: 'owner/c', connectionId: '00000000-0000-0000-0000-000000000000' };
const profiles: RepoProfilesPort = { get: async (repo) => [withConnection, withoutConnection, orphan].find((p) => p.repo === repo), list: async () => [], save: async () => undefined, remove: async () => undefined };
const connections: ProviderConnectionsPort = { get: async (id) => (id === connection.id ? connection : undefined), findByAppId: async () => undefined, list: async () => [], save: async () => undefined, remove: async () => undefined };
const fallback = { type: 'github-token', token: 'ghp_env' } as const;

describe('credentialsForRepo', () => {
  it('takes the credentials of the connection the profile names', async () => {
    expect(await credentialsForRepo({ profiles, connections }, 'owner/a', fallback)).toEqual(connection.credentials);
  });

  it('falls back to the process credentials for a profile without a connection, or no profile', async () => {
    expect(await credentialsForRepo({ profiles, connections }, 'owner/b', fallback)).toEqual(fallback);
    expect(await credentialsForRepo({ profiles, connections }, 'owner/none', fallback)).toEqual(fallback);
  });

  it('stops without credentials, and on a profile whose connection is gone', async () => {
    await expect(credentialsForRepo({ profiles, connections }, 'owner/b')).rejects.toMatchObject({ code: 'no_credentials' });
    await expect(credentialsForRepo({ profiles, connections }, 'owner/c', fallback)).rejects.toMatchObject({ code: 'connection_not_found' });
  });
});
