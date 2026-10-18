import { DatePipe } from '@angular/common';
import { Component, computed, inject, input, output } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslateModule } from '@ngx-translate/core';
import type { RunState } from '@zenthos/domain';
import { GlossaryService } from '../../core/glossary';
import type { Run } from '../../core/runs';
import { OFF_RAMPS, STATE_META, stepsFor } from '../../shared/run-state';

/** The canonical path as a stepper. Steps come from RUN_STATES, their status from the run's history; click one to inspect it. */
@Component({
  selector: 'zen-pipeline-view',
  imports: [DatePipe, MatIconModule, MatTooltipModule, TranslateModule],
  styles: `
    .track { display: grid; grid-auto-flow: column; grid-auto-columns: minmax(0, 1fr); gap: 0; list-style: none; margin: 0; padding: 0; }
    .step { position: relative; display: grid; grid-template-rows: 28px 2.4em auto; align-content: start; justify-items: center; gap: 6px; padding: 12px 6px 10px; border: 0; background: none; font: inherit; color: var(--zen-muted); cursor: pointer; border-radius: var(--zen-radius); text-align: center; }
    .step:hover { background: var(--zen-surface-2); }
    .step::before { content: ''; position: absolute; top: 25px; left: -50%; right: 50%; height: 2px; background: var(--zen-line); z-index: 0; }
    .step:first-child::before { display: none; }
    .step.done::before, .step.current::before { background: var(--zen-accent); }
    .dot { position: relative; z-index: 1; width: 28px; height: 28px; border-radius: 50%; display: grid; place-items: center; border: 2px solid var(--zen-line); background: var(--zen-surface); }
    .dot mat-icon { font-size: 16px; width: 16px; height: 16px; }
    .done .dot { border-color: var(--zen-accent); background: var(--zen-accent); color: #fff; }
    .current .dot { border-color: var(--zen-accent); color: var(--zen-accent); box-shadow: 0 0 0 4px var(--zen-accent-soft); }
    .step.selected { outline: 2px solid var(--zen-accent); outline-offset: -2px; }
    .label { font-size: 12px; line-height: 1.2; align-self: start; }
    .done .label, .current .label { color: var(--zen-fg); }
    .current .label { font-weight: 600; }
    .meta { font-family: var(--zen-mono); font-size: 10.5px; color: var(--zen-muted); }
    .visits { position: absolute; top: 8px; right: calc(50% - 26px); font-family: var(--zen-mono); font-size: 10px; background: var(--zen-warn-soft); color: var(--zen-warn); border-radius: 999px; padding: 0 5px; z-index: 2; }
    .exit { display: flex; gap: 8px; align-items: center; margin-top: 10px; padding: 8px 12px; font-size: 12.5px; border-left: 3px solid var(--zen-warn); background: var(--zen-warn-soft); color: var(--zen-warn); border-radius: 0 var(--zen-radius) var(--zen-radius) 0; }
    .exit.failed { border-color: var(--zen-crit); background: var(--zen-crit-soft); color: var(--zen-crit); }
  `,
  template: `
    <ol class="track" [attr.aria-label]="'run.pipeline' | translate">
      @for (step of steps(); track step.state) {
        <li class="contents">
          <button type="button" class="step" [class]="'step ' + step.status" [class.selected]="selected() === step.state" [attr.aria-current]="step.status === 'current' ? 'step' : null" [matTooltip]="glossary.tip('state_' + step.state)" matTooltipShowDelay="400" (click)="pick.emit(step.state)">
            @if (step.visits > 1) {<span class="visits" [title]="'run.visits' | translate: { n: step.visits }">×{{ step.visits }}</span>}
            <span class="dot"><mat-icon aria-hidden="true">{{ step.status === 'done' ? 'check' : meta[step.state].icon }}</mat-icon></span>
            <span class="label">{{ 'stateShort.' + step.state | translate }}</span>
            <span class="meta">{{ step.lastAt ? (step.lastAt | date: 'HH:mm') : '' }}{{ step.by ? ' · ' + step.by : '' }}</span>
          </button>
        </li>
      }
    </ol>
    @if (offRamp(); as state) {
      <div class="exit" [class.failed]="state === 'failed'" role="status">
        <mat-icon aria-hidden="true">{{ meta[state].icon }}</mat-icon>
        <span>{{ 'run.offRamp.' + state | translate }}</span>
      </div>
    }
  `,
})
export class PipelineView {
  readonly run = input.required<Run>();
  readonly selected = input<RunState | undefined>();
  readonly pick = output<RunState>();
  readonly meta = STATE_META;
  readonly glossary = inject(GlossaryService);
  readonly steps = computed(() => stepsFor(this.run()));
  readonly offRamp = computed(() => (OFF_RAMPS.includes(this.run().state) ? this.run().state : undefined));
}
