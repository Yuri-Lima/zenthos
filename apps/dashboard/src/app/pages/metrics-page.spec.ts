import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { API } from '../core/api';
import { formatMetric, MetricsPage } from './metrics-page';

const ok = { ok: true, status: 200 } as Response;
const usage = (estimatedCostUsd: number) => ({ tokens: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0 }, estimatedCostUsd });
const run = (key: string, usageByAgent: object) => ({ id: key, ticket: { key, title: 't', body: '', url: 'https://example.test', labels: [] }, state: 'reviewed', createdAt: '2026-10-18T10:00:00.000Z', estimatedCostUsd: 6.5, tokens: usage(0).tokens, usageByAgent, policy: {}, history: [{ event: 'mr_opened', from: 'gates_passed', to: 'mr_opened', at: '2026-10-18T10:45:00.000Z' }] });
const metrics = [
  { metric: 'gate_failures', description: 'Failed gate results', unit: 'count', source: 'runs', value: 3, runs: 2, breakdown: { ci: 2, secret_scan: 1 } },
  { metric: 'clean_merge_rate', description: 'PRs merged clean', unit: 'ratio', source: 'scm', value: null, runs: 0 },
  { metric: 'regression_score', description: 'Latest eval scores', unit: 'ratio', source: 'evals', value: 0.4, runs: 2, breakdown: { 'spec-writer/v1 touched_area_recall': 0.4, 'reviewer/v1 review_score': 3.25 } },
];
const check = { ticketKey: 'o/r#1', available: true, sessionUrl: 'http://lf.test/s', tolerance: { relative: 0.05, absoluteUsd: 0.01 }, comparison: [{ agent: 'spec_writer', stored: usage(0.56), traced: { estimatedCostUsd: 0.5596, totalTokens: 79220 }, verdict: 'match' }, { agent: 'reviewer', stored: usage(0.9), traced: { estimatedCostUsd: 0.7155, totalTokens: 119938 }, verdict: 'mismatch' }] };

describe('MetricsPage', () => {
  it('formats each unit the way a person reads it', () => {
    expect(formatMetric(0.666, 'ratio')).toBe('67%');
    expect(formatMetric(45, 'minutes')).toBe('45 min');
    expect(formatMetric(null, 'usd')).toBe('—');
  });

  it('shows the metrics with their source, the cost split by agent, and the LangFuse check on demand', async () => {
    const calls: string[] = [];
    const api = {
      GET: async (path: string) => {
        calls.push(path);
        if (path === '/metrics') return { data: metrics, response: ok };
        if (path === '/metrics/traces') return { data: check, response: ok };
        if (path === '/glossary') return { data: { terms: [], edges: [] }, response: ok };
        return { data: [run('o/r#1', { spec_writer: usage(0.56), coding_agent: usage(5.04), reviewer: usage(0.9) }), run('o/r#2', {})], response: ok };
      },
    };
    TestBed.configureTestingModule({ imports: [MetricsPage, TranslateModule.forRoot()], providers: [provideZonelessChangeDetection(), provideRouter([]), { provide: API, useValue: api }] });
    const fixture = TestBed.createComponent(MetricsPage);
    await fixture.whenStable();
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelectorAll('article.metric')).toHaveLength(3);
    expect(host.textContent).toContain('40%');
    expect(host.textContent).toContain('reviewer/v1 review_score');
    expect(host.textContent).toContain('3.25');
    expect(host.textContent).toContain('metrics.elsewhere.scm');
    expect(fixture.componentInstance.barWidth(metrics[0] as never, 'ci')).toBe(100);
    expect(host.textContent).toContain('$5.04');
    expect(host.textContent).toContain('metrics.notSplit');
    expect(host.textContent).toContain('45 min');
    expect(calls).not.toContain('/metrics/traces');

    await fixture.componentInstance.check(fixture.componentInstance.runs()[0]);
    await fixture.whenStable();
    fixture.detectChanges();
    expect(calls).toContain('/metrics/traces');
    expect(host.textContent).toContain('metrics.verdicts.match');
    expect(host.textContent).toContain('metrics.verdicts.mismatch');
    expect(host.querySelector('a[href="http://lf.test/s"]')).not.toBeNull();
    fixture.destroy();
  });
});
