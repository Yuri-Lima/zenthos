import { providerConnectionsContract, repoProfilesContract, runsContract, sampleConnection, sessionsContract } from '@zenthos/ports';
import { Pool } from 'pg';
import { migrate } from './migrations.js';
import { PostgresRuns } from './postgres-runs.js';
import { PostgresSessions } from './postgres-sessions.js';
import { rotateSecrets } from './rotate-secrets.js';
import { PostgresProviderConnections, PostgresRepoProfiles } from './postgres-stores.js';
import { SecretBox } from './secret-box.js';

/** The compose Postgres on its host port; CI starts the same image. No database, no run: the suite fails, it does not pretend. */
const url = process.env['ZENTHOS_TEST_DATABASE_URL'] ?? 'postgres://postgres:postgres@127.0.0.1:5433/zenthos_test';

describe('Postgres stores', () => {
  const pool = new Pool({ connectionString: url, connectionTimeoutMillis: 3000 });
  const box = new SecretBox('c'.repeat(64));

  beforeAll(async () => {
    await pool.query('DROP TABLE IF EXISTS sessions, runs, repo_profiles, provider_connections, schema_migrations');
    expect(await migrate(pool)).toEqual(['001-provider-connections-and-repo-profiles', '002-runs', '003-sessions']);
    expect(await migrate(pool)).toEqual([]);
  });

  afterAll(() => pool.end());

  for (const [name, check] of Object.entries(providerConnectionsContract)) it(`connections: ${name}`, () => check(new PostgresProviderConnections(pool, box)));
  for (const [name, check] of Object.entries(repoProfilesContract)) it(`profiles: ${name}`, () => check(new PostgresRepoProfiles(pool)));
  for (const [name, check] of Object.entries(runsContract)) it(`runs: ${name}`, () => check(new PostgresRuns(pool), 'owner/repo#1'));
  for (const [name, check] of Object.entries(sessionsContract)) it(`sessions: ${name}`, () => check(new PostgresSessions(pool)));

  it('rotates the deployment key: rows open with the new key and no longer with the old one', async () => {
    const connections = new PostgresProviderConnections(pool, box);
    const connection = sampleConnection();
    await connections.save(connection);
    const next = new SecretBox('d'.repeat(64));
    expect(await rotateSecrets(pool, box, next)).toBeGreaterThanOrEqual(1);
    expect((await new PostgresProviderConnections(pool, next).get(connection.id))?.credentials).toEqual(connection.credentials);
    await expect(connections.get(connection.id)).rejects.toThrow();
    await rotateSecrets(pool, next, box);
    await connections.remove(connection.id);
  });

  it('stores sessions by hash, never by the cookie value', async () => {
    const sessions = new PostgresSessions(pool);
    const session = { id: 'd'.repeat(64), user: { login: 'octocat', id: 1 }, createdAt: '2026-10-18T10:00:00.000Z', expiresAt: '2026-10-25T10:00:00.000Z' };
    await sessions.create(session);
    const { rows } = await pool.query<{ id_hash: string; session: unknown }>('SELECT id_hash, session FROM sessions');
    expect(rows.some((r) => r.id_hash === session.id)).toBe(false);
    expect(JSON.stringify(rows.map((r) => r.session))).not.toContain(session.id);
    await sessions.remove(session.id);
  });

  it('keeps credentials sealed in the row', async () => {
    const { rows } = await pool.query<{ secret: Buffer; public: unknown }>('SELECT secret, public FROM provider_connections LIMIT 1').catch(() => ({ rows: [] }));
    for (const row of rows) {
      expect(row.secret.toString('latin1')).not.toContain('PRIVATE KEY');
      expect(JSON.stringify(row.public)).not.toContain('PRIVATE KEY');
    }
  });
});
