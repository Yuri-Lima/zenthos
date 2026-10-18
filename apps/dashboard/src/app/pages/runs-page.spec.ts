import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { API } from '../core/api';
import { RunsPage } from './runs-page';

const run = (key: string, state: string) => ({ id: key, ticket: { key, title: 'Export CSV', body: '', url: 'https://example.test', labels: [] }, state, createdAt: '2026-10-18T10:00:00.000Z', estimatedCostUsd: 1.25, tokens: { inputTokens: 1, outputTokens: 2, cacheReadTokens: 0, cacheWriteTokens: 0 }, policy: {}, history: [] });

describe('RunsPage', () => {
  it('lists runs with state chips, cost and an attention strip that filters', async () => {
    const ok = { ok: true, status: 200 };
    const runs = [run('owner/repo#7', 'spec_drafted'), run('owner/repo#8', 'implemented'), run('owner/repo#9', 'done')];
    const api = { GET: async () => ({ data: runs, response: ok }), POST: async () => ({ response: ok }) };
    TestBed.configureTestingModule({ imports: [RunsPage, TranslateModule.forRoot()], providers: [provideZonelessChangeDetection(), provideRouter([]), { provide: API, useValue: api }] });
    const fixture = TestBed.createComponent(RunsPage);
    await fixture.whenStable();
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelectorAll('tr.mat-mdc-row').length).toBe(3);
    expect(host.textContent).toContain('$1.25');
    expect(fixture.componentInstance.attention().map((r) => r.ticket.key)).toEqual(['owner/repo#7']);
    fixture.componentInstance.setQuick('attention');
    await fixture.whenStable();
    fixture.detectChanges();
    expect(host.querySelectorAll('tr.mat-mdc-row').length).toBe(1);
    fixture.destroy();
  });
});
