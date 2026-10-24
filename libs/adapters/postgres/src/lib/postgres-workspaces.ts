import type { Membership, Workspace, WorkspaceRole } from '@zenthos/domain';
import type { WorkspacesPort } from '@zenthos/ports';
import type { Pool } from 'pg';

type WorkspaceRow = { id: string; name: string; created_at: Date };
type MemberRow = { workspace_id: string; login: string; role: WorkspaceRole; invited_by: string | null; created_at: Date };

const workspace = (row: WorkspaceRow): Workspace => ({ id: row.id, name: row.name, createdAt: row.created_at.toISOString() });
const membership = (row: MemberRow): Membership => ({ workspaceId: row.workspace_id, login: row.login, role: row.role, ...(row.invited_by ? { invitedBy: row.invited_by } : {}), createdAt: row.created_at.toISOString() });

/** Logins are stored as typed and matched on `lower(login)`, which the unique index is on. */
export class PostgresWorkspaces implements WorkspacesPort {
  constructor(private readonly pool: Pool) {}

  async save({ id, name, createdAt }: Workspace): Promise<void> {
    await this.pool.query('INSERT INTO workspaces (id, name, created_at) VALUES ($1, $2, $3) ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name', [id, name, createdAt]);
  }

  async get(id: string): Promise<Workspace | undefined> {
    const { rows } = await this.pool.query<WorkspaceRow>('SELECT * FROM workspaces WHERE id = $1', [id]);
    return rows[0] && workspace(rows[0]);
  }

  async listForLogin(login: string): Promise<{ workspace: Workspace; role: WorkspaceRole }[]> {
    const { rows } = await this.pool.query<WorkspaceRow & { role: WorkspaceRole }>(
      'SELECT w.*, m.role FROM workspace_members m JOIN workspaces w ON w.id = m.workspace_id WHERE lower(m.login) = lower($1) ORDER BY w.created_at',
      [login],
    );
    return rows.map((row) => ({ workspace: workspace(row), role: row.role }));
  }

  async unclaimed(): Promise<Workspace[]> {
    const { rows } = await this.pool.query<WorkspaceRow>('SELECT w.* FROM workspaces w WHERE NOT EXISTS (SELECT 1 FROM workspace_members m WHERE m.workspace_id = w.id) ORDER BY w.created_at');
    return rows.map(workspace);
  }

  async members(workspaceId: string): Promise<Membership[]> {
    const { rows } = await this.pool.query<MemberRow>('SELECT * FROM workspace_members WHERE workspace_id = $1 ORDER BY created_at', [workspaceId]);
    return rows.map(membership);
  }

  async saveMember({ workspaceId, login, role, invitedBy, createdAt }: Membership): Promise<void> {
    await this.pool.query(
      `INSERT INTO workspace_members (workspace_id, login, role, invited_by, created_at) VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (workspace_id, lower(login)) DO UPDATE SET role = EXCLUDED.role`,
      [workspaceId, login, role, invitedBy ?? null, createdAt],
    );
  }

  async removeMember(workspaceId: string, login: string): Promise<void> {
    await this.pool.query('DELETE FROM workspace_members WHERE workspace_id = $1 AND lower(login) = lower($2)', [workspaceId, login]);
  }
}
