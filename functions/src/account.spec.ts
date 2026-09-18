/**
 * Exclusão de conta.
 *
 * O que se prova aqui não é "apaga" — é a ORDEM e a recusa. Até setembro/2026 a
 * exclusão acontecia no navegador e deixava `users/{uid}/secret/ml` e
 * `mlIndex/{mlUserId}` de pé: refresh token vivo, renovado pelo poller a cada
 * quinze minutos, sem nenhuma conta capaz de desconectá-lo, porque as rules
 * negam esse caminho ao cliente.
 *
 * Daí os três invariantes testados:
 *   1. a conexão do ML sai PRIMEIRO (é a única com consequência contínua);
 *   2. o usuário do Auth sai POR ÚLTIMO (senão sobram dados sem dono);
 *   3. falha ao desconectar ABORTA tudo (melhor não excluir que excluir pela
 *      metade deixando o token órfão).
 */
const apagarConexao = jest.fn();
const recursiveDelete = jest.fn();
const deleteUser = jest.fn();

jest.mock('./ml/tokens', () => ({ apagarConexao: (...a: unknown[]) => apagarConexao(...a) }));
jest.mock('firebase-admin/firestore', () => ({
  getFirestore: () => ({
    recursiveDelete: (...a: unknown[]) => recursiveDelete(...a),
    collection: (p: string) => ({ __tipo: 'collection', path: p }),
    doc: (p: string) => ({ __tipo: 'doc', path: p }),
  }),
}));
jest.mock('firebase-admin/auth', () => ({
  getAuth: () => ({ deleteUser: (...a: unknown[]) => deleteUser(...a) }),
}));
jest.mock('firebase-functions/v2', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

/* `onCall` devolve o handler cru, para o teste chamá-lo direto. */
jest.mock('firebase-functions/v2/https', () => {
  class HttpsError extends Error {
    constructor(readonly code: string, message: string) {
      super(message);
    }
  }
  return {
    HttpsError,
    onCall: (_opts: unknown, handler: unknown) => handler,
  };
});

import { HttpsError } from 'firebase-functions/v2/https';
import { deleteAccount } from './account';

type Handler = (req: unknown) => Promise<{ ok: true }>;
const chamar = deleteAccount as unknown as Handler;

/** Pedido de um dono que acabou de confirmar a senha. */
function pedido(over: Record<string, unknown> = {}) {
  return {
    auth: {
      uid: 'u1',
      token: { auth_time: Math.floor(Date.now() / 1000) - 5 },
      ...over,
    },
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  apagarConexao.mockResolvedValue(123456);
  recursiveDelete.mockResolvedValue(undefined);
  deleteUser.mockResolvedValue(undefined);
});

describe('porteiro', () => {
  it('sem login, recusa', async () => {
    await expect(chamar({ auth: null })).rejects.toMatchObject({ code: 'unauthenticated' });
  });

  it('login antigo demais recusa: sessao aberta nao prova que o dono esta aqui', async () => {
    const velho = { token: { auth_time: Math.floor(Date.now() / 1000) - 3600 } };
    await expect(chamar(pedido(velho))).rejects.toMatchObject({ code: 'failed-precondition' });
    expect(apagarConexao).not.toHaveBeenCalled();
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it('token sem auth_time recusa, em vez de assumir que esta fresco', async () => {
    await expect(chamar(pedido({ token: {} }))).rejects.toMatchObject({
      code: 'failed-precondition',
    });
  });

  it('login recente passa', async () => {
    await expect(chamar(pedido())).resolves.toEqual({ ok: true });
  });
});

describe('ordem das operacoes', () => {
  it('a conexao do ML sai antes de qualquer apagamento', async () => {
    const ordem: string[] = [];
    apagarConexao.mockImplementation(async () => { ordem.push('ml'); return 1; });
    recursiveDelete.mockImplementation(async () => { ordem.push('dados'); });
    deleteUser.mockImplementation(async () => { ordem.push('auth'); });

    await chamar(pedido());

    expect(ordem[0]).toBe('ml');
  });

  it('o usuario do Auth sai por ultimo', async () => {
    const ordem: string[] = [];
    apagarConexao.mockImplementation(async () => { ordem.push('ml'); return 1; });
    recursiveDelete.mockImplementation(async () => { ordem.push('dados'); });
    deleteUser.mockImplementation(async () => { ordem.push('auth'); });

    await chamar(pedido());

    expect(ordem[ordem.length - 1]).toBe('auth');
  });

  it('varre todas as colecoes do usuario, nao so o db/main', async () => {
    await chamar(pedido());

    const caminhos = recursiveDelete.mock.calls.map(c => (c[0] as { path: string }).path);
    // As que guardavam dado financeiro ou credencial precisam estar todas aqui.
    for (const esperada of [
      'users/u1/db',
      'users/u1/secret',
      'users/u1/mlItems',
      'users/u1/mlLinks',
      'users/u1/mlInbox',
      'users/u1/mlReturns',
      'users/u1/mlBilling',
      'users/u1/mlPayouts',
      'users/u1/mlOrders',
    ]) {
      expect(caminhos).toContain(esperada);
    }
    // E o proprio documento do usuario.
    expect(caminhos).toContain('users/u1');
  });
});

describe('falha no meio', () => {
  it('nao desconectou do ML: aborta sem excluir nada', async () => {
    // Excluir a conta do Auth aqui deixaria o refresh token vivo e SEM CURA:
    // nao havendo mais conta, nao ha como chamar mlDisconnect nunca mais.
    apagarConexao.mockRejectedValue(new Error('firestore fora do ar'));

    await expect(chamar(pedido())).rejects.toBeInstanceOf(HttpsError);
    expect(recursiveDelete).not.toHaveBeenCalled();
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it('conta sem ML conectado continua excluindo normalmente', async () => {
    apagarConexao.mockResolvedValue(0);
    await expect(chamar(pedido())).resolves.toEqual({ ok: true });
    expect(deleteUser).toHaveBeenCalledWith('u1');
  });
});
