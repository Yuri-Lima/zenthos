import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { SessionService } from './session';

export const NEW_WORKSPACE_URL = '/workspaces/new';

/**
 * Pages need a session; without one the sign-in page takes over and remembers where to come back to. A signed-in
 * person without a workspace is sent to create one (ADR 019); the dry-run session always has one.
 */
export const authGuard: CanActivateFn = async (_route, state) => {
  const session = inject(SessionService);
  const router = inject(Router);
  const user = session.user() === undefined ? await session.load() : session.user();
  if (!user) return router.createUrlTree(['/sign-in'], { queryParams: { returnTo: state.url } });
  if (!user.anonymous && !user.workspace && !state.url.startsWith(NEW_WORKSPACE_URL)) return router.createUrlTree([NEW_WORKSPACE_URL]);
  return true;
};
