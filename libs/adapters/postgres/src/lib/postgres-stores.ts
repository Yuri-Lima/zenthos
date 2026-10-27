import { parseConnection, type ProviderConnection, type RepoProfile } from '@zenthos/domain';
import type { ProviderConnectionsPort, RepoProfilesPort } from '@zenthos/ports';
import type { Pool } from 'pg';
import type { SecretBox } from './secret-box.js';

type ConnectionRow = { id: string; provider: ProviderConnection['provider']; name: string; public: Pick<ProviderConnection, 'installations'> & { appSlug?: string }; secret: Buffer; workspace_id: string | null; created_at: Date };
type SecretHalf = Pick<ProviderConnection, 'credentials' | 'app'>;

/** Connections split into a public half (queryable jsonb) and a sealed half (credentials, app secrets). */
export class PostgresProviderConnections implements ProviderConnectionsPort {
  constructor(
    private readonly pool: Pool,
    private readonly box: SecretBox,
  ) {}

  private fromRow(row: ConnectionRow): ProviderConnection {
    const secret = this.box.open<SecretHalf>(row.secret);
    return parseConnection({ id: row.id, provider: row.provider, name: row.name, installations: row.public.installations, ...(row.workspace_id ? { workspaceId: row.workspace_id } : {}), createdAt: row.created_at.toISOString(), ...secret });
  }

  async get(id: string): Promise<ProviderConnection | undefined> {
    const { rows } = await this.pool.query<ConnectionRow>('SELECT * FROM provider_connections WHERE id = $1', [id]);
    return rows[0] && this.fromRow(rows[0]);
  }

  async findByAppId(appId: string): Promise<ProviderConnection | undefined> {
    const { rows } = await this.pool.query<ConnectionRow>('SELECT * FROM provider_connections WHERE app_id = $1', [appId]);
    return rows[0] && this.fromRow(rows[0]);
  }

  async platformApp(): Promise<ProviderConnection | undefined> {
    const { rows } = await this.pool.query<ConnectionRow>('SELECT * FROM provider_connections WHERE workspace_id IS NULL AND app_id IS NOT NULL ORDER BY created_at LIMIT 1');
    return rows[0] && this.fromRow(rows[0]);
  }

  async list(workspaceId: string): Promise<ProviderConnection[]> {
    const { rows } = await this.pool.query<ConnectionRow>('SELECT * FROM provider_connections WHERE workspace_id = $1 ORDER BY created_at', [workspaceId]);
    return rows.map((row) => this.fromRow(row));
  }

  async save(connection: ProviderConnection): Promise<void> {
    const { id, provider, name, credentials, app, installations, workspaceId, createdAt } = connection;
    await this.pool.query(
      `INSERT INTO provider_connections (id, provider, name, app_id, public, secret, workspace_id, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, app_id = EXCLUDED.app_id, public = EXCLUDED.public, secret = EXCLUDED.secret, workspace_id = EXCLUDED.workspace_id`,
      [id, provider, name, credentials.type === 'github-app' ? credentials.appId : null, { installations, appSlug: app?.slug }, this.box.seal({ credentials, app }), workspaceId ?? null, createdAt],
    );
  }

  async remove(id: string): Promise<void> {
    await this.pool.query('DELETE FROM provider_connections WHERE id = $1', [id]);
  }
}

type ProfileRow = { repo: string; connection_id: string | null; workspace_id: string | null; profile: Omit<RepoProfile, 'connectionId' | 'workspaceId'> };

export class PostgresRepoProfiles implements RepoProfilesPort {
  constructor(private readonly pool: Pool) {}

  private fromRow(row: ProfileRow): RepoProfile {
    return { ...row.profile, repo: row.repo, ...(row.connection_id ? { connectionId: row.connection_id } : {}), ...(row.workspace_id ? { workspaceId: row.workspace_id } : {}) };
  }

  async get(repo: string): Promise<RepoProfile | undefined> {
    const { rows } = await this.pool.query<ProfileRow>('SELECT * FROM repo_profiles WHERE repo = $1', [repo]);
    return rows[0] && this.fromRow(rows[0]);
  }

  async list(workspaceId: string): Promise<RepoProfile[]> {
    const { rows } = await this.pool.query<ProfileRow>('SELECT * FROM repo_profiles WHERE workspace_id = $1 ORDER BY repo', [workspaceId]);
    return rows.map((row) => this.fromRow(row));
  }

  async save(profile: RepoProfile): Promise<void> {
    const { repo, connectionId, workspaceId, ...rest } = profile;
    await this.pool.query(
      `INSERT INTO repo_profiles (repo, connection_id, workspace_id, profile) VALUES ($1, $2, $3, $4)
       ON CONFLICT (repo) DO UPDATE SET connection_id = EXCLUDED.connection_id, workspace_id = EXCLUDED.workspace_id, profile = EXCLUDED.profile, updated_at = now()`,
      [repo, connectionId ?? null, workspaceId ?? null, rest],
    );
  }

  async remove(repo: string): Promise<void> {
    await this.pool.query('DELETE FROM repo_profiles WHERE repo = $1', [repo]);
  }
}
