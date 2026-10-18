import { DatePipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { MatTableModule } from '@angular/material/table';
import { RouterLink } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { poll } from '../core/poll';
import { RunsService, type Run } from '../core/runs';
import { RUN_STATES, STATE_SEVERITY, usd } from '../shared/run-state';

@Component({
  selector: 'zen-runs-page',
  imports: [DatePipe, FormsModule, RouterLink, TranslateModule, MatButtonModule, MatFormFieldModule, MatIconModule, MatInputModule, MatProgressBarModule, MatSelectModule, MatTableModule],
  template: `
    <div class="flex flex-wrap items-center gap-3 mb-4">
      <h1 class="text-xl font-semibold m-0">{{ 'runs.title' | translate }}</h1>
      <span class="flex-1"></span>
      <mat-form-field appearance="outline" subscriptSizing="dynamic" class="w-56">
        <mat-label>{{ 'runs.state' | translate }}</mat-label>
        <mat-select [(ngModel)]="state" (selectionChange)="refresh()">
          <mat-option [value]="undefined">{{ 'runs.anyState' | translate }}</mat-option>
          @for (option of states; track option) {
            <mat-option [value]="option">{{ 'state.' + option | translate }}</mat-option>
          }
        </mat-select>
      </mat-form-field>
      <button mat-flat-button (click)="starting.set(!starting())"><mat-icon>play_arrow</mat-icon>{{ 'runs.start' | translate }}</button>
    </div>

    @if (starting()) {
      <form class="zen-card p-4 mb-4 flex flex-wrap items-end gap-3" (ngSubmit)="start()">
        <mat-form-field appearance="outline" subscriptSizing="dynamic" class="w-80">
          <mat-label>{{ 'runs.ticketKey' | translate }}</mat-label>
          <input matInput id="ticket" name="ticket" [(ngModel)]="ticketKey" placeholder="owner/repo#123" autocomplete="off" />
        </mat-form-field>
        <button mat-flat-button type="submit" [disabled]="!ticketKey.includes('#')">{{ 'runs.startConfirm' | translate }}</button>
        <button mat-button type="button" (click)="starting.set(false)">{{ 'common.cancel' | translate }}</button>
        @if (error(); as message) {
          <p class="text-sm text-red-700 m-0 basis-full">{{ message }}</p>
        }
      </form>
    }

    <div class="zen-card overflow-x-auto">
      @if (loading()) { <mat-progress-bar mode="indeterminate" /> }
      <table mat-table [dataSource]="runs()" class="w-full">
        <ng-container matColumnDef="ticket">
          <th mat-header-cell *matHeaderCellDef>{{ 'runs.ticket' | translate }}</th>
          <td mat-cell *matCellDef="let run">
            <a [routerLink]="['/runs', run.ticket.key]" class="font-medium no-underline text-sky-800">{{ run.ticket.key }}</a>
            <div class="text-sm text-slate-500">{{ run.ticket.title }}</div>
          </td>
        </ng-container>
        <ng-container matColumnDef="state">
          <th mat-header-cell *matHeaderCellDef>{{ 'runs.state' | translate }}</th>
          <td mat-cell *matCellDef="let run"><span class="zen-chip" [class]="'zen-chip ' + severity[run.state]">{{ 'state.' + run.state | translate }}</span></td>
        </ng-container>
        <ng-container matColumnDef="cost">
          <th mat-header-cell *matHeaderCellDef>{{ 'runs.cost' | translate }}</th>
          <td mat-cell *matCellDef="let run" class="tabular-nums">{{ usd(run.estimatedCostUsd) }}</td>
        </ng-container>
        <ng-container matColumnDef="requestedBy">
          <th mat-header-cell *matHeaderCellDef>{{ 'runs.requestedBy' | translate }}</th>
          <td mat-cell *matCellDef="let run">{{ run.requestedBy ?? '' }}</td>
        </ng-container>
        <ng-container matColumnDef="created">
          <th mat-header-cell *matHeaderCellDef>{{ 'runs.created' | translate }}</th>
          <td mat-cell *matCellDef="let run" class="whitespace-nowrap">{{ run.createdAt | date: 'short' }}</td>
        </ng-container>
        <tr mat-header-row *matHeaderRowDef="columns"></tr>
        <tr mat-row *matRowDef="let row; columns: columns"></tr>
        <tr class="mat-row" *matNoDataRow><td class="mat-cell p-4 text-slate-500" [attr.colspan]="columns.length">{{ 'runs.empty' | translate }}</td></tr>
      </table>
    </div>
  `,
})
export class RunsPage {
  private readonly service = inject(RunsService);
  readonly runs = signal<Run[]>([]);
  readonly loading = signal(true);
  readonly starting = signal(false);
  readonly error = signal<string | undefined>(undefined);
  readonly severity = STATE_SEVERITY;
  readonly usd = usd;
  readonly states = RUN_STATES;
  readonly columns = ['ticket', 'state', 'cost', 'requestedBy', 'created'];
  state: Run['state'] | undefined;
  ticketKey = '';

  constructor() {
    poll(() => void this.refresh());
  }

  async refresh() {
    this.runs.set(await this.service.list(this.state));
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
