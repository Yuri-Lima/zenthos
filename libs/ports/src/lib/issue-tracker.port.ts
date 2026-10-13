import type { Ticket } from '@zenthos/domain';

/** What the core needs from any issue tracker. Adapters translate, they do not decide. */
export interface IssueTrackerPort {
  /** Throws DomainError('ticket_not_found') when the key is unknown. */
  getTicket(key: string): Promise<Ticket>;
  postComment(key: string, body: string): Promise<void>;
}
