import { modelKeysContract, providerConnectionsContract, repoProfilesContract, runsContract, sampleConnection, sessionsContract, workspacesContract } from '@zenthos/ports';
import { Pool } from 'pg';
import { migrate } from './migrations.js';
import { PostgresRuns } from './postgres-runs.js';
import { PostgresSessions } from './postgres-sessions.js';
import { PostgresModelKeys } from './postgres-model-keys.js';
import { PostgresWorkspaces } from './postgres-workspaces.js';
import { rotateSecrets } from './rotate-secrets.js';
import { PostgresProviderConnections, PostgresRepoProfiles } from './postgres-stores.js';
import { SecretBox } from './secret-box.js';

/** The compose Postgres on its host port; CI starts the same image. No database, no run: the suite fails, it does not pretend. */
const url = process.env['ZENTHOS_TEST_DATABASE_URL'] ?? 'postgres://postgres:postgres@127.0.0.1:5433/zenthos_test';

describe('Postgres stores', () => {
  const pool = new Pool({ connectionString: url, connectionTimeoutMillis: 3000 });
  const box = new SecretBox('c'.repeat(64));

  beforeAll(async () => {
    await pool.query('DROP TABLE IF EXISTS sessions, runs, repo_profiles, provider_connections, workspace_model_keys, workspace_members, workspaces, schema_migrations');
    expect(await migrate(pool)).toEqual(['001-provider-connections-and-repo-profiles', '002-runs', '003-sessions', '004-workspaces', '005-platform-app', '006-workspace-model-keys']);
    expect(await migrate(pool)).toEqual([]);
    // The contracts save rows under these two workspaces (foreign keys).
    for (const [id, name] of [['00000000-0000-4000-8000-0000000000a1', 'A'], ['00000000-0000-4000-8000-0000000000b2', 'B']]) await new PostgresWorkspaces(pool).save({ id, name, createdAt: '2026-10-24T00:00:00.000Z' });
  });

  afterAll(() => pool.end());

  for (const [name, check] of Object.entries(providerConnectionsContract)) it(`connections: ${name}`, () => check(new PostgresProviderConnections(pool, box)));
  for (const [name, check] of Object.entries(repoProfilesContract)) it(`profiles: ${name}`, () => check(new PostgresRepoProfiles(pool)));
  for (const [name, check] of Object.entries(runsContract)) it(`runs: ${name}`, () => check(new PostgresRuns(pool), 'owner/repo#1'));
  for (const [name, check] of Object.entries(sessionsContract)) it(`sessions: ${name}`, () => check(new PostgresSessions(pool)));
  for (const [name, check] of Object.entries(workspacesContract)) it(`workspaces: ${name}`, () => check(new PostgresWorkspaces(pool)));
  for (const [name, check] of Object.entries(modelKeysContract)) it(`model keys: ${name}`, () => check(new PostgresModelKeys(pool, box), '00000000-0000-4000-8000-0000000000a1'));

  it('rotates the deployment key: rows open with the new key and no longer with the old one', async () => {
    const connections = new PostgresProviderConnections(pool, box);
    const connection = sampleConnection();
    await connections.save(connection);
    const keys = new PostgresModelKeys(pool, box);
    const key = { workspaceId: '00000000-0000-4000-8000-0000000000a1', provider: 'anthropic' as const, apiKey: 'sk-ant-api03-rotate', createdAt: '2026-10-27T10:00:00.000Z' };
    await keys.save(key);
    const next = new SecretBox('d'.repeat(64));
    expect(await rotateSecrets(pool, box, next)).toBeGreaterThanOrEqual(2);
    expect((await new PostgresProviderConnections(pool, next).get(connection.id))?.credentials).toEqual(connection.credentials);
    expect(await new PostgresModelKeys(pool, next).get(key.workspaceId)).toEqual(key);
    await expect(connections.get(connection.id)).rejects.toThrow();
    await rotateSecrets(pool, next, box);
    await connections.remove(connection.id);
    await keys.remove(key.workspaceId);
  });

  it('stores sessions by hash, never by the cookie value', async () => {
    const sessions = new PostgresSessions(pool);
    const session = { id: 'd'.repeat(64), user: { login: 'octocat', id: 1 }, createdAt: '2026-10-18T10:00:00.000Z', expiresAt: '2026-10-25T10:00:00.000Z' };
    await sessions.save(session);
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
