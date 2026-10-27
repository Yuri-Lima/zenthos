import { createConnection, createWorkspace, sameLogin, type Membership, type ProviderConnection, type Session, type Workspace, type WorkspaceRole } from '@zenthos/domain';
import type { GitHubAppsPort, ProviderConnectionsPort, SessionsPort, WorkspacesPort } from '@zenthos/ports';
import { signInWithGitHub } from './sign-in.js';

/** Map-backed fakes; the application layer may not import adapters, even in tests. */
class Workspaces implements WorkspacesPort {
  readonly byId = new Map<string, Workspace>();
  readonly memberships: Membership[] = [];
  constructor(seed: { workspaces?: Workspace[]; members?: Membership[] } = {}) {
    for (const w of seed.workspaces ?? []) this.byId.set(w.id, w);
    this.memberships.push(...(seed.members ?? []));
  }
  save = async (w: Workspace) => void this.byId.set(w.id, w);
  get = async (id: string) => this.byId.get(id);
  listForLogin = async (login: string) => this.memberships.filter((m) => sameLogin(m.login, login)).map((m) => ({ workspace: this.byId.get(m.workspaceId) as Workspace, role: m.role as WorkspaceRole }));
  unclaimed = async () => [...this.byId.values()].filter((w) => !this.memberships.some((m) => m.workspaceId === w.id));
  members = async (workspaceId: string) => this.memberships.filter((m) => m.workspaceId === workspaceId);
  saveMember = async (m: Membership) => {
    const i = this.memberships.findIndex((x) => x.workspaceId === m.workspaceId && sameLogin(x.login, m.login));
    if (i >= 0) this.memberships[i] = { ...this.memberships[i], role: m.role };
    else this.memberships.push(m);
  };
  removeMember = async (workspaceId: string, login: string) => {
    const i = this.memberships.findIndex((x) => x.workspaceId === workspaceId && sameLogin(x.login, login));
    if (i >= 0) this.memberships.splice(i, 1);
  };
}
class Sessions implements SessionsPort {
  readonly byId = new Map<string, Session>();
  save = async (s: Session) => void this.byId.set(s.id, s);
  get = async (id: string) => this.byId.get(id);
  remove = async (id: string) => void this.byId.delete(id);
}

const withOAuth = createConnection({ provider: 'github', name: 'app', credentials: { type: 'github-app', appId: '1', privateKey: 'pem' }, app: { slug: 'app', webhookSecret: 's', clientId: 'Iv1.x', clientSecret: 'cs' } });
const connectionsOf = (signInApp?: ProviderConnection): ProviderConnectionsPort => ({ get: async () => undefined, findByAppId: async () => undefined, signInApp: async () => signInApp, list: async () => [], save: async () => undefined, remove: async () => undefined });
const githubApps: GitHubAppsPort = { exchangeManifestCode: async () => { throw new Error('unused'); }, describeInstallation: async () => { throw new Error('unused'); }, signInUser: async (_app, code) => ({ login: code, id: 7 }), whoAmI: async () => { throw new Error('unused'); }, listInstallations: async () => [], describeRepository: async () => { throw new Error('unused'); } };
const input = { code: 'Yuri', redirectUri: 'http://localhost:3200/auth/github/callback', sessionId: 'x'.repeat(64), ttlHours: 24, now: new Date('2026-10-18T10:00:00Z') };

describe('signInWithGitHub', () => {
  it('signs anyone in with a session that expires; without a workspace the session has none selected', async () => {
    const sessions = new Sessions();
    const session = await signInWithGitHub({ githubApps, connections: connectionsOf(withOAuth), sessions, workspaces: new Workspaces() }, input);
    expect(session.user.login).toBe('Yuri');
    expect(session.workspaceId).toBeUndefined();
    expect(session.expiresAt).toBe('2026-10-19T10:00:00.000Z');
    expect(await sessions.get(session.id)).toEqual(session);
  });

  it('opens in the first workspace the person belongs to, matching the login case-insensitively', async () => {
    const { workspace, membership } = createWorkspace('Acme', 'yuri');
    const workspaces = new Workspaces({ workspaces: [workspace], members: [membership] });
    const session = await signInWithGitHub({ githubApps, connections: connectionsOf(withOAuth), sessions: new Sessions(), workspaces }, input);
    expect(session.workspaceId).toBe(workspace.id);
  });

  it('a person with no workspace claims the memberless one the migration left, and owns it', async () => {
    const { workspace } = createWorkspace('Workspace', 'nobody');
    const workspaces = new Workspaces({ workspaces: [workspace] });
    const session = await signInWithGitHub({ githubApps, connections: connectionsOf(withOAuth), sessions: new Sessions(), workspaces }, input);
    expect(session.workspaceId).toBe(workspace.id);
    expect(await workspaces.listForLogin('yuri')).toEqual([{ workspace, role: 'owner' }]);
    // The next person finds it claimed.
    const next = await signInWithGitHub({ githubApps, connections: connectionsOf(withOAuth), sessions: new Sessions(), workspaces }, { ...input, code: 'Ana', sessionId: 'y'.repeat(64) });
    expect(next.workspaceId).toBeUndefined();
  });

  it('says so when no connection carries OAuth credentials', async () => {
    await expect(signInWithGitHub({ githubApps, connections: connectionsOf(undefined), sessions: new Sessions(), workspaces: new Workspaces() }, input)).rejects.toMatchObject({ code: 'sign_in_unavailable' });
  });
});
