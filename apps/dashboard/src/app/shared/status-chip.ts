import { Component, computed, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { TranslateModule } from '@ngx-translate/core';
import type { RunState } from '@zenthos/domain';
import { STATE_META, type Severity } from './run-state';

/** One chip for every state and every gate result: icon, translated label and a reserved colour. Never colour alone. */
@Component({
  selector: 'zen-status-chip',
  imports: [MatIconModule, TranslateModule],
  template: `<span class="zen-chip" [class]="'zen-chip ' + severity()" [attr.aria-label]="label() | translate"><mat-icon aria-hidden="true">{{ icon() }}</mat-icon>{{ label() | translate }}</span>`,
})
export class StatusChip {
  readonly state = input<RunState>();
  readonly custom = input<{ severity: Severity; icon: string; label: string }>();
  readonly severity = computed(() => this.custom()?.severity ?? STATE_META[this.state() ?? 'intake'].severity);
  readonly icon = computed(() => this.custom()?.icon ?? STATE_META[this.state() ?? 'intake'].icon);
  readonly label = computed(() => this.custom()?.label ?? `state.${this.state()}`);
}
