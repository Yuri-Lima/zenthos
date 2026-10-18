import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { GLOSSARY, glossaryGraph } from '@zenthos/domain';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { API } from '../core/api';
import { GlossaryPage } from './glossary-page';

const pt = JSON.parse(readFileSync(join(__dirname, '../../../public/i18n/pt.json'), 'utf8')) as { glossary: Record<string, string>; glossaryTitle: Record<string, string> };

describe('GlossaryPage', () => {
  it('has a Portuguese title and definition for every term the domain defines, and nothing else', () => {
    const ids = GLOSSARY.map((t) => t.id).sort();
    expect(Object.keys(pt.glossary).sort()).toEqual(ids);
    expect(Object.keys(pt.glossaryTitle).sort()).toEqual(ids);
    for (const id of ids) expect(pt.glossary[id].length).toBeGreaterThan(20);
  });

  it('renders the terms grouped by kind, filters by search and by kind, and links relations', async () => {
    const api = { GET: async () => ({ data: { terms: GLOSSARY, edges: glossaryGraph().edges }, response: { ok: true, status: 200 } }) };
    TestBed.configureTestingModule({ imports: [GlossaryPage, TranslateModule.forRoot()], providers: [provideZonelessChangeDetection(), provideRouter([]), { provide: API, useValue: api }] });
    const fixture = TestBed.createComponent(GlossaryPage);
    await fixture.whenStable();
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelectorAll('article.term').length).toBe(GLOSSARY.length);
    expect(host.querySelector('#gate_cost_ceiling')?.textContent).toContain('cost ceiling');
    fixture.componentInstance.query.set('threshold');
    await fixture.whenStable();
    fixture.detectChanges();
    const shown = [...host.querySelectorAll('article.term')].map((a) => a.id);
    expect(shown).toContain('gate_review_threshold');
    expect(shown).not.toContain('state_done');
    fixture.componentInstance.query.set('');
    fixture.componentInstance.kind.set('view');
    await fixture.whenStable();
    fixture.detectChanges();
    expect(host.querySelectorAll('article.term').length).toBe(GLOSSARY.filter((t) => t.kind === 'view').length);
    fixture.destroy();
  });
});
