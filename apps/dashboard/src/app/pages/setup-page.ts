import { Component, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { RouterLink } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { setupManifestAction } from '../core/api';
import { SettingsService, type PlatformStatus } from '../core/settings';

/**
 * The operator's one-time setup of the platform GitHub App (ADR 019). Nobody can sign in before it exists, so the
 * page is public and the API asks for the setup token it printed at boot instead. The form posts to the API as a
 * plain browser form (ngNoForm): the API answers with the page that sends the manifest to GitHub, and GitHub brings
 * the operator back to the dashboard once the app exists.
 */
@Component({
  selector: 'zen-setup-page',
  imports: [RouterLink, TranslateModule, MatButtonModule, MatFormFieldModule, MatIconModule, MatInputModule],
  template: `
    <section class="zen-card max-w-lg mx-auto mt-16 p-8 flex flex-col gap-4 items-start">
      <div class="eyebrow">{{ 'setupPage.eyebrow' | translate }}</div>
      <h1 class="text-xl font-semibold m-0">{{ 'setupPage.title' | translate }}</h1>
      @if (status()?.configured) {
        <p class="text-slate-500 m-0">{{ 'setupPage.done' | translate: { slug: status()?.slug } }}</p>
        <a mat-flat-button routerLink="/"><mat-icon>arrow_forward</mat-icon>{{ 'setupPage.toDashboard' | translate }}</a>
      } @else if (status()) {
        <p class="text-slate-500 m-0">{{ 'setupPage.body' | translate }}</p>
        <form ngNoForm method="post" [attr.action]="action" class="flex flex-col gap-3 w-full">
          <mat-form-field appearance="outline" subscriptSizing="dynamic">
            <mat-label>{{ 'setupPage.token' | translate }}</mat-label>
            <input matInput type="password" name="token" required autocomplete="off" />
            <mat-hint>{{ 'setupPage.tokenHint' | translate }}</mat-hint>
          </mat-form-field>
          <mat-form-field appearance="outline" subscriptSizing="dynamic">
            <mat-label>{{ 'setupPage.name' | translate }}</mat-label>
            <input matInput name="name" value="zenthos" required autocomplete="off" />
          </mat-form-field>
          <mat-form-field appearance="outline" subscriptSizing="dynamic">
            <mat-label>{{ 'setupPage.owner' | translate }}</mat-label>
            <input matInput name="owner" autocomplete="off" />
            <mat-hint>{{ 'setupPage.ownerHint' | translate }}</mat-hint>
          </mat-form-field>
          <div><button mat-flat-button type="submit"><mat-icon>open_in_new</mat-icon>{{ 'setupPage.continue' | translate }}</button></div>
        </form>
      }
    </section>
  `,
})
export class SetupPage {
  private readonly settings = inject(SettingsService);
  readonly status = signal<PlatformStatus | undefined>(undefined);
  readonly action = setupManifestAction();

  constructor() {
    void this.settings.platform().then((status) => this.status.set(status));
  }
}
