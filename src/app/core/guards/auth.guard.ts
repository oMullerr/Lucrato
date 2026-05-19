import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { toObservable } from '@angular/core/rxjs-interop';
import { filter, map, take } from 'rxjs';
import { AuthService } from '../services/auth.service';

/** Allows access only when logged in; redirects to /login otherwise. Waits for Firebase auth to resolve. */
export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  return toObservable(auth.currentUser).pipe(
    filter(u => u !== undefined),
    take(1),
    map(u => (u ? true : router.createUrlTree(['/login']))),
  );
};

/** Allows access only when logged out; redirects to /inventory if already logged in. */
export const guestGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  return toObservable(auth.currentUser).pipe(
    filter(u => u !== undefined),
    take(1),
    map(u => (u ? router.createUrlTree(['/inventory']) : true)),
  );
};
