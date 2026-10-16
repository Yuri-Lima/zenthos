import type { Pool } from 'pg';

/**
 * The schema, as ordered statements applied once each. Adding a table or a column is a new entry at the
 * end; entries never change once they have run somewhere. Small enough that a migration tool would be
 * more code than the migrations.
 */
export const MIGRATIONS: { name: string; sql: string }[] = [
  {
    name: '001-provider-connections-and-repo-profiles',
    sql: `
      CREATE TABLE provider_connections (
        id uuid PRIMARY KEY,
        provider text NOT NULL,
        name text NOT NULL,
        app_id text,
        public jsonb NOT NULL,
        secret bytea NOT NULL,
        created_at timestamptz NOT NULL
      );
      CREATE UNIQUE INDEX provider_connections_app_id ON provider_connections (app_id) WHERE app_id IS NOT NULL;
      CREATE TABLE repo_profiles (
        repo text PRIMARY KEY,
        connection_id uuid REFERENCES provider_connections (id) ON DELETE SET NULL,
        profile jsonb NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now()
      );
    `,
  },
  {
    name: '002-runs',
    sql: `
      CREATE TABLE runs (
        id uuid PRIMARY KEY,
        ticket_key text NOT NULL,
        state text NOT NULL,
        run jsonb NOT NULL,
        created_at timestamptz NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX runs_ticket_key_created_at ON runs (ticket_key, created_at DESC);
      CREATE INDEX runs_state_created_at ON runs (state, created_at DESC);
    `,
  },
];

export async function migrate(pool: Pool): Promise<string[]> {
  await pool.query('CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
  const { rows } = await pool.query<{ name: string }>('SELECT name FROM schema_migrations');
  const applied = new Set(rows.map((row) => row.name));
  const ran: string[] = [];
  for (const migration of MIGRATIONS.filter((m) => !applied.has(m.name))) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(migration.sql);
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [migration.name]);
      await client.query('COMMIT');
      ran.push(migration.name);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
  return ran;
}
