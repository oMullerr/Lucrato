import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { toObservable } from '@angular/core/rxjs-interop';
import { catchError, filter, map, of, take, timeout } from 'rxjs';
import { TranslateService } from '@ngx-translate/core';
import { AuthService } from '../services/auth.service';
import { NotifyService } from '../services/notify.service';

const AUTH_TIMEOUT_MS = 8000;

/**
 * Allows access only when logged in AND e-mail verified.
 * Logged-out → /login. Logged-in but unverified → /verify-email.
 * Waits for Firebase auth to resolve before deciding.
 */
export const authGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const notify = inject(NotifyService);
  const t = inject(TranslateService);

  return toObservable(auth.currentUser).pipe(
    filter(u => u !== undefined),
    take(1),
    timeout(AUTH_TIMEOUT_MS),
    map(u => {
      if (!u) return router.createUrlTree(['/login']);
      if (!u.emailVerified && !state.url.startsWith('/verify-email')) {
        return router.createUrlTree(['/verify-email']);
      }
      return true;
    }),
    catchError(() => {
      notify.warning(t.instant('auth.authTimeout'));
      return of(router.createUrlTree(['/login']));
    }),
  );
};

/**
 * Allows access only when the user is logged in but NOT yet verified.
 * Routes verified users away from the verify-email page.
 */
export const verifyEmailGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const notify = inject(NotifyService);
  const t = inject(TranslateService);

  return toObservable(auth.currentUser).pipe(
    filter(u => u !== undefined),
    take(1),
    timeout(AUTH_TIMEOUT_MS),
    map(u => {
      if (!u) return router.createUrlTree(['/login']);
      if (u.emailVerified) return router.createUrlTree(['/inventory']);
      return true;
    }),
    catchError(() => {
      notify.warning(t.instant('auth.authTimeout'));
      return of(router.createUrlTree(['/login']));
    }),
  );
};

/** Allows access only when logged out; redirects to /inventory if already logged in. */
export const guestGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  return toObservable(auth.currentUser).pipe(
    filter(u => u !== undefined),
    take(1),
    timeout(AUTH_TIMEOUT_MS),
    map(u => (u ? router.createUrlTree(['/inventory']) : true)),
    catchError(() => of(true)),
  );
};
