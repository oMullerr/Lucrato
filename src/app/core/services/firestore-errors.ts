import { FirestoreError } from '@angular/fire/firestore';

/** Returns an i18n key (under `errors.*`) for the given Firestore error.
 *  Callers resolve it with TranslateService at display time. */
export function firestoreErrorMessage(err: unknown): string {
  const code = (err as FirestoreError | undefined)?.code;
  switch (code) {
    case 'permission-denied':
      return 'errors.permissionDenied';
    case 'unauthenticated':
      return 'errors.unauthenticated';
    case 'unavailable':
      return 'errors.unavailable';
    case 'resource-exhausted':
      return 'errors.resourceExhausted';
    case 'failed-precondition':
      return 'errors.failedPrecondition';
    case 'deadline-exceeded':
      return 'errors.deadlineExceeded';
    case 'cancelled':
      return 'errors.cancelled';
    case 'not-found':
      return 'errors.notFound';
    case 'aborted':
    case 'internal':
    case 'data-loss':
      return 'errors.internal';
    default:
      return 'errors.sync';
  }
}

export function isChunkLoadError(err: unknown): boolean {
  if (!err) return false;
  const anyErr = err as { name?: string; message?: string };
  const name = anyErr.name ?? '';
  const message = anyErr.message ?? '';
  return (
    name === 'ChunkLoadError' ||
    /Loading chunk \S+ failed/i.test(message) ||
    /Failed to fetch dynamically imported module/i.test(message) ||
    /error loading dynamically imported module/i.test(message)
  );
}
