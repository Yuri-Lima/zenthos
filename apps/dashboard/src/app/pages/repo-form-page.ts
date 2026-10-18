import { Component, computed, inject, input, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Router, RouterLink } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { coversRepository, DEFAULT_POLICY, TOOLING_PATH_PREFIXES } from '@zenthos/domain';
import { GlossaryService } from '../core/glossary';
import { SettingsService, type Connection } from '../core/settings';

type Form = {
  repo: string;
  cloneUrl: string;
  baseBranch: string;
  connectionId: string;
  allowedText: string;
  gates: string[];
  extraForbiddenText: string;
  costCeilingUsd: number;
  diffBudgetLines: number;
  maxImplementRounds: number;
  maxReviewRounds: number;
  reviewThreshold: number;
};

const REPO_PATTERN = /^[\w.-]+\/[\w.-]+$/;
const lines = (text: string) => [...new Set(text.split('\n').map((line) => line.trim()).filter(Boolean))];
const isTooling = (prefix: string) => (TOOLING_PATH_PREFIXES as readonly string[]).includes(prefix);

const blank = (): Form => ({
  repo: '',
  cloneUrl: '',
  baseBranch: 'main',
  connectionId: '',
  allowedText: '',
  gates: [],
  extraForbiddenText: DEFAULT_POLICY.forbiddenPathPrefixes.filter((p) => !isTooling(p)).join('\n'),
  costCeilingUsd: DEFAULT_POLICY.costCeilingUsd,
  diffBudgetLines: DEFAULT_POLICY.diffBudgetLines,
  maxImplementRounds: DEFAULT_POLICY.maxImplementRounds,
  maxReviewRounds: DEFAULT_POLICY.maxReviewRounds,
  reviewThreshold: DEFAULT_POLICY.reviewThreshold,
});

/**
 * One repository profile as a form over PUT /repos. Gate commands are picked from the allowed commands, so
 * "gates are a subset" holds by construction; the tooling prefixes are always forbidden and shown, not edited.
 * Defaults come from the domain's DEFAULT_POLICY; every field's meaning comes from the glossary.
 */
