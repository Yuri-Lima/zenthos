import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatToolbarModule } from '@angular/material/toolbar';
import { RouterLink, RouterOutlet } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { SessionService } from './core/session';

@Component({
  selector: 'zen-root',
  imports: [RouterOutlet, RouterLink, TranslateModule, MatToolbarModule, MatButtonModule, MatIconModule],
  template: `
    <mat-toolbar class="!bg-white border-b border-slate-200 gap-3">
      <a routerLink="/" class="font-semibold tracking-tight text-lg no-underline">ZenthOs</a>
      <span class="text-slate-500 text-sm font-normal">{{ 'app.tagline' | translate }}</span>
      <span class="flex-1"></span>
      <button mat-button (click)="toggleLanguage()">{{ translate.getCurrentLang() === 'pt' ? 'EN' : 'PT' }}</button>
      @if (session.user(); as user) {
        @if (!user.anonymous) {
          <span class="text-sm font-normal">{{ user.login }}</span>
          <button mat-icon-button (click)="logout()" [attr.aria-label]="'app.signOut' | translate"><mat-icon>logout</mat-icon></button>
        } @else {
          <span class="text-sm font-normal text-slate-500">{{ 'app.anonymous' | translate }}</span>
        }
      }
    </mat-toolbar>
    <main class="max-w-6xl mx-auto px-4 py-6">
      <router-outlet />
    </main>
  `,
})
export class App {
  readonly session = inject(SessionService);
  readonly translate = inject(TranslateService);

  toggleLanguage() {
    this.translate.use(this.translate.getCurrentLang() === 'pt' ? 'en' : 'pt');
  }

  async logout() {
    await this.session.logout();
    location.assign('/sign-in');
  }
}
