import { FirestoreError } from '@angular/fire/firestore';

export function firestoreErrorMessage(err: unknown): string {
  const code = (err as FirestoreError | undefined)?.code;
  switch (code) {
    case 'permission-denied':
      return 'Você não tem permissão para acessar estes dados. Faça login novamente.';
    case 'unauthenticated':
      return 'Sua sessão expirou. Faça login novamente.';
    case 'unavailable':
      return 'Servidor temporariamente indisponível. Tentando reconectar…';
    case 'resource-exhausted':
      return 'Limite de uso atingido. Aguarde alguns instantes e tente novamente.';
    case 'failed-precondition':
      return 'Cache local indisponível. Recarregue a página.';
    case 'deadline-exceeded':
      return 'A conexão está lenta. Tentando novamente…';
    case 'cancelled':
      return 'Operação cancelada.';
    case 'not-found':
      return 'Registro não encontrado no servidor.';
    case 'aborted':
    case 'internal':
    case 'data-loss':
      return 'Erro interno do servidor. Tente novamente em instantes.';
    default:
      return 'Erro ao sincronizar dados. Verifique sua conexão.';
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
