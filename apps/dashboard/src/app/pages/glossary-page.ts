import { DecimalPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { TranslateModule } from '@ngx-translate/core';
import { TERM_KINDS } from '@zenthos/domain';
import { GlossaryService, type Term } from '../core/glossary';

/** The knowledge base as a page: terms by kind, searchable, each with its relations as links and the ADR that decided it (ADR 014). */
@Component({
  selector: 'zen-glossary-page',
  imports: [DecimalPipe, FormsModule, TranslateModule, MatFormFieldModule, MatIconModule, MatInputModule],
  styles: `
    .toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; margin-bottom: 14px; }
    .kinds { display: flex; flex-wrap: wrap; gap: 6px; }
    .kind { border: 1px solid var(--zen-line); background: var(--zen-surface); border-radius: 999px; padding: 3px 10px; font: inherit; font-size: 12px; color: var(--zen-muted); cursor: pointer; }
    .kind.on { border-color: var(--zen-accent); color: var(--zen-accent); background: var(--zen-accent-soft); }
    .group { margin-bottom: 22px; }
    .group h2 { font-family: var(--zen-mono); font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--zen-muted); margin: 0 0 8px; }
    .term { padding: 12px 14px; display: grid; gap: 6px; scroll-margin-top: 70px; }
    .term:target { outline: 2px solid var(--zen-accent); }
    .term h3 { margin: 0; font-size: 14px; display: flex; align-items: baseline; gap: 8px; }
    .term h3 code { font-family: var(--zen-mono); font-size: 11px; color: var(--zen-muted); font-weight: 400; }
    .def { margin: 0; font-size: 13.5px; max-width: 80ch; }
    .rel { display: flex; flex-wrap: wrap; gap: 6px; font-size: 12px; align-items: center; }
    .rel a { color: var(--zen-accent); text-decoration: none; border: 1px solid var(--zen-line); border-radius: 999px; padding: 1px 8px; }
    .rel a:hover { border-color: var(--zen-accent); }
    .rel .r { font-family: var(--zen-mono); color: var(--zen-muted); }
    .adr { font-family: var(--zen-mono); font-size: 11px; color: var(--zen-muted); }
    .list { display: grid; gap: 8px; }
  `,
  template: `
    <div class="toolbar">
      <div><div class="eyebrow">{{ 'glossaryPage.eyebrow' | translate }}</div><h1 class="text-lg font-semibold m-0">{{ 'glossaryPage.title' | translate }}</h1></div>
      <span class="flex-1"></span>
      <mat-form-field appearance="outline" subscriptSizing="dynamic" class="w-72">
        <mat-icon matPrefix>search</mat-icon>
        <input matInput [ngModel]="query()" (ngModelChange)="query.set($event)" [placeholder]="'glossaryPage.search' | translate" id="glossary-search" />
      </mat-form-field>
    </div>
    <div class="kinds mb-4" role="group">
      <button class="kind" [class.on]="kind() === undefined" (click)="kind.set(undefined)">{{ 'glossaryPage.all' | translate }} · {{ glossary.terms().length }}</button>
      @for (k of kinds; track k) {<button class="kind" [class.on]="kind() === k" (click)="kind.set(k)">{{ 'termKind.' + k | translate }} · {{ count(k) }}</button>}
    </div>
    @for (group of groups(); track group.kind) {
      <section class="group">
        <h2>{{ 'termKind.' + group.kind | translate }}</h2>
        <div class="list">
          @for (term of group.terms; track term.id) {
            <article class="surface term" [id]="term.id">
              <h3>{{ glossary.title(term) }} <code>{{ term.id }}</code>@if (term.adr) {<span class="adr">ADR {{ term.adr | number: '3.0-0' }}</span>}</h3>
              <p class="def">{{ glossary.definition(term) }}</p>
              @if (term.related.length) {
                <div class="rel">
                  @for (r of term.related; track r.to + r.rel) {<span><span class="r">{{ 'relation.' + r.rel | translate }}</span> <a [href]="'/glossary#' + r.to" (click)="jump($event, r.to)">{{ titleOf(r.to) }}</a></span>}
                </div>
              }
            </article>
          }
        </div>
      </section>
    }
  `,
})
export class GlossaryPage {
  readonly glossary = inject(GlossaryService);
  readonly query = signal('');
  readonly kind = signal<string | undefined>(undefined);
  readonly kinds = TERM_KINDS;
  readonly groups = computed(() => {
    const q = this.query().trim().toLowerCase();
    const kind = this.kind();
    const match = (t: Term) => (!kind || t.kind === kind) && (!q || `${this.glossary.title(t)} ${this.glossary.definition(t)} ${t.id}`.toLowerCase().includes(q));
    return TERM_KINDS.map((k) => ({ kind: k, terms: this.glossary.terms().filter((t) => t.kind === k && match(t)) })).filter((g) => g.terms.length);
  });

  constructor() {
    void this.glossary.load().then(() => queueMicrotask(() => this.scrollToHash()));
  }

  count(kind: string) {
    return this.glossary.terms().filter((t) => t.kind === kind).length;
  }

  titleOf(id: string) {
    const term = this.glossary.term(id);
    return term ? this.glossary.title(term) : id;
  }

  jump(event: Event, id: string) {
    event.preventDefault();
    this.query.set('');
    this.kind.set(undefined);
    history.replaceState(null, '', `/glossary#${id}`);
    queueMicrotask(() => this.scrollToHash());
  }

  private scrollToHash() {
    const id = location.hash.slice(1);
    if (id) document.getElementById(id)?.scrollIntoView({ block: 'start' });
  }
}
