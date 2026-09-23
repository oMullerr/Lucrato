/**
 * Guarda e rotação dos tokens do Mercado Livre.
 *
 * O `refresh_token` do ML é de USO ÚNICO: cada renovação devolve um novo e
 * invalida o anterior. Duas renovações simultâneas quebrariam a conexão, então
 * a renovação acontece sob um lock em transação — quem não pega o lock espera
 * o vencedor terminar e relê.
 *
 * Os tokens vivem em `users/{uid}/secret/ml`, caminho negado ao navegador pelas
 * security rules. Só o Admin SDK lê.
 */
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';

import { ML_API } from '../config';
import { cifrar, decifrar } from './cofre';

/** Estado da conexão exposto ao app (sem nada sensível). */
export type MlStatus = 'connected' | 'reconnect_required' | 'disconnected';

export interface MlTokens {
  accessToken: string;
  refreshToken: string;
  /** Epoch em ms de quando o access token expira. */
  expiresAt: number;
  mlUserId: number;
  status: MlStatus;
  /** Lock de renovação: epoch em ms até quando outra renovação deve esperar. */
  refreshLockUntil?: number;
}

/** Renova com folga: o token de 6 h é trocado um minuto antes de vencer. */
const MARGEM_MS = 60_000;
const LOCK_MS = 30_000;
const ESPERA_LOCK_MS = 1_000;
const TENTATIVAS_LOCK = 15;

const db = () => getFirestore();
const secretRef = (uid: string) => db().doc(`users/${uid}/secret/ml`);
const publicRef = (uid: string) => db().doc(`users/${uid}/db/ml`);

export async function readTokens(uid: string): Promise<MlTokens | null> {
  const snap = await secretRef(uid).get();
  if (!snap.exists) return null;
  const t = snap.data() as MlTokens;
  return {
    ...t,
    accessToken: await decifrar(t.accessToken ?? ''),
    refreshToken: await decifrar(t.refreshToken ?? ''),
  };
}

/** Grava tokens e espelha no documento público o que o app pode ver. */
export async function saveTokens(
  uid: string,
  tokens: MlTokens,
  publico: Record<string, unknown> = {},
): Promise<void> {
  await secretRef(uid).set(
    {
      ...tokens,
      accessToken: await cifrar(tokens.accessToken),
      refreshToken: await cifrar(tokens.refreshToken),
      updatedAt: Timestamp.now(),
    },
    { merge: true },
  );
  await publicRef(uid).set(
    {
      connected: tokens.status === 'connected',
      status: tokens.status,
      mlUserId: tokens.mlUserId,
      updatedAt: Timestamp.now(),
      ...publico,
    },
    { merge: true },
  );
}

/**
 * Força a próxima chamada a renovar o access token.
 *
 * Usado quando o Mercado Livre devolve 401 antes da expiração prevista — token
 * revogado, senha trocada, sessão derrubada.
 */
export async function invalidarAccessToken(uid: string): Promise<void> {
  await secretRef(uid).set({ expiresAt: 0 }, { merge: true });
}

/**
 * Apaga a conexão com o Mercado Livre: tokens e índice do webhook.
 *
 * Mora aqui, e não dentro do `mlDisconnect`, porque há DOIS caminhos que
 * precisam dela — desconectar a conta e excluir a conta — e o segundo foi
 * esquecido por meses. Enquanto a lógica vivia dentro do callable, excluir a
 * conta deixava `users/{uid}/secret/ml` e `mlIndex/{mlUserId}` de pé: o poller
 * continuava renovando o refresh token e varrendo pedidos de um usuário que não
 * existia mais, e não sobrava jeito de desconectar pelo app, porque as rules
 * negam esse caminho ao navegador.
 *
 * Devolve o `mlUserId` que estava conectado (0 quando não havia conexão), para
 * quem chamou poder registrar no log.
 */
export async function apagarConexao(uid: string): Promise<number> {
  const secret = secretRef(uid);
  const snap = await secret.get();
  const mlUserId = snap.exists ? Number(snap.get('mlUserId')) : 0;

  if (mlUserId) {
    const indice = db().doc(`mlIndex/${mlUserId}`);
    const atual = await indice.get();
    // Só remove o índice se ele ainda aponta para este usuário: uma conta do ML
    // reconectada por outro uid não pode ser desligada por este caminho.
    if (atual.exists && atual.get('uid') === uid) await indice.delete();
  }

  await secret.delete();
  return mlUserId;
}

/** Marca a conta como "precisa reconectar" e conta o motivo ao app. */
export async function marcarReconexao(uid: string, motivo: string): Promise<void> {
  await secretRef(uid).set({ status: 'reconnect_required' }, { merge: true });
  await publicRef(uid).set(
    {
      connected: false,
      status: 'reconnect_required',
      lastError: motivo,
      updatedAt: Timestamp.now(),
    },
    { merge: true },
  );
  logger.warn('Conta do Mercado Livre precisa ser reconectada', { uid, motivo });
}

/**
 * A renovação falhou por um motivo que NÃO diz nada sobre o token.
 *
 * Em 23/09/2026 uma instância do Cloud Run passou a ser recusada pela borda do
 * Mercado Livre: em vez de JSON, `/oauth/token` devolveu uma página HTML de
 * bloqueio. O código lia aquilo como JSON, quebrava, e o `catch` marcava a conta
 * como "precisa reconectar" — derrubando um vendedor por causa de um IP, com o
 * refresh token provavelmente intacto (a requisição nem chegou à API).
 *
 * Só `invalid_grant` diz que o token morreu (inválido, vencido, revogado ou já
 * usado). Página HTML, 403 da borda, 429, 5xx, falha de rede e qualquer outro
 * código de erro são o mundo falhando, não o token — a próxima rodada tenta de
 * novo, e o vendedor não precisa fazer nada.
 */
