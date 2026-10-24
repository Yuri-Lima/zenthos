import { z } from 'zod';
import { DomainError } from './errors.js';

/**
 * A workspace owns everything a customer configures: members, repositories, provider connections, runs
 * (ADR 019). Every store query is scoped by its id; a person sees only the workspaces they are a member of.
 */
export const WORKSPACE_ROLES = ['owner', 'admin', 'member'] as const;
export type WorkspaceRole = (typeof WORKSPACE_ROLES)[number];

export const WorkspaceSchema = z.object({
  id: z.uuid(),
  name: z.string().trim().min(1).max(60),
  createdAt: z.iso.datetime(),
});
export type Workspace = z.infer<typeof WorkspaceSchema>;

/** One person in one workspace, by GitHub login: the one identity a person has before they ever sign in. */
export const MembershipSchema = z.object({
  workspaceId: z.uuid(),
  login: z.string().min(1),
  role: z.enum(WORKSPACE_ROLES),
  /** The login that invited them; absent for the owner who created the workspace. */
  invitedBy: z.string().optional(),
  createdAt: z.iso.datetime(),
});
export type Membership = z.infer<typeof MembershipSchema>;

/** The capabilities a role carries; checked in the use cases, shown in the dashboard. */
export const WORKSPACE_ACTIONS = {
  /** Invite, change roles, remove members, delete the workspace. */
  manage_members: ['owner'],
  /** Installations, repositories, model credentials. */
  configure: ['owner', 'admin'],
  /** Start runs, decide specs, read everything. */
  operate: ['owner', 'admin', 'member'],
} as const satisfies Record<string, readonly WorkspaceRole[]>;
export type WorkspaceAction = keyof typeof WORKSPACE_ACTIONS;

/** Who acts in which workspace: what the API attaches to a request and the use cases check. */
export type WorkspaceActor = { workspaceId: string; login: string; role: WorkspaceRole };

export const can = (role: WorkspaceRole, action: WorkspaceAction): boolean => (WORKSPACE_ACTIONS[action] as readonly WorkspaceRole[]).includes(role);

export function assertCan(role: WorkspaceRole, action: WorkspaceAction): void {
  if (!can(role, action)) throw new DomainError('forbidden', { role, action });
}

/** GitHub logins are case-insensitive; every comparison of two goes through here. */
export const sameLogin = (a: string, b: string): boolean => a.toLowerCase() === b.toLowerCase();

export function createWorkspace(name: string, owner: string, now = new Date(), id = globalThis.crypto.randomUUID()): { workspace: Workspace; membership: Membership } {
  const result = WorkspaceSchema.safeParse({ id, name, createdAt: now.toISOString() });
  if (!result.success) throw new DomainError('invalid_workspace', { issues: result.error.issues });
  return { workspace: result.data, membership: { workspaceId: id, login: owner, role: 'owner', createdAt: now.toISOString() } };
}

/**
 * Dry runs (`ZENTHOS_AUTH=off`, in-memory stores) have one implicit workspace, so the stores are scoped the same
 * way as in production and nothing reads unscoped. Its id is fixed so the seeds in code can name it.
 */
export const DRY_RUN_WORKSPACE: Workspace = { id: '00000000-0000-4000-8000-000000000001', name: 'Dry run', createdAt: '2026-01-01T00:00:00.000Z' };
