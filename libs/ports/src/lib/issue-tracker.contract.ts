import assert from 'node:assert/strict';
import { DomainError, type Ticket } from '@zenthos/domain';
import type { IssueTrackerPort } from './issue-tracker.port.js';

/** What an adapter test must provide to run the contract. */
export type IssueTrackerFixture = {
  port: IssueTrackerPort;
  /** A ticket that already exists in the tracker under test. */
  seeded: Ticket;
  readComments(key: string): Promise<string[]>;
};

/**
 * Behaviour every IssueTracker adapter must show. Each entry is one test case:
 * the adapter's spec file runs them all against its own fixture.
 */
export const issueTrackerContract: Record<string, (fixture: IssueTrackerFixture) => Promise<void>> = {
  'getTicket returns the seeded ticket': async ({ port, seeded }) => {
    assert.deepEqual(await port.getTicket(seeded.key), seeded);
  },
  'getTicket throws ticket_not_found for an unknown key': async ({ port }) => {
    await assert.rejects(
      port.getTicket('no-such-key'),
      (error: unknown) => error instanceof DomainError && error.code === 'ticket_not_found',
    );
  },
  // A unique body, so the check can run again and again against the same real issue.
  'postComment makes the comment readable': async ({ port, seeded, readComments }) => {
    const body = `hello from the contract ${new Date().toISOString()}`;
    await port.postComment(seeded.key, body);
    assert.ok((await readComments(seeded.key)).includes(body), 'the posted comment is not readable back');
  },
};
