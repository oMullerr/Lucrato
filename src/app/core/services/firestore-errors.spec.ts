import { firestoreErrorMessage, isChunkLoadError } from './firestore-errors';

describe('firestoreErrorMessage', () => {
  it.each([
    ['permission-denied', 'Você não tem permissão para acessar estes dados. Faça login novamente.'],
    ['unauthenticated', 'Sua sessão expirou. Faça login novamente.'],
    ['unavailable', 'Servidor temporariamente indisponível. Tentando reconectar…'],
    ['resource-exhausted', 'Limite de uso atingido. Aguarde alguns instantes e tente novamente.'],
    ['failed-precondition', 'Cache local indisponível. Recarregue a página.'],
    ['deadline-exceeded', 'A conexão está lenta. Tentando novamente…'],
    ['cancelled', 'Operação cancelada.'],
    ['not-found', 'Registro não encontrado no servidor.'],
    ['aborted', 'Erro interno do servidor. Tente novamente em instantes.'],
    ['internal', 'Erro interno do servidor. Tente novamente em instantes.'],
    ['data-loss', 'Erro interno do servidor. Tente novamente em instantes.'],
  ])('mapeia code "%s" para a mensagem correta', (code, expected) => {
    expect(firestoreErrorMessage({ code })).toBe(expected);
  });

  it('retorna mensagem padrão para code desconhecido', () => {
    expect(firestoreErrorMessage({ code: 'algum-codigo-novo' }))
      .toBe('Erro ao sincronizar dados. Verifique sua conexão.');
  });

  it('retorna mensagem padrão para undefined', () => {
    expect(firestoreErrorMessage(undefined))
      .toBe('Erro ao sincronizar dados. Verifique sua conexão.');
  });

  it('retorna mensagem padrão para null', () => {
    expect(firestoreErrorMessage(null))
      .toBe('Erro ao sincronizar dados. Verifique sua conexão.');
  });

  it('retorna mensagem padrão para objeto sem .code', () => {
    expect(firestoreErrorMessage({ message: 'algo deu errado' }))
      .toBe('Erro ao sincronizar dados. Verifique sua conexão.');
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
