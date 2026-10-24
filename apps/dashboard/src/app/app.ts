import { Component, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { SessionService } from './core/session';
import { WorkspacesService, type MyWorkspace } from './core/workspaces';

@Component({
  selector: 'zen-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, TranslateModule, MatButtonModule, MatIconModule, MatMenuModule, MatTooltipModule],
  styles: `
    .shell { display: grid; grid-template-columns: 200px 1fr; min-height: 100%; }
    .rail { border-right: 1px solid var(--zen-line); background: var(--zen-surface); padding: 12px 10px; display: flex; flex-direction: column; gap: 4px; position: sticky; top: 0; height: 100dvh; }
    .brand { display: flex; align-items: baseline; gap: 8px; padding: 6px 8px 14px; }
    .brand b { font-size: 15px; letter-spacing: -0.01em; }
    .nav { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border-radius: var(--zen-radius); color: var(--zen-fg); text-decoration: none; font-size: 13.5px; }
    .nav:hover { background: var(--zen-surface-2); }
    .nav.active { background: var(--zen-accent-soft); color: var(--zen-accent); font-weight: 500; }
    .nav mat-icon { font-size: 20px; width: 20px; height: 20px; }
    .rail hr { border: 0; border-top: 1px solid var(--zen-line); margin: 8px 4px; }
    .topbar { display: flex; align-items: center; gap: 10px; padding: 8px 20px; border-bottom: 1px solid var(--zen-line); background: var(--zen-surface); position: sticky; top: 0; z-index: 2; min-height: 48px; }
    .user { display: flex; align-items: center; gap: 8px; font-size: 13px; }
    .user img { width: 22px; height: 22px; border-radius: 50%; }
    .workspace { font-weight: 500; }
    .workspace mat-icon:last-child { margin: 0 -4px 0 2px; }
    .role { color: var(--zen-muted); font-size: 12px; margin-left: 8px; }
    @media (max-width: 760px) { .shell { grid-template-columns: 1fr; } .rail { display: none; } }
  `,
  template: `
    <div class="shell">
      <nav class="rail" aria-label="Sections">
        <a routerLink="/" class="brand"><b>ZenthOs</b><span class="eyebrow">lab</span></a>
        <a routerLink="/" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: true }" class="nav"><mat-icon>view_timeline</mat-icon>{{ 'nav.runs' | translate }}</a>
        <a routerLink="/metrics" routerLinkActive="active" class="nav"><mat-icon>monitoring</mat-icon>{{ 'nav.metrics' | translate }}</a>
        <a routerLink="/settings" routerLinkActive="active" class="nav"><mat-icon>tune</mat-icon>{{ 'nav.settings' | translate }}</a>
        <hr />
        <a routerLink="/glossary" routerLinkActive="active" class="nav"><mat-icon>menu_book</mat-icon>{{ 'nav.glossary' | translate }}</a>
      </nav>
      <div class="min-w-0">
        <header class="topbar">
          @if (session.user()?.workspace; as workspace) {
            <button mat-button class="workspace" [matMenuTriggerFor]="workspaceMenu" (menuOpened)="loadWorkspaces()" [attr.aria-label]="'app.switchWorkspace' | translate"><mat-icon>workspaces</mat-icon>{{ workspace.name }}<mat-icon>expand_more</mat-icon></button>
            <mat-menu #workspaceMenu="matMenu">
              @for (w of workspaces(); track w.id) {
                <button mat-menu-item (click)="select(w)" [disabled]="w.current">{{ w.name }}<span class="role">{{ 'members.role.' + w.role | translate }}</span></button>
              }
              @if (!session.user()?.anonymous) {<a mat-menu-item routerLink="/workspaces/new"><mat-icon>add</mat-icon>{{ 'app.newWorkspace' | translate }}</a>}
            </mat-menu>
          } @else {
            <span class="muted text-sm">{{ 'app.tagline' | translate }}</span>
          }
          <span class="flex-1"></span>
          <button mat-button (click)="toggleLanguage()" [attr.aria-label]="'app.language' | translate">{{ translate.getCurrentLang() === 'pt' ? 'EN' : 'PT' }}</button>
          @if (session.user(); as user) {
            @if (!user.anonymous) {
              <span class="user">@if (user.avatarUrl) {<img [src]="user.avatarUrl" alt="" />}<span class="mono">{{ user.login }}</span></span>
              <button mat-icon-button (click)="logout()" [attr.aria-label]="'app.signOut' | translate" [matTooltip]="'app.signOut' | translate"><mat-icon>logout</mat-icon></button>
            } @else {
              <span class="zen-chip warn"><mat-icon aria-hidden="true">lock_open</mat-icon>{{ 'app.anonymous' | translate }}</span>
            }
          }
        </header>
        <main class="px-5 py-5 max-w-[1280px]">
          <router-outlet />
        </main>
      </div>
    </div>
  `,
})
export class App {
  readonly session = inject(SessionService);
  readonly translate = inject(TranslateService);
  private readonly workspaceApi = inject(WorkspacesService);
  readonly workspaces = signal<MyWorkspace[]>([]);

  async loadWorkspaces() {
    this.workspaces.set(await this.workspaceApi.mine());
  }

  /** Every page shows one workspace's data, so switching reloads the app in the new one. */
  async select(workspace: MyWorkspace) {
    if (!(await this.workspaceApi.select(workspace.id))) location.assign('/');
  }

  toggleLanguage() {
    this.translate.use(this.translate.getCurrentLang() === 'pt' ? 'en' : 'pt');
  }

  async logout() {
    await this.session.logout();
    location.assign('/sign-in');
  }
}
