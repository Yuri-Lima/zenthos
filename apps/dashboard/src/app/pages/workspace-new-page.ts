import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { Router } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { SessionService } from '../core/session';
import { WorkspacesService } from '../core/workspaces';

/** The first thing a new person does (ADR 019): name a workspace. They own it, and the session moves into it. */
@Component({
  selector: 'zen-workspace-new-page',
  imports: [FormsModule, TranslateModule, MatButtonModule, MatFormFieldModule, MatIconModule, MatInputModule],
  template: `
    <form class="zen-card max-w-md mx-auto mt-16 p-8 flex flex-col gap-4 items-start" (ngSubmit)="create()">
      <div class="eyebrow">{{ 'workspaceNew.eyebrow' | translate }}</div>
      <h1 class="text-xl font-semibold m-0">{{ (session.user()?.workspace ? 'workspaceNew.titleAnother' : 'workspaceNew.title') | translate }}</h1>
      <p class="text-slate-500 m-0">{{ 'workspaceNew.body' | translate }}</p>
      <mat-form-field appearance="outline" subscriptSizing="dynamic" class="w-full">
        <mat-label>{{ 'workspaceNew.name' | translate }}</mat-label>
        <input matInput name="name" [(ngModel)]="name" required maxlength="60" autocomplete="organization" />
      </mat-form-field>
      @if (error(); as message) {<p class="text-sm m-0" style="color: var(--zen-crit)" role="alert">{{ message }}</p>}
      <button mat-flat-button type="submit" [disabled]="busy() || !name.trim()"><mat-icon>add</mat-icon>{{ 'workspaceNew.create' | translate }}</button>
    </form>
  `,
})
export class WorkspaceNewPage {
  readonly session = inject(SessionService);
  private readonly workspaces = inject(WorkspacesService);
  private readonly router = inject(Router);
  readonly busy = signal(false);
  readonly error = signal<string | undefined>(undefined);
  name = '';

  async create() {
    this.busy.set(true);
    this.error.set(undefined);
    const failure = await this.workspaces.create(this.name.trim());
    if (failure) {
      this.error.set(failure);
      this.busy.set(false);
      return;
    }
    await this.session.load();
    await this.router.navigateByUrl('/');
  }
}
