import { DecimalPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RouterLink } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { AGENT_ROLES, GATES, repoOfTicket, type AgentRole } from '@zenthos/domain';
import { GlossaryService } from '../core/glossary';
import { RunsService, type MetricValue, type Run, type TraceCheck } from '../core/runs';
import { duration, minutesBetween, usd } from '../shared/run-state';
import { StatusChip } from '../shared/status-chip';
import { TermLink } from '../shared/term';
import type { Severity } from '../shared/run-state';

type Comparison = TraceCheck['comparison'][number];

const VERDICT_SEVERITY: Record<Comparison['verdict'], Severity> = { match: 'good', mismatch: 'warn', not_recorded: 'neutral', not_traced: 'neutral' };
const VERDICT_ICON: Record<Comparison['verdict'], string> = { match: 'check', mismatch: 'compare_arrows', not_recorded: 'history', not_traced: 'visibility_off' };

/** One number per unit, the way a person reads it: a ratio as a percentage, minutes as a duration, money in dollars. */
export function formatMetric(value: number | null, unit: string): string {
  if (value === null) return '—';
  switch (unit) {
    case 'ratio':
      return `${Math.round(value * 100)}%`;
    case 'usd':
      return usd(value);
    case 'minutes':
      return duration(Math.round(value));
    case 'count':
      return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(value);
    default:
      return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value);
  }
}

/**
 * The nine metrics with their definitions beside the numbers (ADR 015), computed by the API from the stored
 * runs; the ones whose source is not the runs store say where they live. Below, each run with its cost split by
 * agent and, on demand, the LangFuse check for the agents LangFuse traces.
 */
