import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RouterLink } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { GlossaryService } from '../core/glossary';
import { poll } from '../core/poll';
import { RunsService, type Run } from '../core/runs';
import { age, ATTENTION_STATES, IN_FLIGHT_STATES, RUN_STATES, usd } from '../shared/run-state';
import { StatusChip } from '../shared/status-chip';
import { TermLink } from '../shared/term';

type Quick = 'all' | 'attention' | 'inflight';

@Component({
  selector: 'zen-runs-page',
  imports: [FormsModule, RouterLink, TranslateModule, MatButtonModule, MatFormFieldModule, MatIconModule, MatInputModule, MatProgressBarModule, MatSelectModule, MatTableModule, MatTooltipModule, StatusChip, TermLink],
  styles: `
    .strip { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 8px; margin-bottom: 16px; }
    .tile { text-align: left; padding: 10px 14px; display: grid; gap: 2px; cursor: pointer; font: inherit; color: inherit; }
    .tile .v { font-family: var(--zen-mono); font-size: 22px; font-weight: 500; line-height: 1.1; }
    .tile .k { font-size: 12px; color: var(--zen-muted); }
    .tile.on { border-color: var(--zen-accent); box-shadow: inset 0 0 0 1px var(--zen-accent); }
    .tile.warn .v { color: var(--zen-warn); }
    .toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; margin-bottom: 10px; }
    .key { font-family: var(--zen-mono); font-size: 13px; }
    .key, .title { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .title { color: var(--zen-muted); font-size: 12.5px; }
    /* the ticket column takes the room that is left and truncates; the narrow columns never wrap or scroll away */
    .mat-column-ticket { width: 100%; max-width: 0; }
    .mat-column-state, .mat-column-cost, .mat-column-requestedBy, .mat-column-age { white-space: nowrap; }
    td.r, th.r { text-align: right; }
  `,
  template: `
    <div class="toolbar">
      <div><div class="eyebrow">{{ 'runs.eyebrow' | translate }}</div><h1 class="text-lg font-semibold m-0">{{ 'runs.title' | translate }}</h1></div>
      <span class="flex-1"></span>
      <mat-form-field appearance="outline" subscriptSizing="dynamic" class="w-56 zen-toolbar-field">
        <mat-select [(ngModel)]="state" [placeholder]="'runs.state' | translate" [aria-label]="'runs.state' | translate" (selectionChange)="quick.set('all'); refresh()">
          <mat-option [value]="undefined">{{ 'runs.anyState' | translate }}</mat-option>
          @for (option of states; track option) {<mat-option [value]="option">{{ 'state.' + option | translate }}</mat-option>}
        </mat-select>
      </mat-form-field>
      <button mat-flat-button (click)="starting.set(!starting())"><mat-icon>play_arrow</mat-icon>{{ 'runs.start' | translate }}</button>
    </div>

    <div class="strip" role="group" [attr.aria-label]="'runs.attention' | translate">
      <button class="surface tile" [class.on]="quick() === 'all'" (click)="setQuick('all')"><span class="v num">{{ all().length }}</span><span class="k">{{ 'runs.total' | translate }}</span></button>
      <button class="surface tile warn" [class.on]="quick() === 'attention'" (click)="setQuick('attention')" [matTooltip]="glossary.tip('view_attention_strip')" matTooltipShowDelay="300"><span class="v num">{{ attention().length }}</span><span class="k">{{ 'runs.waiting' | translate }}</span></button>
      <button class="surface tile" [class.on]="quick() === 'inflight'" (click)="setQuick('inflight')"><span class="v num">{{ inFlight().length }}</span><span class="k">{{ 'runs.inFlight' | translate }}</span></button>
      <div class="surface tile" aria-live="polite"><span class="v num">{{ usd(totalCost()) }}</span><span class="k"><zen-term id="cost_estimate">{{ 'runs.totalCost' | translate }}</zen-term></span></div>
    </div>

    @if (starting()) {
      <form class="surface p-3 mb-3 flex flex-wrap items-end gap-3" (ngSubmit)="start()">
        <mat-form-field appearance="outline" subscriptSizing="dynamic" class="w-80">
          <mat-label>{{ 'runs.ticketKey' | translate }}</mat-label>
          <input matInput id="ticket" name="ticket" [(ngModel)]="ticketKey" placeholder="owner/repo#123" autocomplete="off" class="mono" />
        </mat-form-field>
        <button mat-flat-button type="submit" [disabled]="!ticketKey.includes('#')">{{ 'runs.startConfirm' | translate }}</button>
        <button mat-button type="button" (click)="starting.set(false)">{{ 'common.cancel' | translate }}</button>
        @if (error(); as message) {<p class="text-sm m-0 basis-full" style="color: var(--zen-crit)">{{ message }}</p>}
      </form>
    }

    <div class="surface overflow-x-auto">
      @if (loading()) {<mat-progress-bar mode="indeterminate" />}
      <table mat-table [dataSource]="rows()" class="w-full">
        <ng-container matColumnDef="ticket">
          <th mat-header-cell *matHeaderCellDef>{{ 'runs.ticket' | translate }}</th>
          <td mat-cell *matCellDef="let run">
            <a [routerLink]="['/runs', run.ticket.key]" class="link key">{{ run.ticket.key }}</a>
            <div class="title" [title]="run.ticket.title">{{ run.ticket.title }}</div>
          </td>
        </ng-container>
        <ng-container matColumnDef="state">
          <th mat-header-cell *matHeaderCellDef><zen-term id="state_machine">{{ 'runs.state' | translate }}</zen-term></th>
          <td mat-cell *matCellDef="let run"><zen-status-chip [state]="run.state" /></td>
        </ng-container>
        <ng-container matColumnDef="cost">
          <th mat-header-cell *matHeaderCellDef class="r">{{ 'runs.cost' | translate }}</th>
          <td mat-cell *matCellDef="let run" class="r mono">{{ usd(run.estimatedCostUsd) }}</td>
        </ng-container>
        <ng-container matColumnDef="requestedBy">
          <th mat-header-cell *matHeaderCellDef>{{ 'runs.requestedBy' | translate }}</th>
          <td mat-cell *matCellDef="let run" class="mono">{{ run.requestedBy ?? '·' }}</td>
        </ng-container>
        <ng-container matColumnDef="age">
          <th mat-header-cell *matHeaderCellDef class="r">{{ 'runs.age' | translate }}</th>
          <td mat-cell *matCellDef="let run" class="r mono whitespace-nowrap" [title]="run.createdAt">{{ age(run.createdAt) }}</td>
        </ng-container>
        <tr mat-header-row *matHeaderRowDef="columns"></tr>
        <tr mat-row *matRowDef="let row; columns: columns"></tr>
        <tr class="mat-row" *matNoDataRow><td class="mat-cell p-4 muted" [attr.colspan]="columns.length">{{ 'runs.empty' | translate }} <a routerLink="/settings" class="link">{{ 'runs.setupLink' | translate }}</a></td></tr>
      </table>
    </div>
  `,
})
export class RunsPage {
  private readonly service = inject(RunsService);
  readonly glossary = inject(GlossaryService);
  readonly all = signal<Run[]>([]);
  readonly loading = signal(true);
  readonly starting = signal(false);
  readonly error = signal<string | undefined>(undefined);
  readonly quick = signal<Quick>('all');
  readonly attention = computed(() => this.all().filter((r) => ATTENTION_STATES.includes(r.state)));
  readonly inFlight = computed(() => this.all().filter((r) => IN_FLIGHT_STATES.includes(r.state)));
  readonly totalCost = computed(() => this.all().reduce((sum, r) => sum + r.estimatedCostUsd, 0));
  readonly rows = computed(() => (this.quick() === 'attention' ? this.attention() : this.quick() === 'inflight' ? this.inFlight() : this.all()));
  readonly usd = usd;
  readonly age = age;
  readonly states = RUN_STATES;
  readonly columns = ['ticket', 'state', 'cost', 'requestedBy', 'age'];
  state: Run['state'] | undefined;
  ticketKey = '';

  constructor() {
    poll(() => void this.refresh());
  }

  setQuick(value: Quick) {
    this.state = undefined;
    this.quick.set(value);
    void this.refresh();
  }

  async refresh() {
    this.all.set(await this.service.list(this.state));
    this.loading.set(false);
  }

  async start() {
    this.error.set(undefined);
    const { error, response } = await this.service.start(this.ticketKey.trim());
    if (!response.ok) {
      this.error.set((error as { message?: string } | undefined)?.message ?? `${response.status}`);
      return;
    }
    this.starting.set(false);
    this.ticketKey = '';
    await this.refresh();
  }
}
