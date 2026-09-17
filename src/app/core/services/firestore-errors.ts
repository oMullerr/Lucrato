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

/**
 * Transição de rota (View Transitions API) que o browser pulou.
 *
 * `withViewTransitions()` rejeita quando a transição é abortada — navegação em
 * cima de navegação, aba em segundo plano, documento oculto. É cosmético: a
 * navegação acontece do mesmo jeito, só sem a animação.
 *
 * Precisa ser reconhecido porque chega ao `GlobalErrorHandler` como rejeição
 * não tratada, e ali custava caro dos dois lados: um toast de "erro inesperado"
 * para o usuário, por uma animação que não rodou, e uma das SÓ CINCO vagas de
 * reporte por sessão — calando o erro de verdade, que é justamente o que o
 * reporte existe para não deixar passar.
 *
 * O casamento exige nome E menção a transição: `InvalidStateError` sozinho é
 * comum em IndexedDB e não pode ser engolido junto.
 */
export function isViewTransitionAbort(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const anyErr = err as { name?: unknown; message?: unknown };
  const name = typeof anyErr.name === 'string' ? anyErr.name : '';
  const message = typeof anyErr.message === 'string' ? anyErr.message : '';
  return (name === 'AbortError' || name === 'InvalidStateError') && /transition/i.test(message);
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
