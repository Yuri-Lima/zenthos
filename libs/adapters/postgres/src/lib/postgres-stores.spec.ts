import { providerConnectionsContract, repoProfilesContract } from '@zenthos/ports';
import { Pool } from 'pg';
import { migrate } from './migrations.js';
import { PostgresProviderConnections, PostgresRepoProfiles } from './postgres-stores.js';
import { SecretBox } from './secret-box.js';

/** The compose Postgres on its host port; CI starts the same image. No database, no run: the suite fails, it does not pretend. */
const url = process.env['ZENTHOS_TEST_DATABASE_URL'] ?? 'postgres://postgres:postgres@127.0.0.1:5433/zenthos_test';

describe('Postgres stores', () => {
  const pool = new Pool({ connectionString: url, connectionTimeoutMillis: 3000 });
  const box = new SecretBox('c'.repeat(64));

  beforeAll(async () => {
    await pool.query('DROP TABLE IF EXISTS repo_profiles, provider_connections, schema_migrations');
    expect(await migrate(pool)).toEqual(['001-provider-connections-and-repo-profiles']);
    expect(await migrate(pool)).toEqual([]);
  });

  afterAll(() => pool.end());

  for (const [name, check] of Object.entries(providerConnectionsContract)) it(`connections: ${name}`, () => check(new PostgresProviderConnections(pool, box)));
  for (const [name, check] of Object.entries(repoProfilesContract)) it(`profiles: ${name}`, () => check(new PostgresRepoProfiles(pool)));

  it('keeps credentials sealed in the row', async () => {
    const { rows } = await pool.query<{ secret: Buffer; public: unknown }>('SELECT secret, public FROM provider_connections LIMIT 1').catch(() => ({ rows: [] }));
    for (const row of rows) {
      expect(row.secret.toString('latin1')).not.toContain('PRIVATE KEY');
      expect(JSON.stringify(row.public)).not.toContain('PRIVATE KEY');
    }
  });
});
