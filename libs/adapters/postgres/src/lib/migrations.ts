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
  {
    name: '003-sessions',
    sql: `
      CREATE TABLE sessions (
        id_hash text PRIMARY KEY,
        session jsonb NOT NULL,
        expires_at timestamptz NOT NULL
      );
      CREATE INDEX sessions_expires_at ON sessions (expires_at);
    `,
  },
  {
    name: '004-workspaces',
    sql: `
      CREATE TABLE workspaces (
        id uuid PRIMARY KEY,
        name text NOT NULL,
        created_at timestamptz NOT NULL
      );
      CREATE TABLE workspace_members (
        workspace_id uuid NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
        login text NOT NULL,
        role text NOT NULL,
        invited_by text,
        created_at timestamptz NOT NULL
      );
      CREATE UNIQUE INDEX workspace_members_workspace_login ON workspace_members (workspace_id, lower(login));
      CREATE INDEX workspace_members_login ON workspace_members (lower(login));
      ALTER TABLE provider_connections ADD COLUMN workspace_id uuid REFERENCES workspaces (id) ON DELETE CASCADE;
      ALTER TABLE repo_profiles ADD COLUMN workspace_id uuid REFERENCES workspaces (id) ON DELETE CASCADE;
      ALTER TABLE runs ADD COLUMN workspace_id uuid REFERENCES workspaces (id) ON DELETE CASCADE;
      CREATE INDEX provider_connections_workspace ON provider_connections (workspace_id);
      CREATE INDEX repo_profiles_workspace ON repo_profiles (workspace_id);
      CREATE INDEX runs_workspace_created_at ON runs (workspace_id, created_at DESC);
      -- Rows from before workspaces existed move into one workspace with no members; the first sign-in claims it (ADR 019).
      DO $$
      DECLARE legacy uuid;
      BEGIN
        IF EXISTS (SELECT 1 FROM repo_profiles) OR EXISTS (SELECT 1 FROM provider_connections) OR EXISTS (SELECT 1 FROM runs) THEN
          INSERT INTO workspaces (id, name, created_at) VALUES (gen_random_uuid(), 'Workspace', now()) RETURNING id INTO legacy;
          UPDATE repo_profiles SET workspace_id = legacy;
          UPDATE provider_connections SET workspace_id = legacy;
          UPDATE runs SET workspace_id = legacy;
        END IF;
      END $$;
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
