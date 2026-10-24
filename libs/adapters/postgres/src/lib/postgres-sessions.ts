import { createHash } from 'node:crypto';
import type { Session } from '@zenthos/domain';
import type { SessionsPort } from '@zenthos/ports';
import type { Pool } from 'pg';

const hash = (id: string) => createHash('sha256').update(id).digest('hex');

/** Sessions keyed by the hash of the cookie value, so a copy of the table signs nobody in. */
export class PostgresSessions implements SessionsPort {
  constructor(private readonly pool: Pool) {}

  async save({ id, ...stored }: Session): Promise<void> {
    await this.pool.query('INSERT INTO sessions (id_hash, session, expires_at) VALUES ($1, $2, $3) ON CONFLICT (id_hash) DO UPDATE SET session = EXCLUDED.session, expires_at = EXCLUDED.expires_at', [hash(id), stored, stored.expiresAt]);
  }

  async get(id: string): Promise<Session | undefined> {
    const { rows } = await this.pool.query<{ session: Omit<Session, 'id'> }>('SELECT session FROM sessions WHERE id_hash = $1', [hash(id)]);
    return rows[0] ? { id, ...rows[0].session } : undefined;
  }

  async remove(id: string): Promise<void> {
    await this.pool.query('DELETE FROM sessions WHERE id_hash = $1', [hash(id)]);
  }
}