@Component({
  selector: 'zen-repo-form-page',
  imports: [FormsModule, RouterLink, TranslateModule, MatButtonModule, MatCheckboxModule, MatFormFieldModule, MatIconModule, MatInputModule, MatSelectModule, MatTooltipModule],
  styles: `
    form { display: grid; gap: 16px; max-width: 880px; }
    fieldset { border: 1px solid var(--zen-line); border-radius: var(--zen-radius); padding: 14px 16px 16px; margin: 0; display: grid; gap: 12px; background: var(--zen-surface); }
    legend { padding: 0 6px; font-size: 13px; font-weight: 600; }
    .row { display: grid; gap: 12px; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); }
    .gates { display: grid; gap: 2px; }
    .gates .cmd { font-family: var(--zen-mono); font-size: 12.5px; }
    .tooling { display: flex; flex-wrap: wrap; gap: 6px; font-family: var(--zen-mono); font-size: 11px; color: var(--zen-muted); }
    .tooling span { border: 1px solid var(--zen-line); border-radius: 4px; padding: 0 6px; }
    .help { font-size: 18px; width: 18px; height: 18px; color: var(--zen-muted); cursor: help; }
    .warn { display: flex; gap: 8px; align-items: center; font-size: 12.5px; color: var(--zen-warn); }
    .actions { display: flex; gap: 8px; align-items: center; }
    .error { color: var(--zen-crit); font-size: 13px; margin: 0; }
  `,
  template: `
    <a routerLink="/settings" class="link text-sm">← {{ 'settings.title' | translate }}</a>
    <h1 class="text-lg font-semibold mt-2 mb-4">{{ (editing() ? 'repoForm.editTitle' : 'repoForm.newTitle') | translate }} @if (editing()) {<span class="mono">{{ form().repo }}</span>}</h1>

    <form (ngSubmit)="save()">
      <fieldset>
        <legend>{{ 'repoForm.repository' | translate }}</legend>
        <div class="row">
          <mat-form-field appearance="outline" subscriptSizing="dynamic">
            <mat-label>{{ 'settings.repo' | translate }}</mat-label>
            <input matInput name="repo" [ngModel]="form().repo" (ngModelChange)="patch({ repo: $event.trim() })" (blur)="suggestCloneUrl()" [disabled]="editing()" placeholder="owner/name" required autocomplete="off" class="mono" />
            <mat-icon matSuffix class="help" [matTooltip]="glossary.tip('repo_profile')">help_outline</mat-icon>
          </mat-form-field>
          <mat-form-field appearance="outline" subscriptSizing="dynamic">
            <mat-label>{{ 'settings.baseBranch' | translate }}</mat-label>
            <input matInput name="baseBranch" [ngModel]="form().baseBranch" (ngModelChange)="patch({ baseBranch: $event })" required autocomplete="off" class="mono" />
          </mat-form-field>
        </div>
        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>{{ 'repoForm.cloneUrl' | translate }}</mat-label>
          <input matInput name="cloneUrl" [ngModel]="form().cloneUrl" (ngModelChange)="patch({ cloneUrl: $event })" required autocomplete="off" class="mono" />
        </mat-form-field>
        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>{{ 'settings.connection' | translate }}</mat-label>
          <mat-select name="connectionId" [ngModel]="form().connectionId" (ngModelChange)="patch({ connectionId: $event })">
            <mat-option value="">{{ 'settings.environment' | translate }}</mat-option>
            @for (c of connections(); track c.id) {<mat-option [value]="c.id">{{ c.name }} · {{ 'settings.kind.' + c.kind | translate }}</mat-option>}
          </mat-select>
          <mat-icon matSuffix class="help" [matTooltip]="glossary.tip('setting_connection')">help_outline</mat-icon>
        </mat-form-field>
        @if (coverage() === false) {
          <div class="warn" role="status">
            <mat-icon aria-hidden="true">warning</mat-icon>
            <span>{{ 'settings.notCovered' | translate }}</span>
            @if (selectedConnection()?.installUrl; as url) {<a mat-button [href]="url">{{ 'settings.install' | translate }}</a>}
          </div>
        }
      </fieldset>

      <fieldset>
        <legend>{{ 'repoForm.commands' | translate }}</legend>
        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>{{ 'repoForm.allowed' | translate }}</mat-label>
          <textarea matInput name="allowed" rows="5" class="mono" [ngModel]="form().allowedText" (ngModelChange)="setAllowed($event)" placeholder="bun install&#10;bun run lint&#10;bun run test"></textarea>
          <mat-icon matSuffix class="help" [matTooltip]="glossary.tip('setting_allowed_commands')">help_outline</mat-icon>
          <mat-hint>{{ 'repoForm.allowedHint' | translate }}</mat-hint>
        </mat-form-field>
        <div class="gates" role="group" [attr.aria-label]="'repoForm.gatesLabel' | translate">
          <div class="text-sm flex items-center gap-1">{{ 'repoForm.gatesLabel' | translate }} <mat-icon class="help" [matTooltip]="glossary.tip('setting_gate_commands')">help_outline</mat-icon></div>
          @for (command of allowed(); track command) {
            <mat-checkbox [checked]="form().gates.includes(command)" (change)="toggleGate(command, $event.checked)"><span class="cmd">{{ command }}</span></mat-checkbox>
          } @empty {
            <span class="muted text-sm">{{ 'repoForm.noAllowed' | translate }}</span>
          }
        </div>
      </fieldset>

      <fieldset>
        <legend>{{ 'repoForm.policy' | translate }}</legend>
        <div class="row">
          <mat-form-field appearance="outline" subscriptSizing="dynamic">
            <mat-label>{{ 'repoForm.costCeiling' | translate }}</mat-label>
            <input matInput type="number" min="0.01" step="0.5" name="cost" [ngModel]="form().costCeilingUsd" (ngModelChange)="patch({ costCeilingUsd: $event })" required />
            <mat-icon matSuffix class="help" [matTooltip]="glossary.tip('gate_cost_ceiling')">help_outline</mat-icon>
          </mat-form-field>
          <mat-form-field appearance="outline" subscriptSizing="dynamic">
            <mat-label>{{ 'repoForm.diffBudget' | translate }}</mat-label>
            <input matInput type="number" min="1" step="50" name="diff" [ngModel]="form().diffBudgetLines" (ngModelChange)="patch({ diffBudgetLines: $event })" required />
            <mat-icon matSuffix class="help" [matTooltip]="glossary.tip('gate_diff_budget')">help_outline</mat-icon>
          </mat-form-field>
          <mat-form-field appearance="outline" subscriptSizing="dynamic">
            <mat-label>{{ 'repoForm.threshold' | translate }}</mat-label>
            <input matInput type="number" min="1" max="5" step="0.25" name="threshold" [ngModel]="form().reviewThreshold" (ngModelChange)="patch({ reviewThreshold: $event })" required />
            <mat-icon matSuffix class="help" [matTooltip]="glossary.tip('gate_review_threshold')">help_outline</mat-icon>
          </mat-form-field>
          <mat-form-field appearance="outline" subscriptSizing="dynamic">
            <mat-label>{{ 'repoForm.implementRounds' | translate }}</mat-label>
            <input matInput type="number" min="1" step="1" name="implement" [ngModel]="form().maxImplementRounds" (ngModelChange)="patch({ maxImplementRounds: $event })" required />
            <mat-icon matSuffix class="help" [matTooltip]="glossary.tip('setting_implement_rounds')">help_outline</mat-icon>
          </mat-form-field>
          <mat-form-field appearance="outline" subscriptSizing="dynamic">
            <mat-label>{{ 'repoForm.reviewRounds' | translate }}</mat-label>
            <input matInput type="number" min="0" step="1" name="review" [ngModel]="form().maxReviewRounds" (ngModelChange)="patch({ maxReviewRounds: $event })" required />
            <mat-icon matSuffix class="help" [matTooltip]="glossary.tip('setting_review_rounds')">help_outline</mat-icon>
          </mat-form-field>
        </div>
        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>{{ 'repoForm.forbidden' | translate }}</mat-label>
          <textarea matInput name="forbidden" rows="3" class="mono" [ngModel]="form().extraForbiddenText" (ngModelChange)="patch({ extraForbiddenText: $event })"></textarea>
          <mat-icon matSuffix class="help" [matTooltip]="glossary.tip('gate_forbidden_paths')">help_outline</mat-icon>
          <mat-hint>{{ 'repoForm.forbiddenHint' | translate }}</mat-hint>
        </mat-form-field>
        <div>
          <div class="text-xs muted mb-1">{{ 'repoForm.alwaysForbidden' | translate }}</div>
          <div class="tooling">@for (prefix of tooling; track prefix) {<span>{{ prefix }}</span>}</div>
        </div>
      </fieldset>

      @if (error(); as message) {<p class="error" role="alert">{{ message }}</p>}
      <div class="actions">
        <button mat-flat-button type="submit" [disabled]="busy() || !valid()">{{ 'repoForm.save' | translate }}</button>
        <a mat-button routerLink="/settings">{{ 'common.cancel' | translate }}</a>
      </div>
    </form>
  `,
})
export class RepoFormPage implements OnInit {
  private readonly settings = inject(SettingsService);
  private readonly router = inject(Router);
  readonly glossary = inject(GlossaryService);
  /** The repository being edited, from the route; absent on /settings/repos/new. */
  readonly repo = input<string>();
  readonly form = signal<Form>(blank());
  readonly connections = signal<Connection[]>([]);
  readonly busy = signal(false);
  readonly error = signal<string | undefined>(undefined);
  readonly editing = computed(() => Boolean(this.repo()));
  readonly tooling = TOOLING_PATH_PREFIXES;
  readonly allowed = computed(() => lines(this.form().allowedText));
  readonly selectedConnection = computed(() => this.connections().find((c) => c.id === this.form().connectionId));
  readonly coverage = computed(() => {
    const connection = this.selectedConnection();
    return connection && REPO_PATTERN.test(this.form().repo) ? coversRepository(connection, this.form().repo) : undefined;
  });
  readonly valid = computed(() => {
    const f = this.form();
    return REPO_PATTERN.test(f.repo) && f.cloneUrl.trim().length > 0 && f.baseBranch.trim().length > 0;
  });

