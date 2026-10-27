import { Component, computed, inject, input, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RouterLink } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { coversRepository } from '@zenthos/domain';
import { installUrl } from '../core/api';
import { GlossaryService } from '../core/glossary';
import { SessionService } from '../core/session';
import { SettingsService, type Installation, type PlatformStatus, type Profile } from '../core/settings';
import { TermLink } from '../shared/term';

/**
 * GitHub installations and repositories (ADR 010, ADR 019). The platform app is the operator's; a workspace installs
 * it on its own accounts from here and claims the installation on the way back (`?installed=<id>`). The first-run
 * steps are derived from what exists, never stored: an installation, a repository profile.
 */
@Component({
  selector: 'zen-settings-page',
  imports: [RouterLink, TranslateModule, MatButtonModule, MatIconModule, MatTooltipModule, TermLink],
  styles: `
    .toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; margin-bottom: 14px; }
    section { margin-bottom: 22px; }
    .section-head { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-bottom: 10px; }
    .section-head h2 { margin: 0; font-size: 15px; font-weight: 600; }
    .setup { padding: 14px 16px; border-left: 3px solid var(--zen-accent); }
    .setup h2 { margin: 0 0 4px; font-size: 15px; }
    .steps { list-style: none; margin: 10px 0 0; padding: 0; display: grid; gap: 8px; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); }
    .steps li { display: grid; grid-template-columns: 22px 1fr; gap: 2px 8px; align-items: start; font-size: 13px; }
    .steps li mat-icon { font-size: 20px; width: 20px; height: 20px; color: var(--zen-muted); }
    .steps li.done mat-icon { color: var(--zen-good); }
    .steps li.next > span:not(.hint) { font-weight: 600; }
    .steps .hint { grid-column: 2; }
    .cards { display: grid; gap: 8px; }
    .conn { padding: 12px 14px; display: grid; gap: 8px; }
    .conn.flash { outline: 2px solid var(--zen-accent); }
    .conn header { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }
    .conn header h3 { margin: 0; font-size: 14px; font-weight: 600; }
    .conn .actions { margin-left: auto; display: flex; flex-wrap: wrap; gap: 6px; }
    .repos { display: flex; flex-wrap: wrap; gap: 6px; }
    .repo-chip { font-family: var(--zen-mono); font-size: 11.5px; border: 1px solid var(--zen-line); border-radius: 999px; padding: 0 8px; }
    button.repo-chip { background: var(--zen-accent-soft); color: var(--zen-accent); border-color: transparent; cursor: pointer; font-family: inherit; }
    .table { width: 100%; border-collapse: collapse; font-size: 13px; }
    .table th { text-align: left; font-family: var(--zen-mono); font-size: 11px; letter-spacing: 0.06em; text-transform: uppercase; color: var(--zen-muted); font-weight: 400; padding: 10px 12px; border-bottom: 1px solid var(--zen-line); white-space: nowrap; }
    .table td { padding: 10px 12px; border-bottom: 1px solid var(--zen-line); vertical-align: middle; white-space: nowrap; }
    .table tr:last-child td { border-bottom: 0; }
    .table td.r, .table th.r { text-align: right; }
    .warn { color: var(--zen-warn); font-size: 18px; width: 18px; height: 18px; vertical-align: -4px; }
    .banner { padding: 8px 12px; margin-bottom: 12px; border-left: 3px solid var(--zen-good); background: var(--zen-good-soft); color: var(--zen-good); font-size: 13px; border-radius: 0 var(--zen-radius) var(--zen-radius) 0; }
    .notice { padding: 10px 14px; font-size: 13px; display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }
  `,
  template: `
    <div class="toolbar">
      <div><div class="eyebrow">{{ 'settings.eyebrow' | translate }}</div><h1 class="text-lg font-semibold m-0">{{ 'settings.title' | translate }}</h1></div>
      <span class="flex-1"></span>
      <a mat-stroked-button routerLink="/settings/members"><mat-icon>group</mat-icon>{{ 'settings.members' | translate }}</a>
    </div>

    @if (installed()) {<div class="banner" role="status">{{ 'settings.installedBanner' | translate }}</div>}

    @if (!loading() && platform()?.configured && !setupDone()) {
      <section class="surface setup" aria-labelledby="setup-title">
        <h2 id="setup-title">{{ 'settings.setup.title' | translate }}</h2>
        <p class="muted text-sm m-0">{{ 'settings.setup.intro' | translate }}</p>
        <ol class="steps">
          @for (step of setup(); track step.key; let i = $index) {
            <li [class.done]="step.done" [class.next]="step.key === nextStep()">
              <mat-icon aria-hidden="true">{{ step.done ? 'check_circle' : 'radio_button_unchecked' }}</mat-icon>
              <span>{{ i + 1 }}. {{ 'settings.setup.' + step.key | translate }}</span>
              <span class="hint">{{ 'settings.setup.' + step.key + 'Hint' | translate }}</span>
            </li>
          }
        </ol>
      </section>
    }

    <section aria-labelledby="github-title">
      <div class="section-head">
        <h2 id="github-title"><zen-term id="setting_installation">{{ 'settings.github' | translate }}</zen-term></h2>
        @if (platform()?.slug; as slug) {<span class="muted text-sm mono">{{ slug }}</span>}
        <span class="flex-1"></span>
        @if (canConfigure() && platform()?.configured) {
          <a mat-flat-button [href]="installHref" [matTooltip]="glossary.tip('platform_app')" matTooltipShowDelay="300"><mat-icon>add_link</mat-icon>{{ 'settings.install' | translate }}</a>
        }
      </div>

      @if (platform() && !platform()?.configured) {
        <div class="surface notice" role="status">
          <mat-icon aria-hidden="true">construction</mat-icon>
          <span>{{ 'settings.noPlatform' | translate }}</span>
          <a mat-button routerLink="/setup">{{ 'settings.setupLink' | translate }}</a>
        </div>
      }

      <div class="cards">
        @for (i of installations(); track i.installationId) {
          <article class="surface conn" [class.flash]="String(i.installationId) === installed()">
            <header>
              <mat-icon aria-hidden="true">apps</mat-icon>
              <h3>{{ i.account }}</h3>
              <span class="muted text-sm">{{ 'settings.repoTotal' | translate: { n: i.repositories.length } }}</span>
              <div class="actions">
                @if (platform()?.installUrl; as url) {<a mat-button [href]="url" [matTooltip]="'settings.manageHint' | translate" matTooltipShowDelay="300"><mat-icon>tune</mat-icon>{{ 'settings.manage' | translate }}</a>}
                @if (canConfigure()) {<button mat-button (click)="release(i)" [attr.aria-label]="('settings.release' | translate) + ' ' + i.account"><mat-icon>link_off</mat-icon>{{ 'settings.release' | translate }}</button>}
              </div>
            </header>
            <div class="repos">
              @for (r of shownRepos(i); track r) {<span class="repo-chip">{{ r }}</span>} @empty {<span class="muted text-sm">{{ 'settings.noRepos' | translate }}</span>}
              @if (i.repositories.length > repoPreview) {
                <button type="button" class="repo-chip" (click)="toggleRepos(i.installationId)" [attr.aria-expanded]="expanded().has(i.installationId)">
                  {{ (expanded().has(i.installationId) ? 'settings.fewerRepos' : 'settings.moreRepos') | translate: { n: i.repositories.length - repoPreview } }}
                </button>
              }
            </div>
          </article>
        } @empty {
          @if (!loading() && platform()?.configured) {<p class="muted text-sm">{{ 'settings.notInstalled' | translate }}</p>}
        }
      </div>
    </section>

    <section aria-labelledby="repos-title">
      <div class="section-head">
        <h2 id="repos-title"><zen-term id="repo_profile">{{ 'settings.repositories' | translate }}</zen-term></h2>
        <span class="flex-1"></span>
        @if (canConfigure()) {<a mat-flat-button routerLink="/settings/repos/new"><mat-icon>add</mat-icon>{{ 'settings.addRepo' | translate }}</a>}
      </div>
      <!-- relative: the visually hidden header text is positioned, and must stay inside the scroll box -->
      <div class="surface overflow-x-auto relative">
        <table class="table">
          <thead>
            <tr>
              <th>{{ 'settings.repo' | translate }}</th>
              <th><zen-term id="setting_installation">{{ 'settings.coveredBy' | translate }}</zen-term></th>
              <th class="r"><zen-term id="setting_gate_commands">{{ 'settings.gates' | translate }}</zen-term></th>
              <th class="r"><zen-term id="gate_review_threshold">{{ 'settings.threshold' | translate }}</zen-term></th>
              <th class="r"><zen-term id="gate_cost_ceiling">{{ 'settings.ceiling' | translate }}</zen-term></th>
              <th class="r"><span class="sr-only">{{ 'settings.actions' | translate }}</span></th>
            </tr>
          </thead>
          <tbody>
            @for (p of profiles(); track p.repo) {
              <tr>
                <td>
                  <a class="link mono" [routerLink]="['/settings/repos', p.repo]">{{ p.repo }}</a>
                  <div class="muted text-xs mono" [title]="'settings.baseBranch' | translate">{{ p.baseBranch }}</div>
                </td>
                <td>
                  @if (coveredBy(p); as account) {<span class="mono">{{ account }}</span>} @else {
                    <mat-icon class="warn" [matTooltip]="'settings.notCovered' | translate" aria-hidden="false" [attr.aria-label]="'settings.notCovered' | translate">warning</mat-icon>
                  }
                </td>
                <td class="r mono">{{ p.gateCommands.length }} / {{ p.allowedCommands.length }}</td>
                <td class="r mono">{{ p.policy.reviewThreshold }}</td>
                <td class="r mono">US$ {{ p.policy.costCeilingUsd }}</td>
                <td class="r whitespace-nowrap">
                  @if (canConfigure()) {
                    <a mat-icon-button [routerLink]="['/settings/repos', p.repo]" [attr.aria-label]="('settings.edit' | translate) + ' ' + p.repo"><mat-icon>edit</mat-icon></a>
                    <button mat-icon-button (click)="removeProfile(p)" [attr.aria-label]="('settings.remove' | translate) + ' ' + p.repo"><mat-icon>delete</mat-icon></button>
                  }
                </td>
              </tr>
            } @empty {
              <tr><td colspan="6" class="muted">{{ loading() ? '' : ('settings.noRepos' | translate) }}</td></tr>
            }
          </tbody>
        </table>
      </div>
    </section>
  `,
})
export class SettingsPage {
  private readonly settings = inject(SettingsService);
  private readonly translate = inject(TranslateService);
  readonly glossary = inject(GlossaryService);
  private readonly session = inject(SessionService);
  /** Owners and admins configure; members only read. The API enforces it; this hides what would be refused. */
  readonly canConfigure = computed(() => this.session.can('configure'));
  /** Set by the API's redirect after GitHub: the installation that was just claimed. */
  readonly installed = input<string>();
  readonly platform = signal<PlatformStatus | undefined>(undefined);
  readonly installations = signal<Installation[]>([]);
  readonly profiles = signal<Profile[]>([]);
  readonly loading = signal(true);
  /** A full navigation: GitHub needs the browser itself, and comes back to /settings through the API. */
  readonly installHref = installUrl();
  /** An installation can cover dozens of repositories; the card shows a few and the total, the rest on request. */
  readonly repoPreview = 6;
  readonly expanded = signal<Set<number>>(new Set());
  readonly String = String;