@Component({
  selector: 'zen-metrics-page',
  imports: [DecimalPipe, RouterLink, TranslateModule, MatButtonModule, MatIconModule, MatTooltipModule, StatusChip, TermLink],
  styles: `
    .toolbar { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 10px; margin-bottom: 14px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 10px; margin-bottom: 26px; }
    .metric { padding: 12px 14px; display: grid; gap: 6px; align-content: start; }
    .metric header { display: flex; align-items: baseline; gap: 8px; font-size: 13px; font-weight: 600; }
    .source { margin-left: auto; font-family: var(--zen-mono); font-size: 10.5px; font-weight: 400; color: var(--zen-muted); border: 1px solid var(--zen-line); border-radius: 4px; padding: 0 6px; }
    .value { font-family: var(--zen-mono); font-size: 26px; line-height: 1.1; }
    .value.none { color: var(--zen-muted); }
    .def { margin: 0; font-size: 12.5px; color: var(--zen-muted); line-height: 1.45; }
    .note { margin: 0; font-size: 12px; color: var(--zen-muted); border-left: 2px solid var(--zen-line); padding-left: 8px; }
    .kv { display: grid; grid-template-columns: 1fr auto; gap: 2px 10px; font-size: 12px; }
    .kv dt { color: var(--zen-muted); }
    .kv dd { margin: 0; font-family: var(--zen-mono); text-align: right; }
    .bars { display: grid; grid-template-columns: max-content 1fr 2.5em; gap: 4px 8px; align-items: center; font-size: 11.5px; }
    .bars .name { font-family: var(--zen-mono); color: var(--zen-muted); }
    .bars .track { height: 6px; }
    .bars .bar { height: 6px; border-radius: 0 4px 4px 0; background: var(--zen-accent); min-width: 2px; }
    .bars .bar.zero { background: var(--zen-line); }
    .bars .n { font-family: var(--zen-mono); text-align: right; }
    h2 { margin: 0 0 4px; font-size: 15px; font-weight: 600; }
    .table { width: 100%; border-collapse: collapse; font-size: 13px; }
    .table th { text-align: left; font-family: var(--zen-mono); font-size: 11px; letter-spacing: 0.06em; text-transform: uppercase; color: var(--zen-muted); font-weight: 400; padding: 10px 12px; border-bottom: 1px solid var(--zen-line); white-space: nowrap; }
    .table td { padding: 10px 12px; border-bottom: 1px solid var(--zen-line); vertical-align: middle; white-space: nowrap; }
    .table td.r, .table th.r { text-align: right; }
    /* the ticket column takes the room left and truncates; the agent split and its note may wrap */
    .table td.ticket { width: 100%; max-width: 0; }
    .table td.ticket { min-width: 7rem; }
    .table td.ticket a, .table td.ticket .repo { display: block; overflow: hidden; text-overflow: ellipsis; }
    .table td.agents { white-space: normal; min-width: 11rem; }
    .split { display: flex; flex-wrap: wrap; gap: 2px 10px; font-family: var(--zen-mono); font-size: 12px; }
    .split span { color: var(--zen-muted); }
    .split b { color: var(--zen-fg); font-weight: 500; }
    .check td { background: var(--zen-surface-2); white-space: normal; }
    .cmp { display: grid; grid-template-columns: repeat(5, max-content); gap: 6px 18px; align-items: center; font-size: 12.5px; overflow-x: auto; }
    .cmp .h { font-family: var(--zen-mono); font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--zen-muted); }
    .cmp .num { font-family: var(--zen-mono); text-align: right; }
    .check-foot { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; margin-top: 8px; font-size: 12px; color: var(--zen-muted); }
    .error { color: var(--zen-crit); }
  `,
  template: `
    <div class="toolbar">
      <div>
        <div class="eyebrow">{{ 'metrics.eyebrow' | translate }}</div>
        <h1 class="text-lg font-semibold m-0"><zen-term id="view_metrics">{{ 'metrics.title' | translate }}</zen-term></h1>
      </div>
      <span class="flex-1"></span>
      <span class="muted text-sm">{{ 'metrics.window' | translate: { n: runs().length } }}</span>
    </div>

    <div class="grid">
      @for (m of metrics(); track m.metric) {
        <article class="surface metric" [attr.aria-label]="titleOf(m)">
          <header>
            <zen-term [id]="'metric_' + m.metric">{{ titleOf(m) }}</zen-term>
            <span class="source" [matTooltip]="'metrics.sourceHint.' + m.source | translate">{{ 'metrics.source.' + m.source | translate }}</span>
          </header>
          <div class="value" [class.none]="m.value === null">{{ format(m.value, m.unit) }}</div>
          <p class="def">{{ definitionOf(m) }}</p>
          @if (m.value === null) {
            <p class="note">{{ 'metrics.elsewhere.' + m.source | translate }}</p>
          } @else {
            @switch (m.metric) {
              @case ('gate_failures') {
                <div class="bars" role="list">
                  @for (gate of gates; track gate) {
                    <span class="name" role="listitem">{{ gate }}</span>
                    <span class="track"><span class="bar block" [class.zero]="!m.breakdown?.[gate]" [style.width.%]="barWidth(m, gate)"></span></span>
                    <span class="n">{{ m.breakdown?.[gate] ?? 0 }}</span>
                  }
                </div>
              }
              @case ('tokens_per_ticket') {
                <dl class="kv">
                  @for (k of tokenKinds; track k) {<dt>{{ 'metrics.tokens.' + k | translate }}</dt><dd>{{ (m.breakdown?.[k] ?? 0) | number }}</dd>}
                </dl>
              }
              @case ('spec_approval_rate') {
                <p class="note">{{ 'metrics.approvals' | translate: { approved: m.breakdown?.['approved'] ?? 0, drafted: m.breakdown?.['drafted'] ?? 0 } }}</p>
              }
              @case ('cost_per_ticket_usd') {
                <p class="note">{{ 'metrics.totalSpend' | translate: { total: usd(m.breakdown?.['total'] ?? 0) } }}</p>
              }
            }
            <span class="muted text-xs">{{ 'metrics.fromRuns' | translate: { n: m.runs } }}</span>
          }
        </article>
      }
    </div>

    <section aria-labelledby="runs-title">
      <h2 id="runs-title">{{ 'metrics.runsTitle' | translate }}</h2>
      <p class="muted text-sm mt-0 mb-3">{{ 'metrics.runsIntro' | translate }} <zen-term id="trace_check">{{ 'metrics.howCheck' | translate }}</zen-term></p>
      <div class="surface overflow-x-auto relative">
        <table class="table">
          <thead>
            <tr>
              <th>{{ 'runs.ticket' | translate }}</th>
              <th>{{ 'runs.state' | translate }}</th>
              <th class="r"><zen-term id="cost_estimate">{{ 'runs.cost' | translate }}</zen-term></th>
              <th>{{ 'metrics.byAgent' | translate }}</th>
              <th class="r"><zen-term id="metric_ticket_to_pr_minutes">{{ 'metrics.toPr' | translate }}</zen-term></th>
              <th class="r"><span class="sr-only">{{ 'metrics.check' | translate }}</span></th>
            </tr>
          </thead>
          <tbody>
            @for (run of runs(); track run.id) {
              <tr>
                <td class="ticket">
                  <a class="link mono" [routerLink]="['/runs', run.ticket.key]" [title]="run.ticket.key">{{ issueOf(run) }}</a>
                  <span class="repo muted text-xs mono">{{ repoOf(run.ticket.key) }}</span>
                </td>
                <td><zen-status-chip [state]="run.state" /></td>
                <td class="r mono">{{ usd(run.estimatedCostUsd) }}</td>
                <td class="agents">
                  @if (hasSplit(run)) {
                    <span class="split">
                      @for (agent of agents; track agent) {<span [matTooltip]="glossary.tip('agent_' + agent)">{{ 'metrics.agentShort.' + agent | translate }} <b>{{ usd(run.usageByAgent[agent]?.estimatedCostUsd ?? 0) }}</b></span>}
                    </span>
                  } @else {
                    <span class="muted text-xs">{{ 'metrics.notSplit' | translate }}</span>
                  }
                </td>
                <td class="r mono">{{ toPr(run) }}</td>
                <td class="r">
                  <button mat-button (click)="check(run)" [attr.aria-label]="('metrics.check' | translate) + ' ' + run.ticket.key" [disabled]="checking() === run.ticket.key" [matTooltip]="glossary.tip('trace_check')" matTooltipShowDelay="300">
                    <mat-icon>{{ checks()[run.ticket.key] ? 'refresh' : 'fact_check' }}</mat-icon>{{ 'metrics.checkShort' | translate }}
                  </button>
                </td>
              </tr>
              @if (checks()[run.ticket.key]; as result) {
                <tr class="check">
                  <td colspan="6">
                    @if (!result.available) {
                      <span class="muted">{{ 'metrics.unavailable' | translate }}</span>
                    } @else {
                      <div class="cmp" role="table" [attr.aria-label]="'metrics.check' | translate">
                        <span class="h" role="columnheader">{{ 'metrics.agent' | translate }}</span>
                        <span class="h num" role="columnheader">{{ 'metrics.stored' | translate }}</span>
                        <span class="h num" role="columnheader">LangFuse</span>
                        <span class="h num" role="columnheader">{{ 'metrics.langfuseTokens' | translate }}</span>
                        <span class="h" role="columnheader">{{ 'metrics.verdict' | translate }}</span>
                        @for (c of result.comparison; track c.agent) {
                          <span role="cell"><zen-term [id]="'agent_' + c.agent">{{ 'metrics.agentName.' + c.agent | translate }}</zen-term></span>
                          <span class="num" role="cell">{{ c.stored ? usd(c.stored.estimatedCostUsd) : '—' }}</span>
                          <span class="num" role="cell">{{ c.traced ? usd(c.traced.estimatedCostUsd) : '—' }}</span>
                          <span class="num" role="cell">{{ c.traced ? (c.traced.totalTokens | number) : '—' }}</span>
                          <span role="cell"><zen-status-chip [custom]="{ severity: severity[c.verdict], icon: icon[c.verdict], label: 'metrics.verdicts.' + c.verdict }" /></span>
                        }
                      </div>
                      <div class="check-foot">
                        <span>{{ 'metrics.tolerance' | translate: { pct: result.tolerance.relative * 100, usd: usd(result.tolerance.absoluteUsd) } }}</span>
                        <span>{{ 'metrics.codingAgentUntraced' | translate }}</span>
                        @if (result.sessionUrl) {<a class="link" [href]="result.sessionUrl" target="_blank" rel="noopener">{{ 'metrics.openLangfuse' | translate }} ↗</a>}
                        @if (result.error) {<span class="error" role="alert">{{ result.error }}</span>}
                      </div>
                    }
                  </td>
                </tr>
              }
            } @empty {
              <tr><td colspan="6" class="muted">{{ loading() ? '' : ('runs.empty' | translate) }}</td></tr>
            }
          </tbody>
        </table>
      </div>
    </section>
  `,
})
export class MetricsPage {
  private readonly service = inject(RunsService);
  readonly glossary = inject(GlossaryService);
  readonly metrics = signal<MetricValue[]>([]);
  readonly runs = signal<Run[]>([]);
  readonly loading = signal(true);
  readonly checking = signal<string | undefined>(undefined);
  readonly checks = signal<Record<string, TraceCheck>>({});
  readonly gates = GATES;
  readonly agents: readonly AgentRole[] = AGENT_ROLES;
  readonly tokenKinds = ['input', 'output', 'cacheRead', 'cacheWrite'] as const;
  readonly severity = VERDICT_SEVERITY;
  readonly icon = VERDICT_ICON;
  readonly usd = usd;
  readonly format = formatMetric;
  readonly repoOf = repoOfTicket;
  private readonly maxGateFailures = computed(() => Math.max(1, ...Object.values(this.metrics().find((m) => m.metric === 'gate_failures')?.breakdown ?? {})));

