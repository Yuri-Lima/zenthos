import { Component, inject, input, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { signInUrl } from '../core/api';
import { SessionService } from '../core/session';
import { SettingsService, type PlatformStatus } from '../core/settings';

@Component({
  selector: 'zen-sign-in-page',
  imports: [RouterLink, TranslateModule, MatButtonModule, MatIconModule],
  template: `
    <section class="zen-card max-w-md mx-auto mt-16 p-8 flex flex-col gap-4 items-start">
      <h1 class="text-xl font-semibold m-0">{{ 'signIn.title' | translate }}</h1>
      <p class="text-slate-500 m-0">{{ 'signIn.body' | translate }}</p>
      @if (platform()?.configured === false) {
        <p class="text-sm text-slate-500 m-0">{{ 'signIn.notSetUp' | translate }}</p>
        <a mat-stroked-button routerLink="/setup"><mat-icon>construction</mat-icon>{{ 'signIn.setUp' | translate }}</a>
      } @else {
        <a mat-flat-button [href]="url"><mat-icon>login</mat-icon>{{ 'signIn.button' | translate }}</a>
        <p class="text-sm text-slate-500 m-0">{{ 'signIn.afterwards' | translate }}</p>
      }
    </section>
  `,
})
export class SignInPage {
  readonly session = inject(SessionService);
  private readonly settings = inject(SettingsService);
  readonly returnTo = input<string>('/');
  /** Nobody can sign in before the operator set the platform app up; the page says so instead of sending people to a dead end. */
  readonly platform = signal<PlatformStatus | undefined>(undefined);

  constructor() {
    void this.settings.platform().then((status) => this.platform.set(status));
  }

  get url() {
    return signInUrl(this.returnTo());
  }
}
