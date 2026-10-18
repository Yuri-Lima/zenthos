import { DatePipe } from '@angular/common';
import { Component, computed, input, output } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { TranslateModule } from '@ngx-translate/core';
import type { RunState } from '@zenthos/domain';
import type { Run } from '../../core/runs';
import { duration, minutesBetween, STATE_META } from '../../shared/run-state';
import { StatusChip } from '../../shared/status-chip';

/** Every transition in order, with the time since the previous one and who caused it. Failures read as what they are. */
@Component({
  selector: 'zen-timeline-view',
  imports: [DatePipe, MatIconModule, TranslateModule, StatusChip],
  styles: `
    ol { list-style: none; margin: 0; padding: 0; display: grid; }
    .row { display: grid; grid-template-columns: 64px 24px 1fr auto; gap: 12px; align-items: start; padding: 8px 10px; border: 0; background: none; font: inherit; color: inherit; text-align: left; cursor: pointer; border-radius: var(--zen-radius); width: 100%; }
    .row:hover { background: var(--zen-surface-2); }
    .row.selected { outline: 2px solid var(--zen-accent); outline-offset: -2px; }
    .t { font-family: var(--zen-mono); font-size: 12px; color: var(--zen-muted); padding-top: 3px; }
    .rail { position: relative; display: grid; justify-items: center; }
    .rail::before { content: ''; position: absolute; top: 22px; bottom: -10px; width: 2px; background: var(--zen-line); }
    li:last-child .rail::before { display: none; }
    .pin { width: 10px; height: 10px; border-radius: 50%; margin-top: 7px; background: var(--zen-accent); position: relative; z-index: 1; }
    .pin.warn { background: var(--zen-warn); } .pin.crit { background: var(--zen-crit); } .pin.good { background: var(--zen-good); } .pin.neutral { background: var(--zen-neutral); }
    .what { display: grid; gap: 2px; }
    .event { font-family: var(--zen-mono); font-size: 11.5px; color: var(--zen-muted); }
    .dur { font-family: var(--zen-mono); font-size: 12px; color: var(--zen-muted); padding-top: 3px; white-space: nowrap; }
  `,
  template: `
    <ol [attr.aria-label]="'run.timeline' | translate">
      <li>
        <button type="button" class="row" [class.selected]="selected() === 'intake'" (click)="pick.emit('intake')">
          <span class="t">{{ run().createdAt | date: 'HH:mm:ss' }}</span>
          <span class="rail"><span class="pin neutral"></span></span>
          <span class="what"><zen-status-chip state="intake" /><span class="event">{{ 'run.started' | translate }}{{ run().requestedBy ? ' · ' + run().requestedBy : '' }}</span></span>
          <span class="dur"></span>
        </button>
      </li>
      @for (entry of entries(); track entry.at) {
        <li>
          <button type="button" class="row" [class.selected]="selected() === entry.to" (click)="pick.emit(entry.to)">
            <span class="t">{{ entry.at | date: 'HH:mm:ss' }}</span>
            <span class="rail"><span class="pin" [class]="'pin ' + meta[entry.to].severity"></span></span>
            <span class="what"><zen-status-chip [state]="entry.to" /><span class="event">{{ entry.event }}{{ entry.by ? ' · ' + entry.by : '' }}</span></span>
            <span class="dur" [title]="'run.sincePrevious' | translate">+{{ duration(entry.minutes) }}</span>
          </button>
        </li>
      }
    </ol>
  `,
})
export class TimelineView {
  readonly run = input.required<Run>();
  readonly selected = input<RunState | undefined>();
  readonly pick = output<RunState>();
  readonly meta = STATE_META;
  readonly duration = duration;
  readonly entries = computed(() => {
    const run = this.run();
    let previous = run.createdAt;
    return run.history.map((entry) => {
      const minutes = minutesBetween(previous, entry.at);
      previous = entry.at;
      return { ...entry, minutes };
    });
  });
}
