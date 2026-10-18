import { coversRepository, createConnection, installUrl, redactConnection, withInstallation, withoutInstallation, withRepositories } from './provider-connection.js';

describe('provider connection', () => {
  const connection = createConnection({
    provider: 'github',
    name: 'zenthos',
    credentials: { type: 'github-app', appId: '1', privateKey: 'pem' },
    app: { slug: 'zenthos', webhookSecret: 's', clientId: 'c', clientSecret: 'cs' },
  });

  it('redacts every secret and keeps what a person needs to see', () => {
    const shown = redactConnection(withInstallation(connection, { installationId: 3, account: 'owner', repositories: ['owner/repo'] }));
    expect(shown).toEqual({ id: connection.id, provider: 'github', name: 'zenthos', kind: 'github-app', appSlug: 'zenthos', installations: [{ installationId: 3, account: 'owner', repositories: ['owner/repo'] }], installUrl: 'https://github.com/apps/zenthos/installations/new', createdAt: connection.createdAt });
    expect(JSON.stringify(shown)).not.toContain('pem');
    expect(JSON.stringify(shown)).not.toContain('cs');
  });

  it('replaces an installation by id and removes it', () => {
    const one = withInstallation(connection, { installationId: 3, account: 'owner', repositories: ['owner/a'] });
    const two = withInstallation(one, { installationId: 3, account: 'owner', repositories: ['owner/a', 'owner/b'] });
    expect(two.installations).toHaveLength(1);
    expect(two.installations[0].repositories).toEqual(['owner/a', 'owner/b']);
    expect(withRepositories(two, { installationId: 3, account: 'owner', added: ['owner/c'], removed: ['owner/a'] }).installations[0].repositories).toEqual(['owner/b', 'owner/c']);
    expect(withoutInstallation(two, 3).installations).toEqual([]);
  });

  it('knows where the app is installed from', () => {
    expect(installUrl(connection)).toBe('https://github.com/apps/zenthos/installations/new');
    expect(installUrl(createConnection({ provider: 'github', name: 'token', credentials: { type: 'github-token', token: 't' } }))).toBeUndefined();
  });
});

describe('coversRepository and the public view', () => {
  it('an app covers only where it is installed, a token is unknown, and the public view carries the install link', () => {
    const app = createConnection({ provider: 'github', name: 'zenthos-yl', credentials: { type: 'github-app', appId: '1', privateKey: 'pem' }, app: { slug: 'zenthos-yl', webhookSecret: 'w' }, installations: [{ installationId: 1, account: 'o', repositories: ['o/a'] }] });
    const view = redactConnection(app);
    expect(view.installUrl).toBe('https://github.com/apps/zenthos-yl/installations/new');
    expect(JSON.stringify(view)).not.toContain('pem');
    expect(coversRepository(view, 'o/a')).toBe(true);
    expect(coversRepository(view, 'o/b')).toBe(false);
    expect(coversRepository({ kind: 'github-token', installations: [] }, 'o/b')).toBeUndefined();
  });
});
