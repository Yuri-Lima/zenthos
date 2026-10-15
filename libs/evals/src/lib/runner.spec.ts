import { repoProfile, type Review, type Spec, type Ticket } from '@zenthos/domain';
import type { IssueTrackerPort, ReviewerPort, ScmPort, SpecWriterPort } from '@zenthos/ports';
import { parseDataset, type GoldenDataset } from './dataset.js';
import { runReviewSuite, runSpecSuite } from './runner.js';

const dataset: GoldenDataset = parseDataset({
  repo: 'owner/repo',
  builtAt: '2026-10-15T00:00:00.000Z',
  items: [1, 2, 3].map((n) => ({ ticketKey: `owner/repo#${n}`, pullRequest: { number: n + 10, url: `https://example.test/pull/${n + 10}` }, files: ['src/a.ts', 'docs/b.md'], verdict: 'accepted' })),
});
const profile = repoProfile({ repo: 'owner/repo', cloneUrl: 'x', baseBranch: 'main', allowedCommands: [], gateCommands: [] });
const ticketFor = (key: string): Ticket => ({ key, title: 'Do the thing', body: '', url: `https://example.test/${key}`, labels: [] });
const specFor = (key: string): Spec => ({ ticketKey: key, problem: 'Something is missing here', inScope: ['it'], outOfScope: [], acceptanceCriteria: [{ id: 'AC-1', statement: 'It works as described', testHint: 'jest' }, { id: 'AC-2', statement: 'It is documented for users', testHint: 'docs' }], touchedAreas: ['src/'], risks: [] });
const goodReview: Review = {
  scores: { correctness: { score: 4, evidence: 'Matches the acceptance criteria' }, spec_coverage: { score: 4, evidence: 'Tests present for each' }, readability: { score: 4, evidence: 'Names are clear enough' }, engineering_rules: { score: 4, evidence: 'No duplication found' } },
  findings: [],
  summary: 'A focused change that does what the spec asks.',
};

const issueTracker: IssueTrackerPort = { getTicket: async (key) => ticketFor(key), postComment: async () => undefined };
const specWriter: SpecWriterPort = {
  draftSpec: async ({ ticket }) => {
    if (ticket.key.endsWith('#2')) throw new Error('model timed out');
    return specFor(ticket.key);
  },
};
const scm: ScmPort = { openPullRequest: async () => ({ url: 'x', number: 1 }), findPullRequest: async () => undefined, readPullRequestDiff: async () => ({ files: ['src/a.ts'], changedLines: 3, patch: '+a' }), postReview: async () => undefined };

describe('runSpecSuite', () => {
  it('measures each spec against the merged files and keeps failures as rows', async () => {
    const { summary, results } = await runSpecSuite({ issueTracker, specWriter, repoContext: '' }, dataset);
    expect(results.map((r) => r.error)).toEqual([undefined, 'model timed out', undefined]);
    expect(summary).toEqual({ items: 3, failed: 1, touched_area_recall: 0.5, criteria_per_spec: 2 });
  });

  it('takes the first N items in dataset order', async () => {
    const { results } = await runSpecSuite({ issueTracker, specWriter, repoContext: '' }, dataset, { limit: 1 });
    expect(results.map((r) => r.ticketKey)).toEqual(['owner/repo#1']);
  });
});

describe('runReviewSuite', () => {
  it('scores agreement with the human merge', async () => {
    let calls = 0;
    const reviewer: ReviewerPort = {
      review: async () => (calls++ === 0 ? goodReview : { ...goodReview, findings: [{ file: 'src/a.ts', severity: 'blocker', message: 'Breaks the build' }] }),
    };
    const { summary, results } = await runReviewSuite({ issueTracker, specWriter, scm, reviewer, repoContext: '' }, dataset, profile, { concurrency: 1 });
    expect(results.map((r) => r.review_agreement)).toEqual([1, undefined, 0]);
    expect(summary).toEqual({ items: 3, failed: 1, review_score: 4, review_agreement: 0.5 });
  });
});
