import { DomainError, type Ticket } from '@zenthos/domain';
import type { IssueTrackerPort } from '@zenthos/ports';
import { intakeTicket } from './intake-ticket.js';

const ticket: Ticket = {
  key: 'owner/repo#7',
  title: 'Fix the thing',
  body: '',
  url: 'https://github.com/owner/repo/issues/7',
  labels: ['bug'],
};

const issueTracker: IssueTrackerPort = {
  getTicket: async (key) => {
    if (key !== ticket.key) throw new DomainError('ticket_not_found', { key });
    return ticket;
  },
  postComment: async () => undefined,
};

describe('intakeTicket', () => {
  it('creates a run in intake for a known ticket', async () => {
    const run = await intakeTicket({ issueTracker }, ticket.key);
    expect(run.state).toBe('intake');
    expect(run.ticket).toEqual(ticket);
  });

  it('lets ticket_not_found propagate', async () => {
    await expect(intakeTicket({ issueTracker }, 'owner/repo#8')).rejects.toMatchObject({
      code: 'ticket_not_found',
    });
  });
});
