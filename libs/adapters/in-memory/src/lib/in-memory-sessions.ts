import type { Session } from '@zenthos/domain';
import type { SessionsPort } from '@zenthos/ports';

export class InMemorySessions implements SessionsPort {
  private readonly byId = new Map<string, Session>();

  async create(session: Session): Promise<void> {
    this.byId.set(session.id, session);
  }

  async get(id: string): Promise<Session | undefined> {
    return this.byId.get(id);
  }

  async remove(id: string): Promise<void> {
    this.byId.delete(id);
  }
}
