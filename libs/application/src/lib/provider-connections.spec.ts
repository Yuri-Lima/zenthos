import { createRun, repoProfile, type ProviderConnection, type RepoProfile, type Run } from '@zenthos/domain';
import type { ProviderConnectionsPort, RepoProfilesPort, RunControlPort } from '@zenthos/ports';
import { applyWebhookCommand, connectExistingGitHubApp, connectGitHubApp, recordInstallation } from './provider-connections.js';

/** Map-backed fakes; the application layer may not import adapters, even in tests. */
class Connections implements ProviderConnectionsPort {
  readonly byId = new Map<string, ProviderConnection>();
  get = async (id: string) => this.byId.get(id);
  findByAppId = async (appId: string) => [...this.byId.values()].find((c) => c.credentials.type === 'github-app' && c.credentials.appId === appId);
  list = async () => [...this.byId.values()];
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
  start = async (ticketKey: string) => {
    if (!this.runs.has(ticketKey)) this.runs.set(ticketKey, createRun({ key: ticketKey, title: ticketKey, body: '', url: 'https://example.test', labels: [] }));
    return { workflowId: `ticket:${ticketKey}` };
  };
  decide = async (ticketKey: string, decision: 'approved' | 'rejected') => void this.decisions.push({ ticketKey, decision });
  state = async (ticketKey: string) => this.runs.get(ticketKey);
}

const manifest = { appId: '42', slug: 'zenthos-dev', privateKey: 'pem', webhookSecret: 'whs', clientId: 'c', clientSecret: 'cs' };

describe('provider connections', () => {
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
    const silent = await connectExistingGitHubApp({ connections }, { name: 'zenthos-dev', appId: '9', privateKey: 'pem' });
    expect(silent.app).toBeUndefined();
    const hooked = await connectExistingGitHubApp({ connections }, { name: 'zenthos-hooked', appId: '10', privateKey: 'pem', webhookSecret: 'whs' });
    expect(hooked.app).toEqual({ slug: 'zenthos-hooked', webhookSecret: 'whs' });
    expect((await connections.findByAppId('9'))?.id).toBe(silent.id);
    expect((await connections.findByAppId('10'))?.id).toBe(hooked.id);
  });

  it('applies webhook commands: labels drive runs only for known repositories, installation events update the connection', async () => {
    const connections = new Connections();
    const profile = repoProfile({ repo: 'owner/repo', cloneUrl: 'x', baseBranch: 'main', allowedCommands: [], gateCommands: [] });
    const profiles = new Profiles(new Map([[profile.repo, profile]]));
    const runs = new Runs();
    const deps = { connections, profiles, runs };
    const connection = await connectGitHubApp({ connections }, manifest);

    expect(await applyWebhookCommand(deps, '42', { kind: 'start', ticketKey: 'owner/repo#1' })).toBe('started ticket:owner/repo#1');
    expect(await applyWebhookCommand(deps, '42', { kind: 'decision', ticketKey: 'owner/repo#1', decision: 'approved' })).toContain('signalled approved');
    expect(runs.decisions).toEqual([{ ticketKey: 'owner/repo#1', decision: 'approved' }]);
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
