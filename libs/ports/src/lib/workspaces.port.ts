import type { Membership, Workspace, WorkspaceRole } from '@zenthos/domain';

/** Workspaces and who belongs to them (ADR 019). Logins compare case-insensitively, as GitHub's do. */
export interface WorkspacesPort {
  save(workspace: Workspace): Promise<void>;
  get(id: string): Promise<Workspace | undefined>;
  /** The workspaces a login belongs to, with its role in each; what the guard and the switcher read. */
  listForLogin(login: string): Promise<{ workspace: Workspace; role: WorkspaceRole }[]>;
  /** Workspaces with no member at all: only the one the migration created around pre-workspace data (ADR 019). */
  unclaimed(): Promise<Workspace[]>;
  members(workspaceId: string): Promise<Membership[]>;
  /** Adds the member or changes their role; one row per workspace and login. */
  saveMember(membership: Membership): Promise<void>;
  removeMember(workspaceId: string, login: string): Promise<void>;
}
