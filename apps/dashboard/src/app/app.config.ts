import { provideHttpClient } from '@angular/common/http';
import { ApplicationConfig, inject, provideAppInitializer, provideBrowserGlobalErrorListeners, provideZonelessChangeDetection } from '@angular/core';
import { MatIconRegistry } from '@angular/material/icon';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { provideTranslateHttpLoader } from '@ngx-translate/http-loader';
import { appRoutes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    provideRouter(appRoutes, withComponentInputBinding()),
    provideHttpClient(),
    // No Angular animations provider: Angular Material 22 animates with CSS and does not depend on @angular/animations.
    // The icon font linked in index.html is Material Symbols; mat-icon defaults to the older Material Icons class.
    provideAppInitializer(() => {
      inject(MatIconRegistry).setDefaultFontSetClass('material-symbols-outlined');
    }),
    // English and Portuguese from JSON under public/i18n; the browser's language picks the first one.
    provideTranslateService({ loader: provideTranslateHttpLoader({ prefix: '/i18n/', suffix: '.json' }), fallbackLang: 'en', lang: navigator.language.startsWith('pt') ? 'pt' : 'en' }),
  ],
};
