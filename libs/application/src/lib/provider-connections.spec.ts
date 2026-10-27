import { createRun, repoProfile, type ProviderConnection, type RepoProfile, type Run } from '@zenthos/domain';
import type { GitHubAppsPort, ProviderConnectionsPort, RepoProfilesPort, RunControlPort } from '@zenthos/ports';
import { applyWebhookCommand, checkConnection, connectExistingGitHubApp, connectGitHubApp, connectGitHubToken, describeRepository, recordInstallation } from './provider-connections.js';

/** Map-backed fakes; the application layer may not import adapters, even in tests. */
class Connections implements ProviderConnectionsPort {
  readonly byId = new Map<string, ProviderConnection>();
  get = async (id: string) => this.byId.get(id);
  findByAppId = async (appId: string) => [...this.byId.values()].find((c) => c.credentials.type === 'github-app' && c.credentials.appId === appId);
  signInApp = async () => [...this.byId.values()].find((c) => c.app?.clientId && c.app.clientSecret);
  list = async (workspaceId: string) => [...this.byId.values()].filter((c) => c.workspaceId === workspaceId);
  save = async (c: ProviderConnection) => void this.byId.set(c.id, c);
  remove = async (id: string) => void this.byId.delete(id);
}
class Profiles implements RepoProfilesPort {
  constructor(private readonly byRepo: Map<string, RepoProfile>) {}
  get = async (repo: string) => this.byRepo.get(repo);
  list = async () => [...this.byRepo.values()];
  save = async (p: RepoProfile) => void this.byRepo.set(p.repo, p);
  remove = async (repo: string) => void this.byRepo.delete(repo);
}
class Runs implements RunControlPort {
  readonly runs = new Map<string, Run>();
  readonly decisions: { ticketKey: string; decision: 'approved' | 'rejected' }[] = [];
  start = async (ticketKey: string, actor?: string) => {
    if (!this.runs.has(ticketKey)) this.runs.set(ticketKey, createRun({ key: ticketKey, title: ticketKey, body: '', url: 'https://example.test', labels: [] }, { requestedBy: actor }));
    return { workflowId: `ticket:${ticketKey}` };
  };
  decide = async (ticketKey: string, decision: 'approved' | 'rejected', actor?: string) => void this.decisions.push({ ticketKey, decision, ...(actor ? { actor } : {}) });
  state = async (ticketKey: string) => this.runs.get(ticketKey);
}

/** Answers like GitHub: a secret spelled `rejected` is refused. */
const githubApps = {
  whoAmI: async (c: { type: string; token?: string; privateKey?: string }) => {
    if ((c.token ?? c.privateKey) === 'rejected') throw new Error('Bad credentials');
    return c.type === 'github-token' ? 'octocat' : 'zenthos-dev';
  },
  listInstallations: async () => [{ installationId: 5, account: 'owner', repositories: ['owner/a', 'owner/b'] }],
  describeRepository: async (_c: unknown, repo: string) => ({ defaultBranch: 'develop', cloneUrl: `https://github.com/${repo}.git` }),
} as unknown as GitHubAppsPort;

const manifest = { appId: '42', slug: 'zenthos-dev', privateKey: 'pem', webhookSecret: 'whs', clientId: 'c', clientSecret: 'cs' };
const W = '00000000-0000-4000-8000-0000000000a1';

