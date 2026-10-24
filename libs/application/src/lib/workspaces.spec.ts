import { sameLogin, type Membership, type Session, type Workspace, type WorkspaceRole } from '@zenthos/domain';
import type { SessionsPort, WorkspacesPort } from '@zenthos/ports';
import { actorIn, createWorkspaceFor, currentWorkspace, removeMember, selectWorkspace, setMember } from './workspaces.js';

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

const now = new Date('2026-10-24T10:00:00Z');
const session = (login: string, workspaceId?: string): Session => ({ id: `${login}-session`.padEnd(32, 'x'), user: { login, id: 1 }, workspaceId, createdAt: now.toISOString(), expiresAt: '2026-10-31T10:00:00.000Z' });

describe('workspaces', () => {
  const deps = { workspaces: new Workspaces(), sessions: new Sessions() };

  it('creating a workspace makes the creator its owner and moves the session into it', async () => {
    const yuri = session('Yuri');
    await deps.sessions.save(yuri);
    const workspace = await createWorkspaceFor(deps, yuri, 'Acme', now);
    expect(await currentWorkspace(deps, { ...yuri, workspaceId: workspace.id })).toEqual({ workspaceId: workspace.id, login: 'Yuri', role: 'owner', workspace });
    expect((await deps.sessions.get(yuri.id))?.workspaceId).toBe(workspace.id);
    expect(await currentWorkspace(deps, yuri)).toBeUndefined();
  });

  it('owners invite and change roles; the last owner cannot be demoted or removed; admins may not manage members', async () => {
    const yuri = session('Yuri');
    const workspace = await createWorkspaceFor(deps, yuri, 'Team', now);
    const owner = await actorIn(deps, 'Yuri', workspace.id);
    expect(owner.role).toBe('owner');
    const invited = await setMember(deps, owner, { login: 'Ana', role: 'admin' }, now);
    expect(invited).toMatchObject({ login: 'Ana', role: 'admin', invitedBy: 'Yuri' });
    await expect(setMember(deps, { ...owner, login: 'Ana', role: 'admin' }, { login: 'Bob', role: 'member' })).rejects.toMatchObject({ code: 'forbidden' });
    await expect(setMember(deps, owner, { login: 'YURI', role: 'member' })).rejects.toMatchObject({ code: 'last_owner' });
    await expect(removeMember(deps, owner, 'yuri')).rejects.toMatchObject({ code: 'last_owner' });
    await setMember(deps, owner, { login: 'ana', role: 'owner' });
    await removeMember(deps, owner, 'Yuri');
    expect((await deps.workspaces.members(workspace.id)).map((m) => [m.login, m.role])).toEqual([['Ana', 'owner']]);
    await expect(actorIn(deps, 'yuri', workspace.id)).rejects.toMatchObject({ code: 'not_a_member' });
  });

  it('a session switches only to a workspace the person belongs to', async () => {
    const ana = session('Ana');
    const mine = await createWorkspaceFor(deps, ana, 'Mine', now);
    const theirs = await createWorkspaceFor(deps, session('Someone'), 'Theirs', now);
    expect((await selectWorkspace(deps, ana, mine.id)).workspaceId).toBe(mine.id);
    await expect(selectWorkspace(deps, ana, theirs.id)).rejects.toMatchObject({ code: 'not_a_member' });
  });
});
