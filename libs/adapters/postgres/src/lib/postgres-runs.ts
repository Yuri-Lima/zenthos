import { parseRun, repoOfTicket, type Run, type RunState } from '@zenthos/domain';
import type { RunsPort } from '@zenthos/ports';
import type { Pool } from 'pg';

type RunRow = { run: Run };

/**
 * The whole run as jsonb, with the columns the API filters and sorts on beside it. Rows are parsed on the way out, so
 * runs stored before a field existed come back with its default. A run that started before workspaces existed (ADR 019)
 * takes its workspace from its repository's profile when it is next saved.
 */
export class PostgresRuns implements RunsPort {
  constructor(private readonly pool: Pool) {}

  async save(run: Run): Promise<void> {
    const repo = run.ticket.key.includes('#') ? repoOfTicket(run.ticket.key) : null;
    await this.pool.query(
      `INSERT INTO runs (id, ticket_key, state, run, workspace_id, created_at)
       VALUES ($1, $2, $3, $4, COALESCE($5, (SELECT workspace_id FROM repo_profiles WHERE repo = $6)), $7)
       ON CONFLICT (id) DO UPDATE SET state = EXCLUDED.state, run = EXCLUDED.run, workspace_id = EXCLUDED.workspace_id, updated_at = now()`,
      [run.id, run.ticket.key, run.state, run, run.workspaceId ?? null, repo, run.createdAt],
    );
  }

  async latest(ticketKey: string): Promise<Run | undefined> {
    const { rows } = await this.pool.query<RunRow>('SELECT run FROM runs WHERE ticket_key = $1 ORDER BY created_at DESC LIMIT 1', [ticketKey]);
    return rows[0] && parseRun(rows[0].run);
  }

  async list({ workspaceId, state, limit = 100 }: { workspaceId?: string; state?: RunState; limit?: number } = {}): Promise<Run[]> {
    const { rows } = await this.pool.query<RunRow>(
      'SELECT run FROM runs WHERE ($1::uuid IS NULL OR workspace_id = $1) AND ($2::text IS NULL OR state = $2) ORDER BY created_at DESC LIMIT $3',
      [workspaceId ?? null, state ?? null, limit],
    );
    return rows.map((row) => parseRun(row.run));
  }
}