describe('provider connections', () => {
  it('describes a repository through the connection that can see it, and says so when there is no such connection', async () => {
    const connections = new Connections();
    const token = await connectGitHubToken({ connections, githubApps }, { name: 'me', token: 'ghp_ok', workspaceId: W });
    expect(await describeRepository({ connections, githubApps }, token.id, 'owner/a')).toEqual({ defaultBranch: 'develop', cloneUrl: 'https://github.com/owner/a.git' });
    await expect(describeRepository({ connections, githubApps }, 'missing', 'owner/a')).rejects.toMatchObject({ code: 'connection_not_found' });
  });

  it('checks credentials before storing them, and reports the health of a stored connection without throwing', async () => {
    const connections = new Connections();
    await expect(connectGitHubToken({ connections, githubApps }, { name: 'me', token: 'rejected', workspaceId: W })).rejects.toMatchObject({ code: 'invalid_credentials' });
    await expect(connectExistingGitHubApp({ connections, githubApps }, { name: 'x', appId: '1', privateKey: 'rejected' })).rejects.toMatchObject({ code: 'invalid_credentials' });
    expect(await connections.list(W)).toEqual([]);
    const token = await connectGitHubToken({ connections, githubApps }, { name: 'me', token: 'ghp_ok', workspaceId: W });
    const now = new Date('2026-10-18T12:00:00Z');
    expect(await checkConnection({ connections, githubApps }, token.id, now)).toEqual({ ok: true, actsAs: 'octocat', checkedAt: now.toISOString() });
    await connections.save({ ...token, credentials: { type: 'github-token', token: 'rejected' } });
    expect(await checkConnection({ connections, githubApps }, token.id, now)).toEqual({ ok: false, reason: 'Bad credentials', checkedAt: now.toISOString() });
    const app = await connectExistingGitHubApp({ connections, githubApps }, { name: 'zenthos-dev', appId: '11', privateKey: 'pem' });
    expect(await checkConnection({ connections, githubApps }, app.id, now)).toMatchObject({ ok: true, actsAs: 'zenthos-dev', repositories: 2 });
    expect((await connections.get(app.id))?.installations).toEqual([{ installationId: 5, account: 'owner', repositories: ['owner/a', 'owner/b'] }]);
    await expect(checkConnection({ connections, githubApps }, 'missing')).rejects.toMatchObject({ code: 'connection_not_found' });
  });

  it('connects an app from the manifest result and records installations', async () => {
    const connections = new Connections();
    const connection = await connectGitHubApp({ connections }, manifest);
    expect(connection.credentials).toEqual({ type: 'github-app', appId: '42', privateKey: 'pem' });
    const updated = await recordInstallation({ connections }, connection.id, { installationId: 1, account: 'owner', repositories: ['owner/repo'] });
    expect((await connections.get(connection.id))?.installations).toEqual(updated.installations);
    await expect(recordInstallation({ connections }, 'missing', { installationId: 1, account: 'o', repositories: [] })).rejects.toMatchObject({ code: 'connection_not_found' });
  });

  it('connects an app created by hand, with the webhook only when its secret is known', async () => {
    const connections = new Connections();
    const silent = await connectExistingGitHubApp({ connections, githubApps }, { name: 'zenthos-dev', appId: '9', privateKey: 'pem' });
    expect(silent.app).toBeUndefined();
    const hooked = await connectExistingGitHubApp({ connections, githubApps }, { name: 'zenthos-hooked', appId: '10', privateKey: 'pem', webhookSecret: 'whs', workspaceId: W });
    expect(hooked.app).toEqual({ slug: 'zenthos-hooked', webhookSecret: 'whs' });
    expect((await connections.findByAppId('9'))?.id).toBe(silent.id);
    expect((await connections.findByAppId('10'))?.id).toBe(hooked.id);
    const updated = await connectExistingGitHubApp({ connections, githubApps }, { name: 'zenthos-hooked', appId: '10', privateKey: 'pem2', webhookSecret: 'whs', clientId: 'Iv1.c', clientSecret: 'cs', workspaceId: W });
    expect(updated.id).toBe(hooked.id);
    expect(updated.app?.clientId).toBe('Iv1.c');
    expect((await connections.list(W)).filter((c) => c.credentials.type === 'github-app' && c.credentials.appId === '10')).toHaveLength(1);
    // Another workspace cannot take the app over by connecting it again.
    await expect(connectExistingGitHubApp({ connections, githubApps }, { name: 'zenthos-hooked', appId: '10', privateKey: 'pem', workspaceId: '00000000-0000-4000-8000-0000000000b2' })).rejects.toMatchObject({ code: 'forbidden' });
  });

  it('applies webhook commands: labels drive runs only for known repositories, installation events update the connection', async () => {
    const connections = new Connections();
    const profile = repoProfile({ repo: 'owner/repo', cloneUrl: 'x', baseBranch: 'main', allowedCommands: [], gateCommands: [] });
    const profiles = new Profiles(new Map([[profile.repo, profile]]));
    const runs = new Runs();
    const deps = { connections, profiles, runs };
    const connection = await connectGitHubApp({ connections }, manifest);

    expect(await applyWebhookCommand(deps, '42', { kind: 'start', ticketKey: 'owner/repo#1' })).toBe('started ticket:owner/repo#1');
    expect(await applyWebhookCommand(deps, '42', { kind: 'decision', ticketKey: 'owner/repo#1', decision: 'approved', actor: 'naira' })).toContain('signalled approved');
    expect(runs.decisions).toEqual([{ ticketKey: 'owner/repo#1', decision: 'approved', actor: 'naira' }]);
    expect(await applyWebhookCommand(deps, '42', { kind: 'start', ticketKey: 'other/repo#1' })).toContain('no repository profile');
    expect(runs.runs.size).toBe(1);

    await applyWebhookCommand(deps, '42', { kind: 'installation', action: 'added', installation: { installationId: 5, account: 'owner', repositories: ['owner/repo'] } });
    await applyWebhookCommand(deps, '42', { kind: 'repositories', installationId: 5, account: 'owner', added: ['owner/two'], removed: [] });
    expect((await connections.get(connection.id))?.installations[0].repositories).toEqual(['owner/repo', 'owner/two']);
    await applyWebhookCommand(deps, '42', { kind: 'installation', action: 'removed', installation: { installationId: 5, account: 'owner', repositories: [] } });
    expect((await connections.get(connection.id))?.installations).toEqual([]);
    expect(await applyWebhookCommand(deps, '99', { kind: 'installation', action: 'added', installation: { installationId: 5, account: 'o', repositories: [] } })).toContain('no connection for app 99');
    expect(await applyWebhookCommand(deps, '42', { kind: 'ignore', reason: 'x' })).toBe('ignored: x');
  });
});
