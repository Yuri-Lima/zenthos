import { createHash } from 'node:crypto';
import type { Session } from '@zenthos/domain';
import type { SessionsPort } from '@zenthos/ports';
import type { Pool } from 'pg';

const hash = (id: string) => createHash('sha256').update(id).digest('hex');

/** Sessions keyed by the hash of the cookie value, so a copy of the table signs nobody in. */
export class PostgresSessions implements SessionsPort {
  constructor(private readonly pool: Pool) {}

  async create(session: Session): Promise<void> {
    const stored = { user: session.user, createdAt: session.createdAt, expiresAt: session.expiresAt };
    await this.pool.query('INSERT INTO sessions (id_hash, session, expires_at) VALUES ($1, $2, $3)', [hash(session.id), stored, session.expiresAt]);
  }

  async get(id: string): Promise<Session | undefined> {
    const { rows } = await this.pool.query<{ session: Omit<Session, 'id'> }>('SELECT session FROM sessions WHERE id_hash = $1', [hash(id)]);
    return rows[0] ? { id, ...rows[0].session } : undefined;
  }

  async remove(id: string): Promise<void> {
    await this.pool.query('DELETE FROM sessions WHERE id_hash = $1', [hash(id)]);
  }
}
