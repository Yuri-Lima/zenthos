import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, inject, input, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { poll } from '../core/poll';
import { RunsService, type Run } from '../core/runs';
import { awaitsDecision, STATE_SEVERITY, usd } from '../shared/run-state';

@Component({
  selector: 'zen-run-detail-page',
  imports: [DatePipe, DecimalPipe, RouterLink, TranslateModule, MatButtonModule, MatIconModule],
  template: `
    <a routerLink="/" class="text-sm no-underline text-sky-800">← {{ 'runs.title' | translate }}</a>
    @if (run(); as run) {
      <header class="flex flex-wrap items-center gap-3 mt-3 mb-2">
        <h1 class="text-xl font-semibold m-0">{{ run.ticket.key }}</h1>
        <span [class]="'zen-chip ' + severity[run.state]">{{ 'state.' + run.state | translate }}</span>
        <span class="flex-1"></span>
        <span class="tabular-nums text-sm">{{ usd(run.estimatedCostUsd) }} · {{ run.tokens.inputTokens + run.tokens.outputTokens | number }} {{ 'run.tokens' | translate }}</span>
        @if (run.pullRequest; as pr) {
          <a mat-stroked-button [href]="pr.url" target="_blank" rel="noopener"><mat-icon>open_in_new</mat-icon>{{ 'run.pullRequest' | translate: { number: pr.number } }}</a>
        }
        @if (awaitsDecision(run)) {
          <button mat-flat-button (click)="decide('approved')" [disabled]="busy()"><mat-icon>check</mat-icon>{{ 'run.approve' | translate }}</button>
          <button mat-stroked-button (click)="decide('rejected')" [disabled]="busy()"><mat-icon>close</mat-icon>{{ 'run.reject' | translate }}</button>
        }
      </header>
      <p class="text-slate-500 m-0 mb-6">{{ run.ticket.title }} · <a [href]="run.ticket.url" target="_blank" rel="noopener" class="text-sky-800">{{ 'run.openTicket' | translate }}</a>
        @if (run.requestedBy) { · {{ 'runs.requestedBy' | translate }} {{ run.requestedBy }} }
      </p>

      <div class="grid gap-6 md:grid-cols-[1fr_300px]">
        <div class="flex flex-col gap-6 min-w-0">
          @if (run.spec; as spec) {
            <section class="zen-card p-4">
              <h2 class="text-base font-semibold m-0 mb-2">{{ 'run.spec' | translate }}</h2>
              <p class="m-0 mb-3">{{ spec.problem }}</p>
              <h3 class="text-sm font-semibold m-0 mb-1">{{ 'run.criteria' | translate }}</h3>
              <ol class="m-0 pl-5 flex flex-col gap-1">
                @for (c of spec.acceptanceCriteria; track c.id) {
                  <li><span class="font-mono text-xs text-slate-500 mr-1">{{ c.id }}</span>{{ c.statement }}<div class="text-xs text-slate-500">{{ c.testHint }}</div></li>
                }
              </ol>
              @if (spec.outOfScope.length) {
                <h3 class="text-sm font-semibold m-0 mt-3 mb-1">{{ 'run.outOfScope' | translate }}</h3>
                <ul class="m-0 pl-5 text-sm">@for (item of spec.outOfScope; track item) {<li>{{ item }}</li>}</ul>
              }
            </section>
          }
          @if (run.gates?.length) {
            <section class="zen-card p-4">
              <h2 class="text-base font-semibold m-0 mb-2">{{ 'run.gates' | translate }}</h2>
              <ul class="m-0 p-0 list-none flex flex-col gap-1">
                @for (gate of run.gates; track gate.gate) {
                  <li class="flex gap-2 items-start text-sm"><span [class]="'zen-chip ' + (gate.passed ? 'success' : 'danger')">{{ gate.passed ? '✓' : '✗' }}</span><span><span class="font-mono">{{ gate.gate }}</span>@if (gate.detail) { <span class="text-slate-500">· {{ gate.detail }}</span> }</span></li>
                }
              </ul>
            </section>
          }
          @if (run.review; as review) {
            <section class="zen-card p-4">
              <h2 class="text-base font-semibold m-0 mb-2">{{ 'run.review' | translate }}</h2>
              <p class="m-0 mb-3">{{ review.summary }}</p>
              <div class="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
                @for (entry of scores(review); track entry.key) {
                  <div class="p-2 rounded-lg bg-slate-50 border border-slate-200"><div class="text-xs text-slate-500">{{ entry.key }}</div><div class="text-lg font-semibold tabular-nums">{{ entry.score }}<span class="text-xs text-slate-500">/5</span></div></div>
                }
              </div>
              @if (review.findings.length) {
                <ul class="m-0 pl-5 text-sm flex flex-col gap-1">
                  @for (f of review.findings; track $index) {
                    <li><span class="font-semibold">{{ f.severity }}</span> <span class="font-mono text-xs">{{ f.file }}@if (f.line) {:{{ f.line }}}</span> · {{ f.message }}</li>
                  }
                </ul>
              }
            </section>
          }
        </div>
        <aside class="zen-card p-4 min-w-0">
          <h2 class="text-base font-semibold m-0 mb-3">{{ 'run.history' | translate }}</h2>
          <ol class="m-0 p-0 list-none flex flex-col gap-3">
            @for (entry of run.history; track entry.at) {
              <li class="pl-4 border-l-2 border-slate-200">
                <div class="text-sm">{{ 'state.' + entry.to | translate }}</div>
                <div class="text-xs text-slate-500">{{ entry.at | date: 'short' }}@if (entry.by) { · {{ entry.by }} }</div>
              </li>
            }
          </ol>
        </aside>
      </div>
    } @else if (missing()) {
      <p class="mt-6 text-slate-500">{{ 'run.notFound' | translate }}</p>
    }
  `,
})
export class RunDetailPage {
  private readonly service = inject(RunsService);
  readonly key = input.required<string>();
  readonly run = signal<Run | undefined>(undefined);
  readonly missing = signal(false);
  readonly busy = signal(false);
  readonly severity = STATE_SEVERITY;
  readonly usd = usd;
  readonly awaitsDecision = awaitsDecision;

  constructor() {
    poll(() => void this.refresh());
  }

  async refresh() {
    const run = await this.service.byTicket(this.key());
    this.run.set(run);
    this.missing.set(!run);
  }

  scores(review: NonNullable<Run['review']>) {
    return (Object.entries(review.scores) as [string, { score: number }][]).map(([key, value]) => ({ key: key.replace('_', ' '), score: value.score }));
  }

  async decide(decision: 'approved' | 'rejected') {
    this.busy.set(true);
    try {
      await this.service.decide(this.key(), decision);
      await this.refresh();
    } finally {
      this.busy.set(false);
    }
  }
}
