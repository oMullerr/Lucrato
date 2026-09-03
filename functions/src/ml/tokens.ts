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
  return snap.exists ? (snap.data() as MlTokens) : null;
}

/** Grava tokens e espelha no documento público o que o app pode ver. */
export async function saveTokens(
  uid: string,
  tokens: MlTokens,
  publico: Record<string, unknown> = {},
): Promise<void> {
  await secretRef(uid).set({ ...tokens, updatedAt: Timestamp.now() }, { merge: true });
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

  const resposta = await fetch(`${ML_API}/oauth/token`, {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });

  const dados = (await resposta.json()) as Record<string, unknown>;
  if (!resposta.ok) {
    const erro = String(dados['error'] ?? resposta.status);
    throw new Error(`refresh_falhou:${erro}`);
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
      if (t.accessToken && t.expiresAt > agora + MARGEM_MS) {
        return { tipo: 'valido' as const, accessToken: t.accessToken };
      }
      if (t.refreshLockUntil && t.refreshLockUntil > agora) {
        return { tipo: 'aguardar' as const };
      }

      tx.set(secretRef(uid), { refreshLockUntil: agora + LOCK_MS }, { merge: true });
      return { tipo: 'renovar' as const, refreshToken: t.refreshToken, mlUserId: t.mlUserId };
    });

    if (resultado.tipo === 'valido') return resultado.accessToken;
    if (resultado.tipo === 'ausente') throw new Error('sem_integracao');
    if (resultado.tipo === 'reconectar') throw new Error('reconexao_necessaria');

    if (resultado.tipo === 'aguardar') {
      await dormir(ESPERA_LOCK_MS);
      continue;
    }

    try {
      const novo = await trocarRefreshToken(resultado.refreshToken, clientId, clientSecret);
      await secretRef(uid).set(
        {
          accessToken: novo.accessToken,
          refreshToken: novo.refreshToken,
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
      // O refresh de uso único já foi consumido ou revogado: insistir só piora.
      await secretRef(uid).set({ refreshLockUntil: 0 }, { merge: true });
      await marcarReconexao(uid, String((err as Error).message));
      throw new Error('reconexao_necessaria');
    }
  }

  throw new Error('renovacao_em_andamento');
}
