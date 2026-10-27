import { createConnection, repoProfile, type ProviderConnection } from '@zenthos/domain';
import type { ProviderConnectionsPort, RepoProfilesPort } from '@zenthos/ports';
import { credentialsForRepo } from './repo-credentials.js';

const W = '00000000-0000-4000-8000-0000000000a1';
const OTHER = '00000000-0000-4000-8000-0000000000b2';
const legacy = createConnection({ provider: 'github', name: 'app', credentials: { type: 'github-app', appId: '7', privateKey: 'pem' }, workspaceId: W });
const platform = createConnection({
  provider: 'github',
  name: 'zenthos',
  credentials: { type: 'github-app', appId: '1', privateKey: 'platform-pem' },
  app: { slug: 'zenthos', webhookSecret: 's' },
  installations: [{ installationId: 1, account: 'owner', repositories: ['owner/p', 'owner/q'], workspaceId: W }, { installationId: 2, account: 'theirs', repositories: ['theirs/r'], workspaceId: OTHER }],
});
const profiles: Record<string, ReturnType<typeof repoProfile>> = {
  'owner/a': { ...repoProfile({ repo: 'owner/a', cloneUrl: 'x', baseBranch: 'main', allowedCommands: [], gateCommands: [] }), connectionId: legacy.id, workspaceId: W },
  'owner/p': { ...repoProfile({ repo: 'owner/p', cloneUrl: 'x', baseBranch: 'main', allowedCommands: [], gateCommands: [] }), workspaceId: W },
  'theirs/r': { ...repoProfile({ repo: 'theirs/r', cloneUrl: 'x', baseBranch: 'main', allowedCommands: [], gateCommands: [] }), workspaceId: W },
  'owner/b': repoProfile({ repo: 'owner/b', cloneUrl: 'x', baseBranch: 'main', allowedCommands: [], gateCommands: [] }),
  'owner/c': { ...repoProfile({ repo: 'owner/c', cloneUrl: 'x', baseBranch: 'main', allowedCommands: [], gateCommands: [] }), connectionId: '00000000-0000-0000-0000-000000000000' },
};
const profilesPort: RepoProfilesPort = { get: async (repo) => profiles[repo], list: async () => [], save: async () => undefined, remove: async () => undefined };
const connectionsWith = (app?: ProviderConnection): ProviderConnectionsPort => ({ get: async (id) => (id === legacy.id ? legacy : undefined), findByAppId: async () => undefined, platformApp: async () => app, list: async () => [], save: async () => undefined, remove: async () => undefined });
const fallback = { type: 'github-token', token: 'ghp_env' } as const;

describe('credentialsForRepo', () => {
  it('acts as the platform app where an installation bound to the repository\'s workspace covers it, and refuses where only another workspace\'s does', async () => {
    const connections = connectionsWith(platform);
    expect(await credentialsForRepo({ profiles: profilesPort, connections }, 'owner/p', fallback)).toEqual(platform.credentials);
    await expect(credentialsForRepo({ profiles: profilesPort, connections }, 'theirs/r', fallback)).rejects.toMatchObject({ code: 'app_not_installed', context: { installUrl: 'https://github.com/apps/zenthos/installations/new' } });
  });

  it('takes the credentials of the connection a profile still names', async () => {
    expect(await credentialsForRepo({ profiles: profilesPort, connections: connectionsWith(platform) }, 'owner/a', fallback)).toEqual(legacy.credentials);
  });

  it('falls back to the process credentials without a platform app, for a profile without a workspace, or no profile', async () => {
    const connections = connectionsWith(undefined);
    expect(await credentialsForRepo({ profiles: profilesPort, connections }, 'owner/p', fallback)).toEqual(fallback);
    expect(await credentialsForRepo({ profiles: profilesPort, connections: connectionsWith(platform) }, 'owner/b', fallback)).toEqual(fallback);
    expect(await credentialsForRepo({ profiles: profilesPort, connections }, 'owner/none', fallback)).toEqual(fallback);
  });

  it('stops without credentials, and on a profile whose connection is gone', async () => {
    await expect(credentialsForRepo({ profiles: profilesPort, connections: connectionsWith(undefined) }, 'owner/b')).rejects.toMatchObject({ code: 'no_credentials' });
    await expect(credentialsForRepo({ profiles: profilesPort, connections: connectionsWith(platform) }, 'owner/c', fallback)).rejects.toMatchObject({ code: 'connection_not_found' });
  });
});
