import type { Ticket } from '@zenthos/domain';
import { issueTrackerContract } from '@zenthos/ports';
import { InMemoryIssueTracker } from './in-memory-issue-tracker.js';

const seeded: Ticket = {
  key: 'memory#1',
  title: 'Seeded ticket',
  body: 'body',
  url: 'https://example.test/memory/1',
  labels: [],
};

describe('InMemoryIssueTracker', () => {
  for (const [name, check] of Object.entries(issueTrackerContract)) {
    it(name, async () => {
      const port = new InMemoryIssueTracker().seed(seeded);
      await check({ port, seeded, readComments: async (key) => port.commentsOf(key) });
    });
  }
});
