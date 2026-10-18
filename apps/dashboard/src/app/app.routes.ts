import { Route } from '@angular/router';
import { authGuard } from './core/auth.guard';

export const appRoutes: Route[] = [
  { path: 'sign-in', loadComponent: () => import('./pages/sign-in-page').then((m) => m.SignInPage) },
  { path: '', canActivate: [authGuard], loadComponent: () => import('./pages/runs-page').then((m) => m.RunsPage) },
  { path: 'runs/:key', canActivate: [authGuard], loadComponent: () => import('./pages/run-detail-page').then((m) => m.RunDetailPage) },
  { path: '**', redirectTo: '' },
];
