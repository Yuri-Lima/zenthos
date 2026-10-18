import { Component, DestroyRef, effect, inject, input, OnInit, signal, viewChild } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RouterLink } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import type { RunState } from '@zenthos/domain';
import { GlossaryService } from '../core/glossary';
import { poll } from '../core/poll';
import { RunsService, type Run } from '../core/runs';
import { awaitsDecision, usd } from '../shared/run-state';
import { StatusChip } from '../shared/status-chip';
import { TermLink } from '../shared/term';
import { GraphView } from './run/graph-view';
import { Inspector } from './run/inspector';
import { PipelineView } from './run/pipeline-view';
import { TimelineView } from './run/timeline-view';

type Mode = 'pipeline' | 'timeline' | 'graph';

/** Which inspector tab a step naturally opens: the spec for the spec states, gates for gates, review for the pull request states. */
const TAB_FOR: Partial<Record<RunState, number>> = { spec_drafted: 0, spec_approved: 0, implemented: 1, gates_passed: 1, mr_opened: 2, reviewed: 2, needs_human: 1, failed: 1 };

@Component({
  selector: 'zen-run-detail-page',
  imports: [RouterLink, TranslateModule, MatButtonModule, MatButtonToggleModule, MatIconModule, MatTooltipModule, StatusChip, TermLink, PipelineView, TimelineView, GraphView, Inspector],
  styles: `
    .head { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; margin: 6px 0 4px; }
    h1 { font-family: var(--zen-mono); font-size: 18px; font-weight: 500; margin: 0; }
    .actions { display: flex; flex-wrap: wrap; gap: 8px; margin-left: auto; }
    .facts { display: flex; flex-wrap: wrap; gap: 6px 18px; font-size: 12.5px; color: var(--zen-muted); margin-bottom: 14px; }
    .facts > span { display: inline-flex; align-items: baseline; gap: 6px; }
    .modes mat-button-toggle mat-icon { font-size: 18px; width: 18px; height: 18px; margin-right: 6px; vertical-align: -4px; }
    .facts b { color: var(--zen-fg); font-weight: 500; font-family: var(--zen-mono); }
    .modes { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
    .view { padding: 10px 12px; margin-bottom: 14px; }
  `,
  template: `
    <a routerLink="/" class="link text-sm">← {{ 'runs.title' | translate }}</a>
    @if (run(); as run) {
      <header class="head">
        <h1>{{ run.ticket.key }}</h1>
        <zen-status-chip [state]="run.state" />
        <div class="actions">
        @if (run.pullRequest; as pr) {<a mat-stroked-button [href]="pr.url" target="_blank" rel="noopener"><mat-icon>open_in_new</mat-icon>{{ 'run.pullRequest' | translate: { number: pr.number } }}</a>}
        <a mat-stroked-button [href]="run.ticket.url" target="_blank" rel="noopener"><mat-icon>confirmation_number</mat-icon>{{ 'run.openTicket' | translate }}</a>
        @if (awaitsDecision(run)) {
          <button mat-flat-button (click)="decide('approved')" [disabled]="busy()"><mat-icon>check</mat-icon>{{ 'run.approve' | translate }}</button>
          <button mat-stroked-button (click)="decide('rejected')" [disabled]="busy()"><mat-icon>close</mat-icon>{{ 'run.reject' | translate }}</button>
        }
        </div>
      </header>
      <div class="facts">
        <span>{{ run.ticket.title }}</span>
        <span><zen-term id="cost_estimate">{{ 'runs.cost' | translate }}</zen-term> <b>{{ usd(run.estimatedCostUsd) }}</b></span>
        <span>{{ 'run.tokens' | translate }} <b>{{ run.tokens.inputTokens + run.tokens.outputTokens }}</b></span>
        @if (run.requestedBy) {<span>{{ 'runs.requestedBy' | translate }} <b>{{ run.requestedBy }}</b></span>}
        @if (run.branch) {<span>{{ 'run.branch' | translate }} <b>{{ run.branch }}</b></span>}
      </div>

      <div class="modes">
        <span class="eyebrow">{{ 'run.view' | translate }}</span>
        <mat-button-toggle-group [value]="mode()" (change)="mode.set($event.value)" [hideSingleSelectionIndicator]="true" [attr.aria-label]="'run.view' | translate">
          <mat-button-toggle value="pipeline" [matTooltip]="glossary.tip('view_pipeline')" matTooltipShowDelay="300"><mat-icon>linear_scale</mat-icon>{{ 'run.pipeline' | translate }}</mat-button-toggle>
          <mat-button-toggle value="timeline" [matTooltip]="glossary.tip('view_timeline')" matTooltipShowDelay="300"><mat-icon>timeline</mat-icon>{{ 'run.timeline' | translate }}</mat-button-toggle>
          <mat-button-toggle value="graph" [matTooltip]="glossary.tip('view_graph')" matTooltipShowDelay="300"><mat-icon>account_tree</mat-icon>{{ 'run.graph' | translate }}</mat-button-toggle>
        </mat-button-toggle-group>
        <span class="muted text-xs">{{ 'run.clickToInspect' | translate }}</span>
      </div>
      <section class="surface view">
        @switch (mode()) {
          @case ('timeline') {<zen-timeline-view [run]="run" [selected]="focus()" (pick)="focusOn($event)" />}
          @case ('graph') {<zen-graph-view [run]="run" [selected]="focus()" (pick)="focusOn($event)" />}
          @default {<zen-pipeline-view [run]="run" [selected]="focus()" (pick)="focusOn($event)" />}
        }
      </section>
      <section class="surface px-3 pb-2">
        <zen-inspector [run]="run" [focus]="focus()" />
      </section>
    } @else if (missing()) {
      <p class="mt-6 muted">{{ 'run.notFound' | translate }}</p>
    }
  `,
})
export class RunDetailPage implements OnInit {
  readonly glossary = inject(GlossaryService);
  private readonly service = inject(RunsService);
  readonly key = input.required<string>();
  readonly run = signal<Run | undefined>(undefined);
  readonly missing = signal(false);
  readonly busy = signal(false);
  readonly mode = signal<Mode>('pipeline');
  readonly focus = signal<RunState | undefined>(undefined);
  readonly usd = usd;
  readonly awaitsDecision = awaitsDecision;
  private readonly inspector = viewChild(Inspector);

  private readonly destroyRef = inject(DestroyRef);

  /** The route input is bound after construction, so polling starts here. */
  ngOnInit() {
    poll(() => void this.refresh(), 5000, this.destroyRef);
  }

  constructor() {
    effect(() => {
      const run = this.run();
      if (run && this.focus() === undefined) this.focus.set(run.state);
    });
  }

  focusOn(state: RunState) {
    this.focus.set(state);
    const tab = TAB_FOR[state];
    const inspector = this.inspector();
    if (tab !== undefined && inspector) inspector.tab = tab;
  }

  async refresh() {
    const run = await this.service.byTicket(this.key());
    this.run.set(run);
    this.missing.set(!run);
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
