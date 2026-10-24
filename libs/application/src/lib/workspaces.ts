import { assertCan, createWorkspace, DomainError, sameLogin, type Membership, type Session, type Workspace, type WorkspaceActor, type WorkspaceRole } from '@zenthos/domain';
import type { SessionsPort, WorkspacesPort } from '@zenthos/ports';

export type WorkspaceDeps = { workspaces: WorkspacesPort; sessions: SessionsPort };

/** The workspace a session is working in and the person's role there; undefined until they have selected one (ADR 019). */
export async function currentWorkspace({ workspaces }: Pick<WorkspaceDeps, 'workspaces'>, session: Session): Promise<(WorkspaceActor & { workspace: Workspace }) | undefined> {
  if (!session.workspaceId) return undefined;
  const membership = (await workspaces.listForLogin(session.user.login)).find((m) => m.workspace.id === session.workspaceId);
  return membership && { workspaceId: membership.workspace.id, login: session.user.login, role: membership.role, workspace: membership.workspace };
}

/** Use case 13: a signed-in person creates a workspace, owns it, and the session moves into it. */
export async function createWorkspaceFor({ workspaces, sessions }: WorkspaceDeps, session: Session, name: string, now = new Date()): Promise<Workspace> {
  const { workspace, membership } = createWorkspace(name, session.user.login, now);
  await workspaces.save(workspace);
  await workspaces.saveMember(membership);
  await sessions.save({ ...session, workspaceId: workspace.id });
  return workspace;
}

/** Switches the session to another workspace the person belongs to. */
export async function selectWorkspace({ workspaces, sessions }: WorkspaceDeps, session: Session, workspaceId: string): Promise<Session> {
  if (!(await workspaces.listForLogin(session.user.login)).some((m) => m.workspace.id === workspaceId)) throw new DomainError('not_a_member', { workspaceId });
  const updated = { ...session, workspaceId };
  await sessions.save(updated);
  return updated;
}

/** The role a signed-in person has in a workspace, for routes that name one; `not_a_member` otherwise. */
export async function actorIn({ workspaces }: Pick<WorkspaceDeps, 'workspaces'>, login: string, workspaceId: string): Promise<WorkspaceActor> {
  const membership = (await workspaces.listForLogin(login)).find((m) => m.workspace.id === workspaceId);
  if (!membership) throw new DomainError('not_a_member', { workspaceId });
  return { workspaceId, login, role: membership.role };
}

const isLastOwner = (members: Membership[], login: string) => members.filter((m) => m.role === 'owner').every((m) => sameLogin(m.login, login));

/**
 * Use case 14: an owner invites a member by GitHub login, or changes a member's role. The person need not have
 * signed in yet; the membership is theirs when they do. A workspace keeps at least one owner.
 */
export async function setMember({ workspaces }: Pick<WorkspaceDeps, 'workspaces'>, actor: WorkspaceActor, member: { login: string; role: WorkspaceRole }, now = new Date()): Promise<Membership> {
  assertCan(actor.role, 'manage_members');
  const members = await workspaces.members(actor.workspaceId);
  const existing = members.find((m) => sameLogin(m.login, member.login));
  if (existing?.role === 'owner' && member.role !== 'owner' && isLastOwner(members, member.login)) throw new DomainError('last_owner', { login: member.login });
  const membership: Membership = existing
    ? { ...existing, role: member.role }
    : { workspaceId: actor.workspaceId, login: member.login, role: member.role, invitedBy: actor.login, createdAt: now.toISOString() };
  await workspaces.saveMember(membership);
  return membership;
}

/** Use case 15: an owner removes a member; the last owner stays. */
export async function removeMember({ workspaces }: Pick<WorkspaceDeps, 'workspaces'>, actor: WorkspaceActor, login: string): Promise<void> {
  assertCan(actor.role, 'manage_members');
  const members = await workspaces.members(actor.workspaceId);
  if (members.find((m) => sameLogin(m.login, login))?.role === 'owner' && isLastOwner(members, login)) throw new DomainError('last_owner', { login });
  await workspaces.removeMember(actor.workspaceId, login);
}