  readonly setup = computed(() => [
    { key: 'install', done: this.installations().length > 0 },
    { key: 'repo', done: this.profiles().length > 0 },
  ]);
  readonly setupDone = computed(() => this.setup().every((step) => step.done));
  readonly nextStep = computed(() => this.setup().find((step) => !step.done)?.key);

  constructor() {
    void this.refresh();
  }

  async refresh() {
    const [platform, installations, profiles] = await Promise.all([this.settings.platform(), this.settings.installations(), this.settings.profiles()]);
    this.platform.set(platform);
    this.installations.set(installations);
    this.profiles.set(profiles);
    this.loading.set(false);
  }

  /** The account whose installation covers the repository; none means runs will fail to act on it. */
  coveredBy(profile: Profile): string | undefined {
    return this.installations().find((i) => coversRepository([i], profile.repo))?.account;
  }

  shownRepos(installation: Installation): string[] {
    const sorted = [...installation.repositories].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
    return this.expanded().has(installation.installationId) ? sorted : sorted.slice(0, this.repoPreview);
  }

  toggleRepos(installationId: number) {
    this.expanded.update((ids) => {
      const next = new Set(ids);
      if (!next.delete(installationId)) next.add(installationId);
      return next;
    });
  }

  async release(installation: Installation) {
    if (!confirm(this.translate.instant('settings.confirmRelease', { account: installation.account }))) return;
    await this.settings.releaseInstallation(installation.installationId);
    await this.refresh();
  }

  async removeProfile(profile: Profile) {
    if (!confirm(this.translate.instant('settings.confirmRemoveRepo', { repo: profile.repo }))) return;
    await this.settings.removeProfile(profile.repo);
    await this.refresh();
  }
}
