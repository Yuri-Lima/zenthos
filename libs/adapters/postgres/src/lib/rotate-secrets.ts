import type { Pool } from 'pg';
import type { SecretBox } from './secret-box.js';

/**
 * Re-seals every connection's secret half under a new deployment key, in one transaction: either every
 * row reads with the new key afterwards or none changed. Run it with the old key still in hand, then
 * switch ZENTHOS_SECRETS_KEY everywhere the store is opened (API and worker) and restart them.
 */
export async function rotateSecrets(pool: Pool, from: SecretBox, to: SecretBox): Promise<number> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query<{ id: string; secret: Buffer }>('SELECT id, secret FROM provider_connections FOR UPDATE');
    for (const row of rows) {
      await client.query('UPDATE provider_connections SET secret = $2 WHERE id = $1', [row.id, to.seal(from.open(row.secret))]);
    }
    await client.query('COMMIT');
    return rows.length;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
