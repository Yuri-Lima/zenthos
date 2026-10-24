import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { RouterLink } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { WORKSPACE_ROLES } from '@zenthos/domain';
import { SessionService } from '../core/session';
import { WorkspacesService, type Member, type Role } from '../core/workspaces';
import { TermLink } from '../shared/term';

/**
 * The members of the current workspace (ADR 019). Owners invite by GitHub login, change roles and remove
 * members; everyone else reads the list. The API keeps the last owner whatever the page asks.
 */
@Component({
  selector: 'zen-members-page',
  imports: [DatePipe, FormsModule, TranslateModule, MatButtonModule, MatFormFieldModule, MatIconModule, MatInputModule, MatSelectModule, RouterLink, TermLink],
  styles: `
    .toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; margin-bottom: 14px; }
    .invite { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; padding: 12px 14px; margin-bottom: 14px; }
    .table { width: 100%; border-collapse: collapse; font-size: 13.5px; }
    .table th { text-align: left; font-weight: 500; color: var(--zen-muted); font-size: 12px; padding: 8px 10px; border-bottom: 1px solid var(--zen-line); }
    .table td { padding: 8px 10px; border-bottom: 1px solid var(--zen-line); vertical-align: middle; }
    .table tr:last-child td { border-bottom: 0; }
    .r { text-align: right; }
    .error { color: var(--zen-crit); font-size: 13px; }
    .role-field { width: 150px; }
  `,
  template: `
    <div class="toolbar">
      <div>
        <div class="eyebrow">{{ session.user()?.workspace?.name }}</div>
        <h1 class="text-lg font-semibold m-0"><zen-term id="setting_role">{{ 'members.title' | translate }}</zen-term></h1>
      </div>
      <span class="flex-1"></span>
      <a mat-stroked-button routerLink="/settings"><mat-icon>tune</mat-icon>{{ 'nav.settings' | translate }}</a>
    </div>

    @if (canManage()) {
      <form class="surface invite" (ngSubmit)="invite()">
        <mat-form-field appearance="outline" subscriptSizing="dynamic" class="w-64">
          <mat-label>{{ 'members.login' | translate }}</mat-label>
          <input matInput name="login" [(ngModel)]="login" required autocomplete="off" />
        </mat-form-field>
        <mat-form-field appearance="outline" subscriptSizing="dynamic" class="role-field">
          <mat-label>{{ 'members.roleLabel' | translate }}</mat-label>
          <mat-select name="role" [(ngModel)]="role">
            @for (r of roles; track r) {<mat-option [value]="r">{{ 'members.role.' + r | translate }}</mat-option>}
          </mat-select>
        </mat-form-field>
        <button mat-flat-button type="submit" [disabled]="busy() || !login.trim()"><mat-icon>person_add</mat-icon>{{ 'members.invite' | translate }}</button>
        <span class="muted text-sm">{{ 'members.inviteHint' | translate }}</span>
      </form>
    }
    @if (error(); as message) {<p class="error" role="alert">{{ message }}</p>}

    <div class="surface overflow-x-auto">
      <table class="table">
        <thead>
          <tr>
            <th>{{ 'members.login' | translate }}</th>
            <th>{{ 'members.roleLabel' | translate }}</th>
            <th>{{ 'members.invitedBy' | translate }}</th>
            <th>{{ 'members.since' | translate }}</th>
            @if (canManage()) {<th class="r"><span class="sr-only">{{ 'settings.actions' | translate }}</span></th>}
          </tr>
        </thead>
        <tbody>
          @for (m of members(); track m.login) {
            <tr>
              <td class="mono">{{ m.login }}</td>
              <td>
                @if (canManage()) {
                  <mat-form-field appearance="outline" subscriptSizing="dynamic" class="role-field">
                    <mat-select [value]="m.role" (selectionChange)="changeRole(m, $event.value)" [aria-label]="('members.roleLabel' | translate) + ' ' + m.login">
                      @for (r of roles; track r) {<mat-option [value]="r">{{ 'members.role.' + r | translate }}</mat-option>}
                    </mat-select>
                  </mat-form-field>
                } @else {{{ 'members.role.' + m.role | translate }}}
              </td>
              <td class="mono muted">{{ m.invitedBy ?? '—' }}</td>
              <td class="muted">{{ m.createdAt | date: 'mediumDate' }}</td>
              @if (canManage()) {
                <td class="r"><button mat-icon-button (click)="remove(m)" [attr.aria-label]="('members.remove' | translate) + ' ' + m.login"><mat-icon>person_remove</mat-icon></button></td>
              }
            </tr>
          } @empty {
            <tr><td colspan="5" class="muted">{{ loading() ? '' : ('members.none' | translate) }}</td></tr>
          }
        </tbody>
      </table>
    </div>
  `,
})
export class MembersPage {
  readonly session = inject(SessionService);
  private readonly workspaces = inject(WorkspacesService);
  readonly roles = WORKSPACE_ROLES;
  readonly members = signal<Member[]>([]);
  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly error = signal<string | undefined>(undefined);
  readonly canManage = computed(() => this.session.can('manage_members'));
  login = '';
  role: Role = 'member';

  constructor() {
    void this.refresh();
  }

  private get workspaceId() {
    return this.session.user()?.workspace?.id;
  }

  async refresh() {
    const id = this.workspaceId ?? (await this.session.load())?.workspace?.id;
    this.members.set(id ? await this.workspaces.members(id) : []);
    this.loading.set(false);
  }

  /** One API call, then the list again; the API's refusal, when there is one, is shown as it came. */
  private async apply(call: (id: string) => Promise<string | undefined>) {
    const id = this.workspaceId;
    if (!id) return;
    this.busy.set(true);
    this.error.set(await call(id));
    await this.refresh();
    this.busy.set(false);
  }

  async invite() {
    const login = this.login.trim();
    await this.apply((id) => this.workspaces.setMember(id, login, this.role));
    if (!this.error()) this.login = '';
  }

  changeRole(member: Member, role: Role) {
    return this.apply((id) => this.workspaces.setMember(id, member.login, role));
  }

  remove(member: Member) {
    return this.apply((id) => this.workspaces.removeMember(id, member.login));
  }
}
