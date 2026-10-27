import { createRun, repoProfile, type ProviderConnection, type RepoProfile, type Run } from '@zenthos/domain';
import type { GitHubAppsPort, ProviderConnectionsPort, RepoProfilesPort, RunControlPort } from '@zenthos/ports';
import { applyWebhookCommand, claimInstallation, connectExistingGitHubApp, connectGitHubApp, describeRepository, installationsOf, platformStatus, releaseInstallation } from './provider-connections.js';

/** Map-backed fakes; the application layer may not import adapters, even in tests. */
class Connections implements ProviderConnectionsPort {
  readonly byId = new Map<string, ProviderConnection>();
  get = async (id: string) => this.byId.get(id);
  findByAppId = async (appId: string) => [...this.byId.values()].find((c) => c.credentials.type === 'github-app' && c.credentials.appId === appId);
  platformApp = async () => [...this.byId.values()].find((c) => !c.workspaceId && c.credentials.type === 'github-app');
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
  describeInstallation: async (_c: unknown, installationId: number) => {
    if (installationId === 404) throw Object.assign(new Error('Not Found'), { status: 404 });
    return { installationId, account: installationId === 7 ? 'acme' : 'owner', repositories: [installationId === 7 ? 'acme/x' : 'owner/a'] };
  },
  isMember: async (_c: unknown, _i: number, organisation: string, login: string) => organisation === 'acme' && login === 'ana',
  describeRepository: async (_c: unknown, repo: string) => ({ defaultBranch: 'develop', cloneUrl: `https://github.com/${repo}.git` }),
} as unknown as GitHubAppsPort;

const manifest = { appId: '42', slug: 'zenthos-dev', privateKey: 'pem', webhookSecret: 'whs', clientId: 'c', clientSecret: 'cs' };
const W = '00000000-0000-4000-8000-0000000000a1';

const actor = (login: string, workspaceId = W) => ({ workspaceId, login, role: 'owner' as const });

describe('provider connections', () => {
  it('checks an app key before storing it; connects an app from the manifest result', async () => {
    const connections = new Connections();
    await expect(connectExistingGitHubApp({ connections, githubApps }, { name: 'x', appId: '1', privateKey: 'rejected' })).rejects.toMatchObject({ code: 'invalid_credentials' });
    expect(await connections.list(W)).toEqual([]);
    const connection = await connectGitHubApp({ connections }, manifest);
    expect(connection.credentials).toEqual({ type: 'github-app', appId: '42', privateKey: 'pem' });
  });

  it('the platform app is the one no workspace owns; its status says whether it exists and where it installs', async () => {
    const connections = new Connections();
    expect(await platformStatus({ connections })).toEqual({ configured: false });
    await connectExistingGitHubApp({ connections, githubApps }, { name: 'zenthos-dev', appId: '11', privateKey: 'pem', workspaceId: W });
    expect(await platformStatus({ connections })).toEqual({ configured: false });
    await connectGitHubApp({ connections }, manifest);
    expect(await platformStatus({ connections })).toEqual({ configured: true, slug: 'zenthos-dev', installUrl: 'https://github.com/apps/zenthos-dev/installations/new' });
  });

  it('a member claims an installation on their own account or on an organisation they belong to, once, for their workspace', async () => {
    const connections = new Connections();
    const deps = { connections, githubApps };
    await expect(claimInstallation(deps, actor('owner'), 5)).rejects.toMatchObject({ code: 'platform_not_configured' });
    await connectGitHubApp({ connections }, manifest);
    expect(await claimInstallation(deps, actor('Owner'), 5)).toEqual({ installationId: 5, account: 'owner', repositories: ['owner/a'], workspaceId: W });
    await expect(claimInstallation(deps, actor('bob'), 7)).rejects.toMatchObject({ code: 'installation_not_yours' });
    expect(await claimInstallation(deps, actor('ana'), 7)).toMatchObject({ account: 'acme', workspaceId: W });
    await expect(claimInstallation(deps, actor('ana', '00000000-0000-4000-8000-0000000000b2'), 7)).rejects.toMatchObject({ code: 'installation_not_yours' });
    await expect(claimInstallation(deps, actor('owner'), 404)).rejects.toMatchObject({ code: 'installation_not_found' });
    expect(await claimInstallation(deps, actor('anonymous'), 9, true)).toMatchObject({ installationId: 9, workspaceId: W });
    expect((await installationsOf({ connections }, W)).map((i) => i.installationId)).toEqual([5, 7, 9]);
    expect(await describeRepository(deps, W, 'owner/a')).toEqual({ defaultBranch: 'develop', cloneUrl: 'https://github.com/owner/a.git' });
    await expect(describeRepository(deps, '00000000-0000-4000-8000-0000000000b2', 'owner/a')).rejects.toMatchObject({ code: 'repository_not_found' });
    await releaseInstallation({ connections }, actor('owner'), 5);
    expect((await installationsOf({ connections }, W)).map((i) => i.installationId)).toEqual([7, 9]);
    await expect(releaseInstallation({ connections }, actor('owner'), 5)).rejects.toMatchObject({ code: 'installation_not_found' });
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
    await claimInstallation({ connections, githubApps }, actor('owner'), 5);
    await applyWebhookCommand(deps, '42', { kind: 'repositories', installationId: 5, account: 'owner', added: ['owner/two'], removed: [] });
    expect((await connections.get(connection.id))?.installations[0]).toEqual({ installationId: 5, account: 'owner', repositories: ['owner/a', 'owner/two'], workspaceId: W });
    await applyWebhookCommand(deps, '42', { kind: 'installation', action: 'removed', installation: { installationId: 5, account: 'owner', repositories: [] } });
    expect((await connections.get(connection.id))?.installations).toEqual([]);
    expect(await applyWebhookCommand(deps, '99', { kind: 'installation', action: 'added', installation: { installationId: 5, account: 'o', repositories: [] } })).toContain('no connection for app 99');
    expect(await applyWebhookCommand(deps, '42', { kind: 'ignore', reason: 'x' })).toBe('ignored: x');
  });
});
