import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { API } from '../core/api';
import { RunsPage } from './runs-page';

const run = { id: '1', ticket: { key: 'owner/repo#7', title: 'Export CSV', body: '', url: 'https://example.test', labels: [] }, state: 'spec_drafted', createdAt: '2026-10-18T10:00:00.000Z', estimatedCostUsd: 1.25, tokens: { inputTokens: 1, outputTokens: 2, cacheReadTokens: 0, cacheWriteTokens: 0 }, policy: {}, history: [] };

describe('RunsPage', () => {
  it('lists runs from the API with their state and cost', async () => {
    const calls: unknown[][] = [];
    const ok = { ok: true, status: 200 };
    const api = { GET: async (...args: unknown[]) => (calls.push(args), { data: [run], response: ok }), POST: async () => ({ response: ok }) };
    TestBed.configureTestingModule({ imports: [RunsPage, TranslateModule.forRoot()], providers: [provideZonelessChangeDetection(), provideRouter([]), { provide: API, useValue: api }] });
    const fixture = TestBed.createComponent(RunsPage);
    await fixture.whenStable();
    fixture.detectChanges();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(calls[0][0]).toBe('/runs');
    expect(text).toContain('owner/repo#7');
    expect(text).toContain('$1.25');
    fixture.destroy();
  });
});
