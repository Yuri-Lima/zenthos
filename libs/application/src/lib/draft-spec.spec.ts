import { APPROVAL_LABELS, createRun, type Spec, type Ticket } from '@zenthos/domain';
import type { IssueTrackerPort, SpecWriterPort } from '@zenthos/ports';
import { draftSpec } from './draft-spec.js';
import { readApproval } from './read-approval.js';

const ticket: Ticket = {
  key: 'owner/repo#3',
  title: 'Filter by label',
  body: 'Users want to filter the list by label',
  url: 'https://github.com/owner/repo/issues/3',
  labels: [],
};

const spec: Spec = {
  ticketKey: ticket.key,
  problem: 'Users cannot filter the list by label',
  inScope: ['label filter'],
  outOfScope: [],
  acceptanceCriteria: [{ id: 'AC-1', statement: 'Picking a label shows only matching rows', testHint: 'Playwright' }],
  touchedAreas: ['src/routes/list'],
  risks: [],
};

function fakeTracker(labels: string[]) {
  const comments: string[] = [];
  const port: IssueTrackerPort = {
    getTicket: async () => ({ ...ticket, labels }),
    postComment: async (_key, body) => {
      comments.push(body);
    },
  };
  return { port, comments };
}

const specWriter: SpecWriterPort = { draftSpec: async () => ({ spec, tokens: { inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, cacheWriteTokens: 0 }, estimatedCostUsd: 0.01 }) };

describe('draftSpec', () => {
  it('posts the spec as a comment that names the approval labels', async () => {
    const tracker = fakeTracker([]);
    const result = await draftSpec({ specWriter, issueTracker: tracker.port }, createRun(ticket), '');
    expect(result.spec).toEqual(spec);
    expect(result.estimatedCostUsd).toBe(0.01);
    expect(tracker.comments).toHaveLength(1);
    expect(tracker.comments[0]).toContain('AC-1');
    expect(tracker.comments[0]).toContain(APPROVAL_LABELS.approved);
  });
});

describe('readApproval', () => {
  it('maps the ticket labels to a decision', async () => {
    expect(await readApproval({ issueTracker: fakeTracker([]).port }, ticket.key)).toBe('pending');
    expect(await readApproval({ issueTracker: fakeTracker([APPROVAL_LABELS.approved]).port }, ticket.key)).toBe('approved');
  });
});
