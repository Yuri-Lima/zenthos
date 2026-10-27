import { bindInstallation, coversRepository, createConnection, installUrl, unbindInstallation, withInstallation, withoutInstallation, withRepositories, workspaceInstallations } from './provider-connection.js';

const W = '00000000-0000-4000-8000-0000000000a1';

describe('provider connection', () => {
  const connection = createConnection({
    provider: 'github',
    name: 'zenthos',
    credentials: { type: 'github-app', appId: '1', privateKey: 'pem' },
    app: { slug: 'zenthos', webhookSecret: 's', clientId: 'c', clientSecret: 'cs' },
  });

  it('replaces an installation by id and removes it', () => {
    const one = withInstallation(connection, { installationId: 3, account: 'owner', repositories: ['owner/a'] });
    const two = withInstallation(one, { installationId: 3, account: 'owner', repositories: ['owner/a', 'owner/b'] });
    expect(two.installations).toHaveLength(1);
    expect(two.installations[0].repositories).toEqual(['owner/a', 'owner/b']);
    expect(withRepositories(two, { installationId: 3, account: 'owner', added: ['owner/c'], removed: ['owner/a'] }).installations[0].repositories).toEqual(['owner/b', 'owner/c']);
    expect(withoutInstallation(two, 3).installations).toEqual([]);
  });

  it('keeps a binding through webhook updates until the workspace releases it', () => {
    const bound = bindInstallation(withInstallation(connection, { installationId: 3, account: 'owner', repositories: ['owner/a'] }), { installationId: 3, account: 'owner', repositories: ['owner/a'] }, W);
    const refreshed = withRepositories(withInstallation(bound, { installationId: 3, account: 'owner', repositories: ['owner/a'] }), { installationId: 3, account: 'owner', added: ['owner/b'], removed: [] });
    expect(refreshed.installations[0]).toEqual({ installationId: 3, account: 'owner', repositories: ['owner/a', 'owner/b'], workspaceId: W });
    expect(workspaceInstallations(refreshed, W)).toHaveLength(1);
    expect(coversRepository(workspaceInstallations(refreshed, W), 'owner/b')).toBe(true);
    expect(coversRepository(workspaceInstallations(refreshed, '00000000-0000-4000-8000-0000000000b2'), 'owner/b')).toBe(false);
    const released = unbindInstallation(refreshed, 3);
    expect(released.installations[0]).toEqual({ installationId: 3, account: 'owner', repositories: ['owner/a', 'owner/b'] });
    expect(workspaceInstallations(released, W)).toEqual([]);
  });

  it('knows where the app is installed from', () => {
    expect(installUrl(connection)).toBe('https://github.com/apps/zenthos/installations/new');
    expect(installUrl(createConnection({ provider: 'github', name: 'token', credentials: { type: 'github-token', token: 't' } }))).toBeUndefined();
  });
});
