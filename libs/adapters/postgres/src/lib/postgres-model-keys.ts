import type { ModelKey } from '@zenthos/domain';
import type { ModelKeysPort } from '@zenthos/ports';
import type { Pool } from 'pg';
import type { SecretBox } from './secret-box.js';

type KeyRow = { workspace_id: string; provider: ModelKey['provider']; secret: Buffer; created_at: Date };

/** One row per workspace; the key itself is sealed with the deployment key, like the app secrets (ADR 010). */
export class PostgresModelKeys implements ModelKeysPort {
  constructor(
    private readonly pool: Pool,
    private readonly box: SecretBox,
  ) {}

  async get(workspaceId: string): Promise<ModelKey | undefined> {
    const { rows } = await this.pool.query<KeyRow>('SELECT * FROM workspace_model_keys WHERE workspace_id = $1', [workspaceId]);
    const row = rows[0];
    return row && { workspaceId: row.workspace_id, provider: row.provider, apiKey: this.box.open<{ apiKey: string }>(row.secret).apiKey, createdAt: row.created_at.toISOString() };
  }

  async save({ workspaceId, provider, apiKey, createdAt }: ModelKey): Promise<void> {
    await this.pool.query(
      `INSERT INTO workspace_model_keys (workspace_id, provider, secret, created_at) VALUES ($1, $2, $3, $4)
       ON CONFLICT (workspace_id) DO UPDATE SET provider = EXCLUDED.provider, secret = EXCLUDED.secret, created_at = EXCLUDED.created_at`,
      [workspaceId, provider, this.box.seal({ apiKey }), createdAt],
    );
  }

  async remove(workspaceId: string): Promise<void> {
    await this.pool.query('DELETE FROM workspace_model_keys WHERE workspace_id = $1', [workspaceId]);
  }
}
