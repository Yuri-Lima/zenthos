import { createRun, repoProfile, REVIEW_RUBRIC, type PullRequest, type Review, type Spec, type Ticket } from '@zenthos/domain';
import type { ReviewerPort, ScmPort } from '@zenthos/ports';
import { renderReviewComment, reviewChange, reviewFeedback } from './review-change.js';

const profile = repoProfile({ repo: 'owner/repo', cloneUrl: 'x', baseBranch: 'staging', allowedCommands: [], gateCommands: [] });
const ticket: Ticket = { key: 'owner/repo#1', title: 't', body: '', url: 'https://example.test/1', labels: [] };
const spec: Spec = { ticketKey: ticket.key, problem: 'Users cannot export', inScope: ['export'], outOfScope: [], acceptanceCriteria: [{ id: 'AC-1', statement: 'Export downloads a CSV file', testHint: 'Playwright' }], touchedAreas: ['src'], risks: [] };
const pullRequest: PullRequest = { url: 'https://example.test/pull/9', number: 9 };
const review: Review = {
  scores: {
    correctness: { score: 5, evidence: 'Implements AC-1 as written' },
    spec_coverage: { score: 4, evidence: 'The test covers the download' },
    readability: { score: 4, evidence: 'Clear names throughout' },
    engineering_rules: { score: 5, evidence: 'No tooling edits, one constant' },
  },
  findings: [{ file: 'src/export.ts', line: 3, severity: 'minor', message: 'Name the delimiter constant' }],
  summary: 'Focused change that matches the spec.',
};

function deps(result: Review) {
  const posted: string[] = [];
  const scm: ScmPort = {
    openPullRequest: async () => pullRequest,
    findPullRequest: async () => pullRequest,
    readPullRequestDiff: async () => ({ files: ['src/export.ts'], changedLines: 20, patch: '+export' }),
    postReview: async ({ body }) => {
      posted.push(body);
    },
    pullRequestState: async () => 'open',
  };
  const reviewer: ReviewerPort = { review: async () => result };
  return { reviewer, scm, posted };
}

describe('reviewChange', () => {
  it('posts the rubric and passes the gate for a good review', async () => {
    const d = deps(review);
    const run = { ...createRun(ticket, { policy: profile.policy }), spec, pullRequest };
    const { gate } = await reviewChange(d, run, profile);
    expect(gate).toEqual({ gate: 'review_threshold', passed: true });
    expect(d.posted[0]).toContain('passes the gate');
    expect(d.posted[0]).toContain('- correctness: **5/5**');
    expect(d.posted[0]).toContain('**minor** `src/export.ts:3`');
  });

  it('fails the gate on a blocker and turns the review into feedback', async () => {
    const blocked: Review = { ...review, findings: [{ file: 'src/export.ts', severity: 'blocker', message: 'Writes the file to the wrong directory' }] };
    const d = deps(blocked);
    const run = { ...createRun(ticket, { policy: profile.policy }), spec, pullRequest };
    const { gate } = await reviewChange(d, run, profile);
    expect(gate.passed).toBe(false);
    expect(d.posted[0]).toContain('does not pass the gate');
    expect(reviewFeedback(blocked)).toBe('Focused change that matches the spec.\nblocker src/export.ts: Writes the file to the wrong directory');
  });

  it('renders the rubric definitions so a human reads the same words', () => {
    expect(renderReviewComment(review, { gate: 'review_threshold', passed: true })).toContain(`<b>correctness</b> 5/5: ${REVIEW_RUBRIC.correctness}`);
  });
});
