import { DomainError, type Ticket } from '@zenthos/domain';
import type { IssueTrackerPort } from '@zenthos/ports';

/** IssueTracker for tests and local dry runs. Nothing leaves the process. */
export class InMemoryIssueTracker implements IssueTrackerPort {
  private readonly tickets = new Map<string, Ticket>();
  private readonly comments = new Map<string, string[]>();

  seed(ticket: Ticket): this {
    this.tickets.set(ticket.key, ticket);
    return this;
  }

  async getTicket(key: string): Promise<Ticket> {
    const ticket = this.tickets.get(key);
    if (!ticket) throw new DomainError('ticket_not_found', { key });
    return ticket;
  }

  async postComment(key: string, body: string): Promise<void> {
    await this.getTicket(key);
    const list = this.comments.get(key) ?? [];
    list.push(body);
    this.comments.set(key, list);
  }

  commentsOf(key: string): string[] {
    return [...(this.comments.get(key) ?? [])];
  }
}
