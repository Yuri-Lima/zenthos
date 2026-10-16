import { parseConnection, type ProviderConnection, type RepoProfile } from '@zenthos/domain';
import type { ProviderConnectionsPort, RepoProfilesPort } from '@zenthos/ports';
import type { Pool } from 'pg';
import type { SecretBox } from './secret-box.js';

type ConnectionRow = { id: string; provider: ProviderConnection['provider']; name: string; public: Pick<ProviderConnection, 'installations'> & { appSlug?: string }; secret: Buffer; created_at: Date };
type SecretHalf = Pick<ProviderConnection, 'credentials' | 'app'>;

/** Connections split into a public half (queryable jsonb) and a sealed half (credentials, app secrets). */
export class PostgresProviderConnections implements ProviderConnectionsPort {
  constructor(
    private readonly pool: Pool,
    private readonly box: SecretBox,
  ) {}

  private fromRow(row: ConnectionRow): ProviderConnection {
    const secret = this.box.open<SecretHalf>(row.secret);
    return parseConnection({ id: row.id, provider: row.provider, name: row.name, installations: row.public.installations, createdAt: row.created_at.toISOString(), ...secret });
  }

  async get(id: string): Promise<ProviderConnection | undefined> {
    const { rows } = await this.pool.query<ConnectionRow>('SELECT * FROM provider_connections WHERE id = $1', [id]);
    return rows[0] && this.fromRow(rows[0]);
  }

  async findByAppId(appId: string): Promise<ProviderConnection | undefined> {
    const { rows } = await this.pool.query<ConnectionRow>('SELECT * FROM provider_connections WHERE app_id = $1', [appId]);
    return rows[0] && this.fromRow(rows[0]);
  }

  async list(): Promise<ProviderConnection[]> {
    const { rows } = await this.pool.query<ConnectionRow>('SELECT * FROM provider_connections ORDER BY created_at');
    return rows.map((row) => this.fromRow(row));
  }

  async save(connection: ProviderConnection): Promise<void> {
    const { id, provider, name, credentials, app, installations, createdAt } = connection;
    await this.pool.query(
      `INSERT INTO provider_connections (id, provider, name, app_id, public, secret, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, app_id = EXCLUDED.app_id, public = EXCLUDED.public, secret = EXCLUDED.secret`,
      [id, provider, name, credentials.type === 'github-app' ? credentials.appId : null, { installations, appSlug: app?.slug }, this.box.seal({ credentials, app }), createdAt],
    );
  }

  async remove(id: string): Promise<void> {
    await this.pool.query('DELETE FROM provider_connections WHERE id = $1', [id]);
  }
}

type ProfileRow = { repo: string; connection_id: string | null; profile: Omit<RepoProfile, 'connectionId'> };

export class PostgresRepoProfiles implements RepoProfilesPort {
  constructor(private readonly pool: Pool) {}

  private fromRow(row: ProfileRow): RepoProfile {
    return { ...row.profile, repo: row.repo, ...(row.connection_id ? { connectionId: row.connection_id } : {}) };
  }

  async get(repo: string): Promise<RepoProfile | undefined> {
    const { rows } = await this.pool.query<ProfileRow>('SELECT * FROM repo_profiles WHERE repo = $1', [repo]);
    return rows[0] && this.fromRow(rows[0]);
  }

  async list(): Promise<RepoProfile[]> {
    const { rows } = await this.pool.query<ProfileRow>('SELECT * FROM repo_profiles ORDER BY repo');
    return rows.map((row) => this.fromRow(row));
  }

  async save(profile: RepoProfile): Promise<void> {
    const { repo, connectionId, ...rest } = profile;
    await this.pool.query(
      `INSERT INTO repo_profiles (repo, connection_id, profile) VALUES ($1, $2, $3)
       ON CONFLICT (repo) DO UPDATE SET connection_id = EXCLUDED.connection_id, profile = EXCLUDED.profile, updated_at = now()`,
      [repo, connectionId ?? null, rest],
    );
  }

  async remove(repo: string): Promise<void> {
    await this.pool.query('DELETE FROM repo_profiles WHERE repo = $1', [repo]);
  }
}
