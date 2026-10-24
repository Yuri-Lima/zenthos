import { Component, inject, input } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { TranslateModule } from '@ngx-translate/core';
import { signInUrl } from '../core/api';
import { SessionService } from '../core/session';

@Component({
  selector: 'zen-sign-in-page',
  imports: [TranslateModule, MatButtonModule, MatIconModule],
  template: `
    <section class="zen-card max-w-md mx-auto mt-16 p-8 flex flex-col gap-4 items-start">
      <h1 class="text-xl font-semibold m-0">{{ 'signIn.title' | translate }}</h1>
      <p class="text-slate-500 m-0">{{ 'signIn.body' | translate }}</p>
      <a mat-flat-button [href]="url"><mat-icon>login</mat-icon>{{ 'signIn.button' | translate }}</a>
      <p class="text-sm text-slate-500 m-0">{{ 'signIn.afterwards' | translate }}</p>
    </section>
  `,
})
export class SignInPage {
  readonly session = inject(SessionService);
  readonly returnTo = input<string>('/');
  get url() {
    return signInUrl(this.returnTo());
  }
}
