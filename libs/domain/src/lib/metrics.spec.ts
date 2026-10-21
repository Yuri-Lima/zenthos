import { applyEvent, createRun, withUsage, type Run } from './run.js';
import type { Ticket } from './ticket.js';
import { computeMetrics, METRICS } from './metrics.js';
import { fail, pass } from './gate.js';

const ticket = (n: number): Ticket => ({ key: `owner/repo#${n}`, title: 't', body: '', url: 'https://example.test', labels: [] });
const at = (base: string, minutes: number) => new Date(Date.parse(base) + minutes * 60_000);

function runWith(n: number, steps: { event: Parameters<typeof applyEvent>[1]; minutes: number }[], extra: Partial<Run> = {}): Run {
  const start = '2026-10-01T10:00:00.000Z';
  let run = createRun(ticket(n), { now: new Date(start) });
  for (const { event, minutes } of steps) run = applyEvent(run, event, at(start, minutes));
  return { ...run, ...extra };
}

describe('computeMetrics', () => {
  it('answers from the runs store what it can, and names the source of what it cannot', () => {
    const merged = withUsage(
      runWith(1, [{ event: 'spec_drafted', minutes: 1 }, { event: 'spec_approved', minutes: 5 }, { event: 'implemented', minutes: 30 }, { event: 'gates_passed', minutes: 32 }, { event: 'mr_opened', minutes: 33 }], {
        gates: [pass('ci'), fail('review_threshold', 'low')],
      }),
      { tokens: { inputTokens: 1000, outputTokens: 200, cacheReadTokens: 50, cacheWriteTokens: 0 }, estimatedCostUsd: 6 },
      'coding_agent',
    );
    const escalated = runWith(2, [{ event: 'spec_drafted', minutes: 1 }, { event: 'spec_rejected', minutes: 2 }, { event: 'spec_drafted', minutes: 3 }, { event: 'spec_rejected', minutes: 4 }, { event: 'escalated', minutes: 4 }]);
    const fresh = withUsage(runWith(3, [{ event: 'spec_drafted', minutes: 1 }, { event: 'spec_approved', minutes: 2 }, { event: 'implemented', minutes: 10 }, { event: 'gates_passed', minutes: 12 }, { event: 'mr_opened', minutes: 13 }]), { tokens: { inputTokens: 500, outputTokens: 100, cacheReadTokens: 0, cacheWriteTokens: 0 }, estimatedCostUsd: 2 }, 'coding_agent');
    const metrics = Object.fromEntries(computeMetrics([merged, escalated, fresh]).map((m) => [m.metric, m]));

    expect(metrics['spec_approval_rate']).toMatchObject({ value: 0.5, breakdown: { drafted: 4, approved: 2 }, runs: 3 });
    expect(metrics['ticket_to_pr_minutes']).toMatchObject({ value: 23, runs: 2 });
    expect(metrics['cost_per_ticket_usd']).toMatchObject({ value: 4, breakdown: { total: 8 }, runs: 2 });
    expect(metrics['tokens_per_ticket']).toMatchObject({ value: 600, breakdown: { input: 1500, output: 300, cacheRead: 50, cacheWrite: 0 } });
    expect(metrics['gate_failures']).toMatchObject({ value: 1, breakdown: expect.objectContaining({ review_threshold: 1, ci: 0 }) });
    expect(metrics['clean_merge_rate']).toMatchObject({ value: null, source: 'scm' });
    expect(metrics['reviewer_agreement']).toMatchObject({ value: null, source: 'evals' });
    expect(Object.keys(metrics)).toEqual(Object.keys(METRICS));
  });

  it('fills reviewer agreement and the regression score from the latest eval run of each suite', () => {
    const run = (suite: 'spec' | 'review', createdAt: string, promptVersion: string, scores: Record<string, number>) => ({ suite, dataset: 'o-r', promptVersion, runName: `${suite} ${createdAt}`, createdAt, scores });
    const metrics = Object.fromEntries(
      computeMetrics([], [
        run('spec', '2026-10-18T10:00:00.000Z', 'spec-writer/v1', { touched_area_recall: 0.4, criteria_per_spec: 4.6 }),
        run('spec', '2026-10-21T10:00:00.000Z', 'spec-writer/v2', { touched_area_recall: 0.7, criteria_per_spec: 5 }),
        run('review', '2026-10-20T10:00:00.000Z', 'reviewer/v1', { review_agreement: 0.5, review_score: 3.1 }),
      ]).map((m) => [m.metric, m]),
    );
    expect(metrics['reviewer_agreement']).toMatchObject({ value: 0.5, runs: 1 });
    expect(metrics['regression_score']).toMatchObject({ value: 0.7, runs: 2, breakdown: { 'spec-writer/v2 touched_area_recall': 0.7, 'spec-writer/v2 criteria_per_spec': 5, 'reviewer/v1 review_agreement': 0.5, 'reviewer/v1 review_score': 3.1 } });
  });

  it('is empty-safe', () => {
    for (const m of computeMetrics([])) expect(m.value === null || m.value === 0).toBe(true);
  });
});