  async ngOnInit() {
    const [connections, profiles] = await Promise.all([this.settings.connections(), this.settings.profiles()]);
    this.connections.set(connections);
    const profile = profiles.find((p) => p.repo === this.repo());
    if (!profile) return;
    this.form.set({
      repo: profile.repo,
      cloneUrl: profile.cloneUrl,
      baseBranch: profile.baseBranch,
      connectionId: profile.connectionId ?? '',
      allowedText: profile.allowedCommands.join('\n'),
      gates: profile.gateCommands,
      extraForbiddenText: profile.policy.forbiddenPathPrefixes.filter((p) => !isTooling(p)).join('\n'),
      ...profile.policy,
    });
  }

  patch(change: Partial<Form>) {
    this.form.update((f) => ({ ...f, ...change }));
  }

  /** A gate whose command leaves the allowlist leaves the gates with it. */
  setAllowed(text: string) {
    const allowed = lines(text);
    this.patch({ allowedText: text, gates: this.form().gates.filter((gate) => allowed.includes(gate)) });
  }

  toggleGate(command: string, on: boolean) {
    const gates = this.form().gates.filter((gate) => gate !== command);
    this.patch({ gates: on ? [...gates, command] : gates });
  }

  suggestCloneUrl() {
    const { repo, cloneUrl } = this.form();
    if (!cloneUrl && REPO_PATTERN.test(repo)) this.patch({ cloneUrl: `https://github.com/${repo}.git` });
  }

  async save() {
    const f = this.form();
    this.busy.set(true);
    this.error.set(undefined);
    const failure = await this.settings.saveProfile(f.repo, {
      cloneUrl: f.cloneUrl.trim(),
      baseBranch: f.baseBranch.trim(),
      allowedCommands: this.allowed(),
      gateCommands: this.allowed().filter((command) => f.gates.includes(command)),
      ...(f.connectionId ? { connectionId: f.connectionId } : {}),
      policy: {
        costCeilingUsd: f.costCeilingUsd,
        diffBudgetLines: f.diffBudgetLines,
        maxImplementRounds: f.maxImplementRounds,
        maxReviewRounds: f.maxReviewRounds,
        reviewThreshold: f.reviewThreshold,
        forbiddenPathPrefixes: lines(f.extraForbiddenText),
      },
    });
    this.busy.set(false);
    if (failure) return this.error.set(failure);
    await this.router.navigate(['/settings']);
  }
}
