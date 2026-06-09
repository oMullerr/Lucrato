import { firestoreErrorMessage, isChunkLoadError } from './firestore-errors';

describe('firestoreErrorMessage', () => {
  it.each([
    ['permission-denied', 'errors.permissionDenied'],
    ['unauthenticated', 'errors.unauthenticated'],
    ['unavailable', 'errors.unavailable'],
    ['resource-exhausted', 'errors.resourceExhausted'],
    ['failed-precondition', 'errors.failedPrecondition'],
    ['deadline-exceeded', 'errors.deadlineExceeded'],
    ['cancelled', 'errors.cancelled'],
    ['not-found', 'errors.notFound'],
    ['aborted', 'errors.internal'],
    ['internal', 'errors.internal'],
    ['data-loss', 'errors.internal'],
  ])('mapeia code "%s" para a chave i18n correta', (code, expected) => {
    expect(firestoreErrorMessage({ code })).toBe(expected);
  });

  it('retorna chave padrão para code desconhecido', () => {
    expect(firestoreErrorMessage({ code: 'algum-codigo-novo' })).toBe('errors.sync');
  });

  it('retorna chave padrão para undefined', () => {
    expect(firestoreErrorMessage(undefined)).toBe('errors.sync');
  });

  it('retorna chave padrão para null', () => {
    expect(firestoreErrorMessage(null)).toBe('errors.sync');
  });

  it('retorna chave padrão para objeto sem .code', () => {
    expect(firestoreErrorMessage({ message: 'algo deu errado' })).toBe('errors.sync');
  });
});

describe('isChunkLoadError', () => {
  it('retorna false para null', () => {
    expect(isChunkLoadError(null)).toBe(false);
  });

  it('retorna false para undefined', () => {
    expect(isChunkLoadError(undefined)).toBe(false);
  });

  it('retorna true quando name = "ChunkLoadError"', () => {
    expect(isChunkLoadError({ name: 'ChunkLoadError' })).toBe(true);
  });

  it('retorna true para mensagem "Loading chunk abc failed"', () => {
    expect(isChunkLoadError({ message: 'Loading chunk vendor failed' })).toBe(true);
  });

  it('retorna true para "Failed to fetch dynamically imported module"', () => {
    expect(isChunkLoadError({
      message: 'Failed to fetch dynamically imported module: /chunks/a.js',
    })).toBe(true);
  });

  it('retorna true para "error loading dynamically imported module"', () => {
    expect(isChunkLoadError({
      message: 'error loading dynamically imported module',
    })).toBe(true);
  });

  it('é case-insensitive para padrões de mensagem', () => {
    expect(isChunkLoadError({ message: 'LOADING CHUNK xyz FAILED' })).toBe(true);
  });

  it('retorna false para erro genérico', () => {
    expect(isChunkLoadError(new Error('Network error'))).toBe(false);
  });

  it('retorna false para objeto sem name nem message', () => {
    expect(isChunkLoadError({})).toBe(false);
  });
});
