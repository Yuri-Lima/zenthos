import { Component, computed, inject, input } from '@angular/core';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RouterLink } from '@angular/router';
import { GlossaryService } from '../core/glossary';

/**
 * Wraps a label with its glossary definition on hover and focus, and a link to the entry. The definition comes
 * from the domain through the API. Never inside a button or another link: there, put the definition on the
 * control itself with matTooltip and GlossaryService.tip, so a click still does what the control does.
 */
@Component({
  selector: 'zen-term',
  imports: [MatTooltipModule, RouterLink],
  styles: `
    a { color: inherit; text-decoration: none; border-bottom: 1px dotted var(--zen-muted); cursor: help; }
    a:hover, a:focus-visible { border-bottom-color: var(--zen-accent); color: var(--zen-accent); }
  `,
  template: `<a [routerLink]="['/glossary']" [fragment]="id()" [matTooltip]="tip()" matTooltipShowDelay="300"><ng-content /></a>`,
})
export class TermLink {
  readonly id = input.required<string>();
  private readonly glossary = inject(GlossaryService);
  readonly tip = computed(() => this.glossary.tip(this.id()));
}