export class RenovacaoTransitoria extends Error {
  constructor(readonly motivo: string) {
    super(`refresh_transitorio:${motivo}`);
    this.name = 'RenovacaoTransitoria';
  }
}

/** Troca o refresh token por um par novo. Uma chamada, sem retentativa cega. */
export async function trocarRefreshToken(
  refreshToken: string,
  clientId: string,
  clientSecret: string,
): Promise<{ accessToken: string; refreshToken: string; expiresIn: number; mlUserId: number }> {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
  });

  let resposta: Response;
  try {
    resposta = await fetch(`${ML_API}/oauth/token`, {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/x-www-form-urlencoded' },
      body,
    });
  } catch (err) {
    throw new RenovacaoTransitoria(`rede:${String((err as Error)?.message ?? err)}`);
  }

  // Lido como texto antes: a borda do ML responde HTML quando recusa, e
  // `resposta.json()` quebraria com uma mensagem que não explica nada.
  const texto = await resposta.text();
  let dados: Record<string, unknown> | null = null;
  try {
    const lido: unknown = JSON.parse(texto);
    if (lido && typeof lido === 'object') dados = lido as Record<string, unknown>;
  } catch {
    dados = null;
  }

  if (!dados) throw new RenovacaoTransitoria(`${resposta.status}:resposta_nao_json`);

  if (!resposta.ok) {
    const erro = String(dados['error'] ?? '');
    if (erro === 'invalid_grant') throw new Error('refresh_falhou:invalid_grant');
    throw new RenovacaoTransitoria(`${resposta.status}:${erro || 'sem_codigo'}`);
  }

  return {
    accessToken: String(dados['access_token']),
    refreshToken: String(dados['refresh_token']),
    expiresIn: Number(dados['expires_in'] ?? 21_600),
    mlUserId: Number(dados['user_id']),
  };
}

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Devolve um access token válido, renovando se necessário.
 *
 * Lança quando a conta precisa ser reconectada — quem chama deve tratar como
 * "sem integração no momento", nunca insistir.
 */
export async function getValidAccessToken(
  uid: string,
  clientId: string,
  clientSecret: string,
): Promise<string> {
  for (let tentativa = 0; tentativa < TENTATIVAS_LOCK; tentativa++) {
    const agora = Date.now();

    const resultado = await db().runTransaction(async (tx) => {
      const snap = await tx.get(secretRef(uid));
      if (!snap.exists) return { tipo: 'ausente' as const };

      const t = snap.data() as MlTokens;
      if (t.status === 'reconnect_required') return { tipo: 'reconectar' as const };
      /* Os tokens saem da transação COMO ESTÃO no banco, cifrados ou não. A
         chamada ao KMS é rede, e transação do Firestore pode ser reexecutada —
         efeito colateral aí dentro roda mais de uma vez. Decifrar é trabalho
         para depois do commit. */
      if (t.accessToken && t.expiresAt > agora + MARGEM_MS) {
        return { tipo: 'valido' as const, accessToken: t.accessToken };
      }
      if (t.refreshLockUntil && t.refreshLockUntil > agora) {
        return { tipo: 'aguardar' as const };
      }

      tx.set(secretRef(uid), { refreshLockUntil: agora + LOCK_MS }, { merge: true });
      return { tipo: 'renovar' as const, refreshToken: t.refreshToken, mlUserId: t.mlUserId };
    });

    if (resultado.tipo === 'valido') return decifrar(resultado.accessToken);
    if (resultado.tipo === 'ausente') throw new Error('sem_integracao');
    if (resultado.tipo === 'reconectar') throw new Error('reconexao_necessaria');

    if (resultado.tipo === 'aguardar') {
      await dormir(ESPERA_LOCK_MS);
      continue;
    }

    try {
      /* O que sai do lock pode estar cifrado; o Mercado Livre precisa do
         refresh em claro. É aqui que a migração acontece sozinha: o par novo
         volta cifrado logo abaixo, então cada vendedor passa a cifrado na
         primeira renovação — dentro de seis horas, sem script. */
      const novo = await trocarRefreshToken(
        await decifrar(resultado.refreshToken),
        clientId,
        clientSecret,
      );
      await secretRef(uid).set(
        {
          accessToken: await cifrar(novo.accessToken),
          refreshToken: await cifrar(novo.refreshToken),
          expiresAt: Date.now() + novo.expiresIn * 1000,
          mlUserId: novo.mlUserId || resultado.mlUserId,
          status: 'connected' satisfies MlStatus,
          refreshLockUntil: 0,
          updatedAt: Timestamp.now(),
        },
        { merge: true },
      );
      return novo.accessToken;
    } catch (err) {
      await secretRef(uid).set({ refreshLockUntil: 0 }, { merge: true });

      // Falha que não é do token: a conta continua conectada, e a próxima
      // rodada tenta de novo com o MESMO refresh token, que segue guardado.
      if (err instanceof RenovacaoTransitoria) {
        logger.warn('Renovação do token falhou por motivo passageiro; tenta na próxima rodada', {
          uid,
          motivo: err.motivo,
        });
        throw new Error('renovacao_transitoria');
      }

      // `invalid_grant`: o refresh de uso único já foi consumido ou revogado.
      // Insistir só piora — só o vendedor reconectando resolve.
      await marcarReconexao(uid, String((err as Error).message));
      throw new Error('reconexao_necessaria');
    }
  }

  throw new Error('renovacao_em_andamento');
}