  constructor() {
    void this.load();
  }

  async load() {
    const [metrics, runs] = await Promise.all([this.service.metrics(), this.service.list()]);
    this.metrics.set(metrics);
    this.runs.set(runs);
    this.loading.set(false);
  }

  async check(run: Run) {
    this.checking.set(run.ticket.key);
    const result = await this.service.traceCheck(run.ticket.key);
    this.checking.set(undefined);
    if (result) this.checks.update((all) => ({ ...all, [run.ticket.key]: result }));
  }

  /** The glossary's title and definition for the metric, in the reader's language; the API's English as the fallback. */
  titleOf(metric: MetricValue) {
    const term = this.glossary.term(`metric_${metric.metric}`);
    return term ? this.glossary.title(term) : metric.metric;
  }

  definitionOf(metric: MetricValue) {
    return this.glossary.term(`metric_${metric.metric}`) ? this.glossary.tip(`metric_${metric.metric}`) : metric.description;
  }

  barWidth(metric: MetricValue, gate: string) {
    return ((metric.breakdown?.[gate] ?? 0) / this.maxGateFailures()) * 100;
  }

  /** "#300": the repository sits under it, muted, since every run of a page usually shares it. */
  issueOf(run: Run) {
    return run.ticket.key.slice(repoOfTicket(run.ticket.key).length);
  }

  hasSplit(run: Run) {
    return Object.keys(run.usageByAgent ?? {}).length > 0;
  }

  toPr(run: Run) {
    const opened = run.history.find((entry) => entry.event === 'mr_opened');
    return opened ? duration(minutesBetween(run.createdAt, opened.at)) : '—';
  }
}
