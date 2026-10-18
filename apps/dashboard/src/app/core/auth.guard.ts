import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { SessionService } from './session';

/** Pages need a session; without one the sign-in page takes over and remembers where to come back to. */
export const authGuard: CanActivateFn = async (_route, state) => {
  const session = inject(SessionService);
  const router = inject(Router);
  const user = session.user() === undefined ? await session.load() : session.user();
  return user ? true : router.createUrlTree(['/sign-in'], { queryParams: { returnTo: state.url } });
};
