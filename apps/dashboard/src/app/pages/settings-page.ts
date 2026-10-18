import { DatePipe } from '@angular/common';
import { Component, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RouterLink } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { coversRepository } from '@zenthos/domain';
import { manifestUrl } from '../core/api';
import { GlossaryService } from '../core/glossary';
import { SettingsService, type Connection, type ConnectionCheck, type Profile } from '../core/settings';
import { StatusChip } from '../shared/status-chip';
import { TermLink } from '../shared/term';

type ConnectMode = 'manifest' | 'app' | 'token' | undefined;

/**
 * Providers and repositories (ADR 010). The first-run steps are derived from what exists, never stored:
 * a connection, somewhere it may act, a repository profile. GitHub sends the browser back here with
 * `?connected=<id>` after a manifest or an install, and that connection is highlighted.
 */
@Component({
  selector: 'zen-settings-page',
  imports: [DatePipe, FormsModule, RouterLink, TranslateModule, MatButtonModule, MatFormFieldModule, MatIconModule, MatInputModule, MatTooltipModule, StatusChip, TermLink],
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
    .connect { padding: 12px 14px; margin-bottom: 10px; display: flex; flex-wrap: wrap; align-items: flex-start; gap: 10px; }
    .connect .full { flex-basis: 100%; margin: 0; }
    .cards { display: grid; gap: 8px; }
    .conn { padding: 12px 14px; display: grid; gap: 8px; }
    .conn.flash { outline: 2px solid var(--zen-accent); }
    .conn header { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }
    .conn header h3 { margin: 0; font-size: 14px; font-weight: 600; }
    .conn .actions { margin-left: auto; display: flex; flex-wrap: wrap; gap: 6px; }
    .kind { font-family: var(--zen-mono); font-size: 11px; color: var(--zen-muted); border: 1px solid var(--zen-line); border-radius: 4px; padding: 1px 6px; }
    .inst { display: grid; grid-template-columns: 9rem 1fr; gap: 4px 12px; font-size: 12.5px; align-items: baseline; }
    .inst dt { font-family: var(--zen-mono); color: var(--zen-muted); font-size: 11.5px; }
    .inst dd { margin: 0; display: flex; flex-wrap: wrap; gap: 6px; }
    .repo-chip { font-family: var(--zen-mono); font-size: 11.5px; border: 1px solid var(--zen-line); border-radius: 999px; padding: 0 8px; }
    .check { display: flex; align-items: center; gap: 8px; font-size: 12.5px; }
    .table { width: 100%; border-collapse: collapse; font-size: 13px; }
    .table th { text-align: left; font-family: var(--zen-mono); font-size: 11px; letter-spacing: 0.06em; text-transform: uppercase; color: var(--zen-muted); font-weight: 400; padding: 10px 12px; border-bottom: 1px solid var(--zen-line); white-space: nowrap; }
    .table td { padding: 10px 12px; border-bottom: 1px solid var(--zen-line); vertical-align: middle; white-space: nowrap; }
    .table tr:last-child td { border-bottom: 0; }
    .table td.r, .table th.r { text-align: right; }
    .warn { color: var(--zen-warn); font-size: 18px; width: 18px; height: 18px; vertical-align: -4px; }
    .banner { padding: 8px 12px; margin-bottom: 12px; border-left: 3px solid var(--zen-good); background: var(--zen-good-soft); color: var(--zen-good); font-size: 13px; border-radius: 0 var(--zen-radius) var(--zen-radius) 0; }
    .error { color: var(--zen-crit); font-size: 13px; }
  `,
  template: `
    <div class="toolbar">
      <div><div class="eyebrow">{{ 'settings.eyebrow' | translate }}</div><h1 class="text-lg font-semibold m-0">{{ 'settings.title' | translate }}</h1></div>
    </div>

    @if (connected()) {<div class="banner" role="status">{{ 'settings.connectedBanner' | translate }}</div>}

    @if (!loading() && !setupDone()) {
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

    <section aria-labelledby="providers-title">
      <div class="section-head">
        <h2 id="providers-title"><zen-term id="setting_connection">{{ 'settings.providers' | translate }}</zen-term></h2>
        <span class="flex-1"></span>
        <button mat-flat-button (click)="toggle('manifest')"><mat-icon>add</mat-icon>{{ 'settings.createApp' | translate }}</button>
        <button mat-stroked-button (click)="toggle('app')">{{ 'settings.existingApp' | translate }}</button>
        <button mat-stroked-button (click)="toggle('token')">{{ 'settings.token' | translate }}</button>
      </div>

      @switch (mode()) {
        @case ('manifest') {
          <form class="surface connect" (ngSubmit)="createApp()">
            <p class="full muted text-sm">{{ 'settings.manifestIntro' | translate }} <zen-term id="setting_manifest">{{ 'settings.howItWorks' | translate }}</zen-term></p>
            <mat-form-field appearance="outline" subscriptSizing="dynamic" class="w-64">
              <mat-label>{{ 'settings.appName' | translate }}</mat-label>
              <input matInput name="appName" [(ngModel)]="appName" required autocomplete="off" />
            </mat-form-field>
            <mat-form-field appearance="outline" subscriptSizing="dynamic" class="w-64">
              <mat-label>{{ 'settings.owner' | translate }}</mat-label>
              <input matInput name="owner" [(ngModel)]="owner" autocomplete="off" />
              <mat-hint>{{ 'settings.ownerHint' | translate }}</mat-hint>
            </mat-form-field>
            <button mat-flat-button type="submit" [disabled]="!appName.trim()">{{ 'settings.continueToGitHub' | translate }}</button>
            <button mat-button type="button" (click)="mode.set(undefined)">{{ 'common.cancel' | translate }}</button>
          </form>
        }
        @case ('app') {
          <form class="surface connect" (ngSubmit)="connectApp()">
            <p class="full muted text-sm">{{ 'settings.existingAppIntro' | translate }}</p>
            <mat-form-field appearance="outline" subscriptSizing="dynamic" class="w-56"><mat-label>{{ 'settings.appSlug' | translate }}</mat-label><input matInput name="name" [(ngModel)]="app.name" required autocomplete="off" /></mat-form-field>
            <mat-form-field appearance="outline" subscriptSizing="dynamic" class="w-40"><mat-label>{{ 'settings.appId' | translate }}</mat-label><input matInput name="appId" [(ngModel)]="app.appId" required autocomplete="off" class="mono" /></mat-form-field>
            <mat-form-field appearance="outline" subscriptSizing="dynamic" class="w-full"><mat-label>{{ 'settings.privateKey' | translate }}</mat-label><textarea matInput name="privateKey" [(ngModel)]="app.privateKey" required rows="4" class="mono" autocomplete="off"></textarea></mat-form-field>
            <mat-form-field appearance="outline" subscriptSizing="dynamic" class="w-56"><mat-label>{{ 'settings.webhookSecret' | translate }}</mat-label><input matInput type="password" name="webhookSecret" [(ngModel)]="app.webhookSecret" autocomplete="off" /></mat-form-field>
            <mat-form-field appearance="outline" subscriptSizing="dynamic" class="w-56"><mat-label>{{ 'settings.clientId' | translate }}</mat-label><input matInput name="clientId" [(ngModel)]="app.clientId" autocomplete="off" class="mono" /></mat-form-field>
            <mat-form-field appearance="outline" subscriptSizing="dynamic" class="w-56"><mat-label>{{ 'settings.clientSecret' | translate }}</mat-label><input matInput type="password" name="clientSecret" [(ngModel)]="app.clientSecret" autocomplete="off" /></mat-form-field>
            <div class="full flex gap-2">
              <button mat-flat-button type="submit" [disabled]="busy() || !app.name || !app.appId || !app.privateKey">{{ 'settings.connect' | translate }}</button>
              <button mat-button type="button" (click)="mode.set(undefined)">{{ 'common.cancel' | translate }}</button>
            </div>
            @if (error(); as message) {<p class="full error" role="alert">{{ message }}</p>}
          </form>
        }
        @case ('token') {
          <form class="surface connect" (ngSubmit)="connectToken()">
            <p class="full muted text-sm">{{ 'settings.tokenIntro' | translate }} <zen-term id="setting_health_check">{{ 'settings.healthCheck' | translate }}</zen-term></p>
            <mat-form-field appearance="outline" subscriptSizing="dynamic" class="w-56"><mat-label>{{ 'settings.tokenName' | translate }}</mat-label><input matInput name="tokenName" [(ngModel)]="token.name" required autocomplete="off" /></mat-form-field>
            <mat-form-field appearance="outline" subscriptSizing="dynamic" class="w-80"><mat-label>{{ 'settings.tokenValue' | translate }}</mat-label><input matInput type="password" name="tokenValue" [(ngModel)]="token.token" required autocomplete="off" class="mono" /></mat-form-field>
            <button mat-flat-button type="submit" [disabled]="busy() || !token.name || !token.token">{{ 'settings.connect' | translate }}</button>
            <button mat-button type="button" (click)="mode.set(undefined)">{{ 'common.cancel' | translate }}</button>
            @if (error(); as message) {<p class="full error" role="alert">{{ message }}</p>}
          </form>
        }
      }

      <div class="cards">
        @for (c of connections(); track c.id) {
          <article class="surface conn" [class.flash]="c.id === connected()">
            <header>
              <mat-icon aria-hidden="true">{{ c.kind === 'github-app' ? 'apps' : 'key' }}</mat-icon>
              <h3>{{ c.name }}</h3>
              <span class="kind">{{ 'settings.kind.' + c.kind | translate }}</span>
              <span class="muted text-xs">{{ 'settings.since' | translate }} {{ c.createdAt | date: 'mediumDate' }}</span>
              <div class="actions">
                <button mat-stroked-button (click)="check(c)" [disabled]="checking() === c.id" [matTooltip]="glossary.tip('setting_health_check')" matTooltipShowDelay="300"><mat-icon>monitor_heart</mat-icon>{{ 'settings.check' | translate }}</button>
                <!-- the same GitHub page installs the app or, where it is installed, changes its repositories; the label follows the state -->
                @if (c.installUrl; as url) {
                  @if (c.installations.length) {
                    <a mat-button [href]="url" [matTooltip]="'settings.manageHint' | translate" matTooltipShowDelay="300"><mat-icon>tune</mat-icon>{{ 'settings.manage' | translate }}</a>
                  } @else {
                    <a mat-flat-button [href]="url" [matTooltip]="glossary.tip('setting_installation')" matTooltipShowDelay="300"><mat-icon>add_link</mat-icon>{{ 'settings.install' | translate }}</a>
                  }
                }
                <button mat-button (click)="removeConnection(c)" [attr.aria-label]="('settings.remove' | translate) + ' ' + c.name"><mat-icon>delete</mat-icon>{{ 'settings.remove' | translate }}</button>
              </div>
            </header>
            @if (checks()[c.id]; as result) {
              <div class="check" role="status">
                <zen-status-chip [custom]="{ severity: result.ok ? 'good' : 'crit', icon: result.ok ? 'check' : 'close', label: result.ok ? 'settings.healthy' : 'settings.refused' }" />
                <span>@if (result.ok) {{{ 'settings.checkOk' | translate: { actsAs: result.actsAs } }}@if (result.repositories !== undefined) { {{ 'settings.checkRepos' | translate: { n: result.repositories } }}}} @else {{{ result.reason }}}</span>
              </div>
            }
            @if (c.kind === 'github-app') {
              <dl class="inst">
                @for (i of c.installations; track i.installationId) {
                  <dt>{{ i.account }}</dt>
                  <dd>@for (r of i.repositories; track r) {<span class="repo-chip">{{ r }}</span>} @empty {<span class="muted">{{ 'settings.noRepos' | translate }}</span>}</dd>
                } @empty {
                  <dt><zen-term id="setting_installation">{{ 'settings.installations' | translate }}</zen-term></dt>
                  <dd class="muted">{{ 'settings.notInstalled' | translate }}</dd>
                }
              </dl>
            }
          </article>
        } @empty {
          @if (!loading()) {<p class="muted text-sm">{{ 'settings.noConnections' | translate }}</p>}
        }
      </div>
    </section>

    <section aria-labelledby="repos-title">
      <div class="section-head">
        <h2 id="repos-title"><zen-term id="repo_profile">{{ 'settings.repositories' | translate }}</zen-term></h2>
        <span class="flex-1"></span>
        <a mat-flat-button routerLink="/settings/repos/new"><mat-icon>add</mat-icon>{{ 'settings.addRepo' | translate }}</a>
      </div>
      <!-- relative: the visually hidden header text is positioned, and must stay inside the scroll box -->
      <div class="surface overflow-x-auto relative">
        <table class="table">
          <thead>
            <tr>
              <th>{{ 'settings.repo' | translate }}</th>
              <th><zen-term id="setting_connection">{{ 'settings.connection' | translate }}</zen-term></th>
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
                  {{ connectionName(p) }}
                  @if (coverage(p) === false) {<mat-icon class="warn" [matTooltip]="'settings.notCovered' | translate" aria-hidden="false" [attr.aria-label]="'settings.notCovered' | translate">warning</mat-icon>}
                </td>
                <td class="r mono">{{ p.gateCommands.length }} / {{ p.allowedCommands.length }}</td>
                <td class="r mono">{{ p.policy.reviewThreshold }}</td>
                <td class="r mono">US$ {{ p.policy.costCeilingUsd }}</td>
                <td class="r whitespace-nowrap">
                  <a mat-icon-button [routerLink]="['/settings/repos', p.repo]" [attr.aria-label]="('settings.edit' | translate) + ' ' + p.repo"><mat-icon>edit</mat-icon></a>
                  <button mat-icon-button (click)="removeProfile(p)" [attr.aria-label]="('settings.remove' | translate) + ' ' + p.repo"><mat-icon>delete</mat-icon></button>
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
  /** Set by the API's redirect after GitHub: the connection that was just created or installed. */
  readonly connected = input<string>();
  readonly connections = signal<Connection[]>([]);
  readonly profiles = signal<Profile[]>([]);
  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly error = signal<string | undefined>(undefined);
  readonly mode = signal<ConnectMode>(undefined);
  readonly checking = signal<string | undefined>(undefined);
  readonly checks = signal<Record<string, ConnectionCheck>>({});
  appName = 'zenthos';
  owner = '';
  app = { name: '', appId: '', privateKey: '', webhookSecret: '', clientId: '', clientSecret: '' };
  token = { name: '', token: '' };

  readonly setup = computed(() => [
    { key: 'connect', done: this.connections().length > 0 },
    { key: 'install', done: this.connections().some((c) => c.kind === 'github-token' || c.installations.length > 0) },
    { key: 'repo', done: this.profiles().length > 0 },
  ]);
  readonly setupDone = computed(() => this.setup().every((step) => step.done));
  readonly nextStep = computed(() => this.setup().find((step) => !step.done)?.key);

  constructor() {
    void this.refresh();
  }

  async refresh() {
    const [connections, profiles] = await Promise.all([this.settings.connections(), this.settings.profiles()]);
    this.connections.set(connections);
    this.profiles.set(profiles);
    this.loading.set(false);
  }

  toggle(mode: ConnectMode) {
    this.error.set(undefined);
    this.mode.set(this.mode() === mode ? undefined : mode);
  }

  /** A full navigation: GitHub needs the browser itself, and comes back to /settings through the API. */
  createApp() {
    window.location.assign(manifestUrl(this.appName.trim(), this.owner.trim() || undefined));
  }

  async connectApp() {
    const { webhookSecret, clientId, clientSecret, ...required } = this.app;
    const optional = Object.fromEntries(Object.entries({ webhookSecret, clientId, clientSecret }).filter(([, v]) => v.trim()));
    await this.submit(() => this.settings.connectApp({ ...required, ...optional }), () => (this.app = { name: '', appId: '', privateKey: '', webhookSecret: '', clientId: '', clientSecret: '' }));
  }

  async connectToken() {
    await this.submit(() => this.settings.connectToken(this.token), () => (this.token = { name: '', token: '' }));
  }

  async check(connection: Connection) {
    this.checking.set(connection.id);
    const result = await this.settings.check(connection.id);
    this.checking.set(undefined);
    if (!result) return;
    this.checks.update((all) => ({ ...all, [connection.id]: result }));
    // the check refreshed an app's installations; show what GitHub listed
    if (result.ok && connection.kind === 'github-app') await this.refresh();
  }

  async removeConnection(connection: Connection) {
    if (!confirm(this.translate.instant('settings.confirmRemoveConnection', { name: connection.name }))) return;
    await this.settings.removeConnection(connection.id);
    await this.refresh();
  }

  async removeProfile(profile: Profile) {
    if (!confirm(this.translate.instant('settings.confirmRemoveRepo', { repo: profile.repo }))) return;
    await this.settings.removeProfile(profile.repo);
    await this.refresh();
  }

  connectionName(profile: Profile) {
    if (!profile.connectionId) return this.translate.instant('settings.environment');
    return this.connections().find((c) => c.id === profile.connectionId)?.name ?? this.translate.instant('settings.missingConnection');
  }

  coverage(profile: Profile) {
    const connection = this.connections().find((c) => c.id === profile.connectionId);
    return connection ? coversRepository(connection, profile.repo) : undefined;
  }

  /** Clears the form only when the API accepted it; a refusal (GitHub said no) stays on screen. */
  private async submit(call: () => Promise<string | undefined>, reset: () => void) {
    this.busy.set(true);
    this.error.set(undefined);
    const failure = await call();
    this.busy.set(false);
    if (failure) return this.error.set(failure);
    reset();
    this.mode.set(undefined);
    await this.refresh();
  }
}
