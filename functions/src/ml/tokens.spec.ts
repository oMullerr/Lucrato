/**
 * Renovação do token do Mercado Livre: quando uma falha derruba a conta.
 *
 * Em 23/09/2026 uma instância do Cloud Run foi recusada pela borda do ML, e
 * `/oauth/token` devolveu uma página HTML em vez de JSON. O código quebrava ao
 * ler o JSON e marcava a conta como "precisa reconectar" — um vendedor
 * desconectado por causa de um IP, com o refresh token provavelmente intacto.
 *
 * A regra que estes testes seguram: SÓ `invalid_grant` derruba a conta. Todo o
 * resto é o mundo falhando, e a próxima rodada tenta de novo sem o vendedor
 * precisar fazer nada.
 */
const mockBanco = new Map<string, Record<string, unknown>>();

function mockFoto(caminho: string) {
  const d = mockBanco.get(caminho);
  return { exists: d !== undefined, data: () => d, get: (k: string) => d?.[k] };
}

function mockGravar(caminho: string, dados: Record<string, unknown>, opts?: { merge?: boolean }) {
  mockBanco.set(caminho, opts?.merge ? { ...(mockBanco.get(caminho) ?? {}), ...dados } : { ...dados });
}

jest.mock('firebase-admin/firestore', () => ({
  getFirestore: () => ({
    doc: (caminho: string) => ({
      path: caminho,
      get: async () => mockFoto(caminho),
      set: async (dados: Record<string, unknown>, opts?: { merge?: boolean }) =>
        mockGravar(caminho, dados, opts),
      delete: async () => void mockBanco.delete(caminho),
    }),
    runTransaction: async <T>(fn: (tx: unknown) => Promise<T>) =>
      fn({
        get: async (ref: { path: string }) => mockFoto(ref.path),
        set: (ref: { path: string }, dados: Record<string, unknown>, opts?: { merge?: boolean }) =>
          mockGravar(ref.path, dados, opts),
      }),
  }),
  Timestamp: { now: () => 'agora' },
}));
jest.mock('firebase-functions/v2', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock('firebase-functions/params', () => ({
  defineSecret: (nome: string) => ({ value: () => nome }),
  defineString: (_nome: string, o?: { default?: string }) => ({ value: () => o?.default ?? '' }),
}));
// Cifra desligada, como em produção hoje: os tokens passam como estão.
jest.mock('./cofre', () => ({
  cifrar: async (t: string) => t,
  decifrar: async (t: string) => t,
}));

import { RenovacaoTransitoria, getValidAccessToken, trocarRefreshToken } from './tokens';

const SEGREDO = 'users/u1/secret/ml';
const PUBLICO = 'users/u1/db/ml';

/** O que a borda do Mercado Livre devolveu às 13:39 de 23/09/2026. */
const PAGINA_DE_BLOQUEIO = '<html>\n  <head><title>403 Forbidden</title></head>\n</html>';

function responder(status: number, corpo: string): void {
  global.fetch = jest.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    text: async () => corpo,
  }) as unknown as typeof fetch;
}

/** Conta conectada com access token vencido: a próxima chamada precisa renovar. */
function contaComTokenVencido(): void {
  mockBanco.set(SEGREDO, {
    accessToken: 'velho',
    refreshToken: 'refresh-guardado',
    expiresAt: 0,
    mlUserId: 42,
    status: 'connected',
  });
  mockBanco.set(PUBLICO, { connected: true, status: 'connected' });
}

const fetchOriginal = global.fetch;
beforeEach(() => mockBanco.clear());
afterAll(() => {
  global.fetch = fetchOriginal;
});

describe('trocarRefreshToken — o que diz que o token morreu', () => {
  it('invalid_grant: morreu de verdade', async () => {
    responder(400, '{"error":"invalid_grant","message":"Error validating grant"}');
    const falha = trocarRefreshToken('r', 'id', 'segredo');

    await expect(falha).rejects.toThrow('refresh_falhou:invalid_grant');
    await expect(falha).rejects.not.toBeInstanceOf(RenovacaoTransitoria);
  });

  it('página HTML da borda: passageiro — é o caso de 23/09/2026', async () => {
    responder(403, PAGINA_DE_BLOQUEIO);
    await expect(trocarRefreshToken('r', 'id', 'segredo')).rejects.toBeInstanceOf(RenovacaoTransitoria);
  });

  it('429 e 5xx: passageiro', async () => {
    responder(429, '{"error":"local_rate_limited"}');
    await expect(trocarRefreshToken('r', 'id', 'segredo')).rejects.toBeInstanceOf(RenovacaoTransitoria);

    responder(503, '{"error":"service_unavailable"}');
    await expect(trocarRefreshToken('r', 'id', 'segredo')).rejects.toBeInstanceOf(RenovacaoTransitoria);
  });

  it('falha de rede: passageiro', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('ECONNRESET')) as unknown as typeof fetch;
    await expect(trocarRefreshToken('r', 'id', 'segredo')).rejects.toBeInstanceOf(RenovacaoTransitoria);
  });

  it('sucesso devolve o par novo', async () => {
    responder(200, '{"access_token":"a2","refresh_token":"r2","expires_in":21600,"user_id":42}');
    await expect(trocarRefreshToken('r', 'id', 'segredo')).resolves.toEqual({
      accessToken: 'a2',
      refreshToken: 'r2',
      expiresIn: 21600,
      mlUserId: 42,
    });
  });
});

describe('getValidAccessToken — a conta só cai quando o token morreu', () => {
  it('bloqueio da borda NÃO desconecta o vendedor, e o refresh token fica guardado', async () => {
    contaComTokenVencido();
    responder(403, PAGINA_DE_BLOQUEIO);

    await expect(getValidAccessToken('u1', 'id', 'segredo')).rejects.toThrow('renovacao_transitoria');

    expect(mockBanco.get(SEGREDO)).toMatchObject({
      status: 'connected',
      refreshToken: 'refresh-guardado',
      refreshLockUntil: 0, // a trava sai, senão a próxima rodada esperaria à toa
    });
    expect(mockBanco.get(PUBLICO)).toMatchObject({ connected: true, status: 'connected' });
  });

  it('a rodada seguinte renova normalmente com o mesmo refresh token', async () => {
    contaComTokenVencido();
    responder(403, PAGINA_DE_BLOQUEIO);
    await expect(getValidAccessToken('u1', 'id', 'segredo')).rejects.toThrow('renovacao_transitoria');

    responder(200, '{"access_token":"a2","refresh_token":"r2","expires_in":21600,"user_id":42}');
    await expect(getValidAccessToken('u1', 'id', 'segredo')).resolves.toBe('a2');

    const corpo = String((global.fetch as jest.Mock).mock.calls[0][1].body);
    expect(corpo).toContain('refresh_token=refresh-guardado');
  });

  it('invalid_grant desconecta, porque aí só o vendedor reconectando resolve', async () => {
    contaComTokenVencido();
    responder(400, '{"error":"invalid_grant"}');

    await expect(getValidAccessToken('u1', 'id', 'segredo')).rejects.toThrow('reconexao_necessaria');

    expect(mockBanco.get(SEGREDO)).toMatchObject({ status: 'reconnect_required' });
    expect(mockBanco.get(PUBLICO)).toMatchObject({
      connected: false,
      status: 'reconnect_required',
      lastError: 'refresh_falhou:invalid_grant',
    });
  });
});
