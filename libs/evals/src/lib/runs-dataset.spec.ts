import { applyEvent, createRun, repoProfile, type PullRequestState, type Run, type Spec } from '@zenthos/domain';
import type { RunsPort, ScmPort } from '@zenthos/ports';
import { buildRunsDataset } from './runs-dataset.js';

const profile = repoProfile({ repo: 'owner/repo', cloneUrl: 'x', baseBranch: 'main', allowedCommands: [], gateCommands: [] });
const spec: Spec = { ticketKey: 'owner/repo#1', problem: 'Something is missing here', inScope: ['it'], outOfScope: [], acceptanceCriteria: [{ id: 'AC-1', statement: 'It works as described', testHint: 'jest' }], touchedAreas: ['src/'], risks: [] };
const runFor = (n: number, pullRequest?: number): Run => {
  const base = createRun({ key: `owner/repo#${n}`, title: 't', body: '', url: 'https://example.test', labels: [] }, { now: new Date(2026, 0, n) });
  return pullRequest ? { ...applyEvent(base, 'spec_drafted'), spec: { ...spec, ticketKey: base.ticket.key }, pullRequest: { number: pullRequest, url: `https://example.test/pull/${pullRequest}` } } : base;
};
const states: Record<number, PullRequestState> = { 10: 'merged', 20: 'closed', 30: 'open' };
const runs: RunsPort = { save: async () => undefined, latest: async () => undefined, list: async () => [runFor(1, 10), runFor(2, 20), runFor(3, 30), runFor(4), { ...runFor(5, 10), ticket: { ...runFor(5).ticket, key: 'other/repo#5' } }] };
const scm: ScmPort = { openPullRequest: async () => ({ url: 'x', number: 1 }), findPullRequest: async () => undefined, readPullRequestDiff: async () => ({ files: ['src/a.ts'], changedLines: 1, patch: '+a' }), postReview: async () => undefined, pullRequestState: async (_p, pr) => states[pr.number] };

describe('buildRunsDataset', () => {
  it('turns runs with a judged pull request into items carrying their spec, and says why the rest were left out', async () => {
    const { dataset, skipped } = await buildRunsDataset({ runs, scm }, profile, new Date('2026-10-16T00:00:00Z'));
    expect(dataset?.source).toBe('runs');
    expect(dataset?.items.map((i) => [i.ticketKey, i.verdict, i.spec?.ticketKey])).toEqual([
      ['owner/repo#1', 'accepted', 'owner/repo#1'],
      ['owner/repo#2', 'rejected', 'owner/repo#2'],
    ]);
    expect(skipped).toEqual([
      { ticketKey: 'owner/repo#3', reason: 'pull request #30 still open' },
      { ticketKey: 'owner/repo#4', reason: 'state intake, no pull request' },
    ]);
  });

  it('returns no dataset when nothing has been judged yet', async () => {
    const empty: RunsPort = { ...runs, list: async () => [runFor(4)] };
    expect((await buildRunsDataset({ runs: empty, scm }, profile)).dataset).toBeUndefined();
  });
});
