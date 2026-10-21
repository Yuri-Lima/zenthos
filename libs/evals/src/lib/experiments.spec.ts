import { NO_USAGE, repoProfile, type Review, type Spec, type Ticket } from '@zenthos/domain';
import type { IssueTrackerPort, ReviewerPort, ScmPort, SpecWriterPort } from '@zenthos/ports';
import { datasetNameFor, fromDatasetItem, toDatasetItem, type GoldenItem } from './dataset.js';
import { reviewExperiment, specExperiment, stampRunScores, summarize } from './experiments.js';

const profile = repoProfile({ repo: 'owner/repo', cloneUrl: 'x', baseBranch: 'main', allowedCommands: [], gateCommands: [] });
const golden = (n: number, verdict: 'accepted' | 'rejected' = 'accepted', spec?: Spec): GoldenItem => ({ ticketKey: `owner/repo#${n}`, pullRequest: { number: n + 10, url: `https://example.test/pull/${n + 10}` }, files: ['src/a.ts', 'docs/b.md'], verdict, ...(spec ? { spec } : {}) });
const ticketFor = (key: string): Ticket => ({ key, title: 'Do the thing', body: '', url: `https://example.test/${key}`, labels: [] });
const specFor = (key: string): Spec => ({ ticketKey: key, problem: 'Something is missing here', inScope: ['it'], outOfScope: [], acceptanceCriteria: [{ id: 'AC-1', statement: 'It works as described', testHint: 'jest' }, { id: 'AC-2', statement: 'It is documented for users', testHint: 'docs' }], touchedAreas: ['src/'], risks: [] });
const review = (score: number): Review => ({
  scores: { correctness: { score, evidence: 'Matches the acceptance criteria' }, spec_coverage: { score, evidence: 'Tests present for each' }, readability: { score, evidence: 'Names are clear enough' }, engineering_rules: { score, evidence: 'No duplication found' } },
  findings: [],
  summary: 'A focused change that does what the spec asks.',
});

const issueTracker: IssueTrackerPort = { getTicket: async (key) => ticketFor(key), postComment: async () => undefined };
const drafted: string[] = [];
const specWriter: SpecWriterPort = { draftSpec: async ({ ticket }) => (drafted.push(ticket.key), { spec: specFor(ticket.key), ...NO_USAGE }) };
const scm: ScmPort = { openPullRequest: async () => ({ url: 'x', number: 1 }), findPullRequest: async () => undefined, readPullRequestDiff: async () => ({ files: ['src/a.ts'], changedLines: 3, patch: '+a' }), postReview: async () => undefined, pullRequestState: async () => 'open' };
const reviewer: ReviewerPort = { review: async ({ spec }) => ({ review: review(spec.ticketKey.endsWith('#2') ? 2 : 4), ...NO_USAGE }) };

describe('dataset items', () => {
  it('round-trip through the LangFuse shape with a stable id, and refuse an item edited out of shape', () => {
    const name = datasetNameFor('owner/repo', 'runs');
    const item = toDatasetItem(name, golden(1, 'accepted', specFor('owner/repo#1')));
    expect(item.id).toBe('owner-repo-runs:owner/repo#1');
    expect(item.expectedOutput).toEqual({ files: ['src/a.ts', 'docs/b.md'], verdict: 'accepted' });
    expect(fromDatasetItem(item)).toEqual(golden(1, 'accepted', specFor('owner/repo#1')));
    expect(() => fromDatasetItem({ input: { ticketKey: 'x' }, expectedOutput: {} })).toThrow();
  });
});

describe('specExperiment', () => {
  it('drafts a spec per item, scores recall and criteria, and averages them per run', async () => {
    const experiment = specExperiment({ issueTracker, specWriter, repoContext: '' }, 'spec-writer/v1');
    const item = toDatasetItem('owner-repo', golden(1));
    const output = await experiment.task(item);
    const evaluations = (await Promise.all(experiment.evaluators.map((evaluate) => evaluate({ ...item, output })))).flat();
    expect(evaluations.map((e) => [e.name, e.value])).toEqual([['touched_area_recall', 0.5], ['criteria_per_spec', 2]]);
    const runEvaluations = (await Promise.all(experiment.runEvaluators.map((evaluate) => evaluate({ itemResults: [{ evaluations }, { evaluations: [{ name: 'touched_area_recall', value: 1 }] }] })))).flat();
    expect(runEvaluations).toEqual([{ name: 'mean_touched_area_recall', value: 0.75 }, { name: 'mean_criteria_per_spec', value: 2 }]);
    const [stamped] = await stampRunScores(experiment, 'owner-repo', false).runEvaluators[0]({ itemResults: [{ evaluations }] });
    expect(stamped.metadata).toEqual({ suite: 'spec', promptVersion: 'spec-writer/v1', dataset: 'owner-repo' });
    const [dry] = await stampRunScores(experiment, 'owner-repo', true).runEvaluators[0]({ itemResults: [{ evaluations }] });
    expect(dry.metadata?.['dryRun']).toBe('true');
    expect(summarize('spec', { itemResults: [{ evaluations, output }, { evaluations: [], output: undefined }], runEvaluations })).toEqual({ items: 2, failed: 1, touched_area_recall: 0.75, criteria_per_spec: 2 });
  });
});

describe('reviewExperiment', () => {
  it('reviews against the stored spec when the item has one, and agrees with the human only when the gate does', async () => {
    drafted.length = 0;
    const experiment = reviewExperiment({ issueTracker, specWriter, scm, reviewer, repoContext: '' }, profile, 'reviewer/v1');
    const score = async (item: GoldenItem) => {
      const datasetItem = toDatasetItem('owner-repo-runs', item);
      const output = await experiment.task(datasetItem);
      return (await Promise.all(experiment.evaluators.map((evaluate) => evaluate({ ...datasetItem, output })))).flat().map((e) => [e.name, e.value]);
    };
    expect(await score(golden(1, 'accepted', specFor('owner/repo#1')))).toEqual([['review_score', 4], ['review_agreement', 1]]);
    expect(await score(golden(2, 'accepted'))).toEqual([['review_score', 2], ['review_agreement', 0]]);
    expect(drafted).toEqual(['owner/repo#2']);
  });
});
