import { parseRun, type Run, type RunState } from '@zenthos/domain';
import type { RunsPort } from '@zenthos/ports';
import type { Pool } from 'pg';

type RunRow = { run: Run };

/** The whole run as jsonb, with the columns the API filters and sorts on beside it. Rows are parsed on the way out, so runs stored before a field existed come back with its default. */
export class PostgresRuns implements RunsPort {
  constructor(private readonly pool: Pool) {}

  async save(run: Run): Promise<void> {
    await this.pool.query(
      `INSERT INTO runs (id, ticket_key, state, run, created_at) VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (id) DO UPDATE SET state = EXCLUDED.state, run = EXCLUDED.run, updated_at = now()`,
      [run.id, run.ticket.key, run.state, run, run.createdAt],
    );
  }

  async latest(ticketKey: string): Promise<Run | undefined> {
    const { rows } = await this.pool.query<RunRow>('SELECT run FROM runs WHERE ticket_key = $1 ORDER BY created_at DESC LIMIT 1', [ticketKey]);
    return rows[0] && parseRun(rows[0].run);
  }

  async list({ state, limit = 100 }: { state?: RunState; limit?: number } = {}): Promise<Run[]> {
    const { rows } = await this.pool.query<RunRow>('SELECT run FROM runs WHERE ($1::text IS NULL OR state = $1) ORDER BY created_at DESC LIMIT $2', [state ?? null, limit]);
    return rows.map((row) => parseRun(row.run));
  }
}
