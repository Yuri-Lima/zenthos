import { DecimalPipe, JsonPipe } from '@angular/common';
import { Component, computed, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatTabsModule } from '@angular/material/tabs';
import { TranslateModule } from '@ngx-translate/core';
import { REVIEW_RUBRIC, type RunState } from '@zenthos/domain';
import type { Run } from '../../core/runs';
import { gateSeverity, usd } from '../../shared/run-state';
import { StatusChip } from '../../shared/status-chip';

/** The payload behind the selected step: spec, gates, review, cost, raw. Names come from the domain, so they match the pull request. */
@Component({
  selector: 'zen-inspector',
  imports: [DecimalPipe, JsonPipe, MatIconModule, MatTabsModule, TranslateModule, StatusChip],
  styles: `
    .pane { padding: 14px 4px 4px; display: grid; gap: 10px; }
    h3 { font-size: 12px; margin: 0; font-family: var(--zen-mono); letter-spacing: 0.06em; text-transform: uppercase; color: var(--zen-muted); }
    .ac { display: grid; grid-template-columns: 46px 1fr; gap: 8px; padding: 6px 0; border-top: 1px solid var(--zen-line); }
    .ac:first-of-type { border-top: 0; }
    .id { font-family: var(--zen-mono); font-size: 11.5px; color: var(--zen-muted); padding-top: 2px; }
    .hint { font-size: 12px; color: var(--zen-muted); }
    .gate { display: grid; grid-template-columns: auto 1fr; gap: 10px; align-items: start; padding: 6px 0; border-top: 1px solid var(--zen-line); }
    .gate:first-of-type { border-top: 0; }
    .scores { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 8px; }
    .score { padding: 10px 12px; display: grid; gap: 4px; }
    .score .v { font-family: var(--zen-mono); font-size: 22px; line-height: 1; }
    .score .v small { font-size: 12px; color: var(--zen-muted); }
    .score .k { font-size: 12px; }
    .score .e { font-size: 12px; color: var(--zen-muted); max-height: 7.5em; overflow: auto; }
    .finding { display: grid; grid-template-columns: auto 1fr; gap: 10px; padding: 6px 0; border-top: 1px solid var(--zen-line); font-size: 13px; }
    .tokens { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 8px; }
    .tok { padding: 10px 12px; display: grid; gap: 2px; } .tok .v { font-family: var(--zen-mono); font-size: 18px; } .tok .k { font-size: 12px; color: var(--zen-muted); }
    pre { margin: 0; font-family: var(--zen-mono); font-size: 11.5px; background: var(--zen-surface-2); padding: 12px; border-radius: var(--zen-radius); overflow: auto; max-height: 60vh; }
    .empty { color: var(--zen-muted); font-size: 13px; padding: 16px 0; }
  `,
  template: `
    <mat-tab-group [(selectedIndex)]="tab" animationDuration="0ms" mat-stretch-tabs="false">
      <mat-tab [label]="'run.spec' | translate">
        <div class="pane">
          @if (run().spec; as spec) {
            <p class="m-0">{{ spec.problem }}</p>
            <h3>{{ 'run.criteria' | translate }} · {{ spec.acceptanceCriteria.length }}</h3>
            <div>
              @for (c of spec.acceptanceCriteria; track c.id) {
                <div class="ac"><span class="id">{{ c.id }}</span><span>{{ c.statement }}<div class="hint">{{ c.testHint }}</div></span></div>
              }
            </div>
            <div class="grid md:grid-cols-2 gap-4">
              <div><h3>{{ 'run.inScope' | translate }}</h3><ul class="m-0 pl-5 text-sm">@for (i of spec.inScope; track i) {<li>{{ i }}</li>}</ul></div>
              <div><h3>{{ 'run.outOfScope' | translate }}</h3><ul class="m-0 pl-5 text-sm">@for (i of spec.outOfScope; track i) {<li>{{ i }}</li>}</ul></div>
            </div>
            @if (spec.touchedAreas.length) {<div><h3>{{ 'run.touchedAreas' | translate }}</h3><div class="mono text-xs">{{ spec.touchedAreas.join(' · ') }}</div></div>}
          } @else {<p class="empty">{{ 'run.noSpec' | translate }}</p>}
        </div>
      </mat-tab>
      <mat-tab [label]="('run.gates' | translate) + (run().gates?.length ? ' · ' + run().gates?.length : '')">
        <div class="pane">
          @if (run().gates?.length) {
            <div>
              @for (gate of run().gates; track gate.gate) {
                <div class="gate">
                  <zen-status-chip [custom]="{ severity: gateSeverity(gate), icon: gate.passed ? (gate.detail ? 'skip_next' : 'check') : 'close', label: gate.passed ? (gate.detail ? 'gate.skipped' : 'gate.pass') : 'gate.fail' }" />
                  <span><span class="mono text-sm">{{ gate.gate }}</span>@if (gate.detail) {<div class="hint">{{ gate.detail }}</div>}</span>
                </div>
              }
            </div>
          } @else {<p class="empty">{{ 'run.noGates' | translate }}</p>}
        </div>
      </mat-tab>
      <mat-tab [label]="'run.review' | translate">
        <div class="pane">
          @if (run().review; as review) {
            <p class="m-0">{{ review.summary }}</p>
            <div class="scores">
              @for (s of scores(); track s.key) {
                <div class="surface score"><span class="v">{{ s.score }}<small>/5</small></span><span class="k">{{ s.label }}</span><span class="e" [title]="s.definition">{{ s.evidence }}</span></div>
              }
            </div>
            @if (review.findings.length) {
              <h3>{{ 'run.findings' | translate }} · {{ review.findings.length }}</h3>
              <div>
                @for (f of review.findings; track $index) {
                  <div class="finding"><zen-status-chip [custom]="{ severity: f.severity === 'blocker' ? 'crit' : f.severity === 'major' ? 'warn' : 'neutral', icon: f.severity === 'blocker' ? 'block' : 'flag', label: 'severity.' + f.severity }" /><span><span class="mono text-xs">{{ f.file }}@if (f.line) {:{{ f.line }}}</span><div>{{ f.message }}</div></span></div>
                }
              </div>
            }
          } @else {<p class="empty">{{ 'run.noReview' | translate }}</p>}
        </div>
      </mat-tab>
      <mat-tab [label]="'run.cost' | translate">
        <div class="pane">
          <div class="tokens">
            <div class="surface tok"><span class="v">{{ usd(run().estimatedCostUsd) }}</span><span class="k">{{ 'run.estimate' | translate }}</span></div>
            <div class="surface tok"><span class="v">{{ run().tokens.inputTokens | number }}</span><span class="k">{{ 'run.inputTokens' | translate }}</span></div>
            <div class="surface tok"><span class="v">{{ run().tokens.outputTokens | number }}</span><span class="k">{{ 'run.outputTokens' | translate }}</span></div>
            <div class="surface tok"><span class="v">{{ run().tokens.cacheReadTokens | number }}</span><span class="k">{{ 'run.cacheRead' | translate }}</span></div>
            <div class="surface tok"><span class="v">{{ usd(run().policy.costCeilingUsd) }}</span><span class="k">{{ 'run.ceiling' | translate }}</span></div>
          </div>
          <p class="hint m-0">{{ 'run.costNote' | translate }}</p>
        </div>
      </mat-tab>
      <mat-tab label="JSON"><div class="pane"><pre>{{ run() | json }}</pre></div></mat-tab>
    </mat-tab-group>
  `,
})
export class Inspector {
  readonly run = input.required<Run>();
  readonly focus = input<RunState | undefined>();
  tab = 0;
  readonly usd = usd;
  readonly gateSeverity = gateSeverity;
  readonly scores = computed(() => {
    const review = this.run().review;
    if (!review) return [];
    return (Object.entries(review.scores) as [keyof typeof REVIEW_RUBRIC, { score: number; evidence: string }][]).map(([key, value]) => ({ key, label: key.replace('_', ' '), definition: REVIEW_RUBRIC[key], score: value.score, evidence: value.evidence }));
  });
}
