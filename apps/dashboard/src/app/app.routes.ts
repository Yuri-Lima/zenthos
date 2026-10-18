import { Route } from '@angular/router';
import { authGuard } from './core/auth.guard';

export const appRoutes: Route[] = [
  { path: 'sign-in', loadComponent: () => import('./pages/sign-in-page').then((m) => m.SignInPage) },
  { path: '', canActivate: [authGuard], loadComponent: () => import('./pages/runs-page').then((m) => m.RunsPage) },
  { path: 'runs/:key', canActivate: [authGuard], loadComponent: () => import('./pages/run-detail-page').then((m) => m.RunDetailPage) },
  { path: 'settings', canActivate: [authGuard], loadComponent: () => import('./pages/settings-page').then((m) => m.SettingsPage) },
  { path: 'settings/repos/new', canActivate: [authGuard], loadComponent: () => import('./pages/repo-form-page').then((m) => m.RepoFormPage) },
  { path: 'settings/repos/:repo', canActivate: [authGuard], loadComponent: () => import('./pages/repo-form-page').then((m) => m.RepoFormPage) },
  { path: 'glossary', loadComponent: () => import('./pages/glossary-page').then((m) => m.GlossaryPage) },
  { path: '**', redirectTo: '' },
];
