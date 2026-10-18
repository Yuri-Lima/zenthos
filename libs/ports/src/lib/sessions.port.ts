import type { Session } from '@zenthos/domain';

/** Dashboard sessions. Stores keep a hash of the id, never the id. */
export interface SessionsPort {
  create(session: Session): Promise<void>;
  get(id: string): Promise<Session | undefined>;
  remove(id: string): Promise<void>;
}
