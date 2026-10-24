import { sameLogin, type Membership, type Workspace, type WorkspaceRole } from '@zenthos/domain';
import type { WorkspacesPort } from '@zenthos/ports';

/** Workspaces and memberships in maps; the dry run and the tests. */
export class InMemoryWorkspaces implements WorkspacesPort {
  private readonly byId = new Map<string, Workspace>();
  private readonly memberships: Membership[] = [];

  constructor(seed: { workspaces?: Workspace[]; members?: Membership[] } = {}) {
    for (const workspace of seed.workspaces ?? []) this.byId.set(workspace.id, workspace);
    this.memberships.push(...(seed.members ?? []));
  }

  async save(workspace: Workspace): Promise<void> {
    this.byId.set(workspace.id, workspace);
  }

  async get(id: string): Promise<Workspace | undefined> {
    return this.byId.get(id);
  }

  async listForLogin(login: string): Promise<{ workspace: Workspace; role: WorkspaceRole }[]> {
    return this.memberships.filter((m) => sameLogin(m.login, login)).flatMap((m) => {
      const workspace = this.byId.get(m.workspaceId);
      return workspace ? [{ workspace, role: m.role }] : [];
    });
  }

  async unclaimed(): Promise<Workspace[]> {
    return [...this.byId.values()].filter((w) => !this.memberships.some((m) => m.workspaceId === w.id));
  }

  async members(workspaceId: string): Promise<Membership[]> {
    return this.memberships.filter((m) => m.workspaceId === workspaceId);
  }

  async saveMember(membership: Membership): Promise<void> {
    const index = this.memberships.findIndex((m) => m.workspaceId === membership.workspaceId && sameLogin(m.login, membership.login));
    if (index >= 0) this.memberships[index] = { ...this.memberships[index], role: membership.role };
    else this.memberships.push(membership);
  }

  async removeMember(workspaceId: string, login: string): Promise<void> {
    const index = this.memberships.findIndex((m) => m.workspaceId === workspaceId && sameLogin(m.login, login));
    if (index >= 0) this.memberships.splice(index, 1);
  }
}
