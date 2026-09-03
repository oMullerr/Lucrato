/**
 * Fluxo OAuth com o Mercado Livre (Authorization Code + PKCE).
 *
 * São duas pontas:
 *   mlAuthUrl      callable — o app pede a URL de autorização (exige login)
 *   mlAuthCallback onRequest — o ML devolve o `code` aqui
 *
 * O `code_verifier` e o `uid` viajam em `mlAuthStates/{state}`, no servidor,
 * nunca pela URL. O documento é de uso único e expira em 10 minutos.
 */
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { HttpsError, onCall, onRequest } from 'firebase-functions/v2/https';
import { defineString } from 'firebase-functions/params';

import { ML_API, ML_AUTH_URL, ML_CLIENT_ID, ML_CLIENT_SECRET } from '../config';
import { codeChallengeOf, isAllowedReturnTo, newCodeVerifier, newState } from './crypto';
import { saveTokens } from './tokens';

/** Deve ser IDÊNTICA à cadastrada no DevCenter do Mercado Livre. */
export const ML_REDIRECT_URI = defineString('ML_REDIRECT_URI', { default: '' });

/** Origens extras aceitas no retorno, separadas por vírgula. */
export const APP_ORIGINS = defineString('APP_ORIGINS', { default: '' });

const VALIDADE_STATE_MS = 10 * 60 * 1000;

const db = () => getFirestore();
const stateRef = (state: string) => db().doc(`mlAuthStates/${state}`);

interface EstadoAuth {
  uid: string;
  codeVerifier: string;
  returnTo: string;
  criadoEm: number;
}

/** Passo 1: o app pede a URL para onde mandar o vendedor. */
export const mlAuthUrl = onCall({ enforceAppCheck: false, secrets: [ML_CLIENT_ID] }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Faça login antes de conectar o Mercado Livre.');
  }

  const redirectUri = ML_REDIRECT_URI.value();
  if (!redirectUri) {
    throw new HttpsError('failed-precondition', 'ML_REDIRECT_URI não configurada nas functions.');
  }

  const returnTo = String((request.data as { returnTo?: unknown } | undefined)?.returnTo ?? '');
  const extras = APP_ORIGINS.value().split(',').map((s) => s.trim()).filter(Boolean);
  if (returnTo && !isAllowedReturnTo(returnTo, extras)) {
    throw new HttpsError('invalid-argument', 'Endereço de retorno não autorizado.');
  }

  const state = newState();
  const codeVerifier = newCodeVerifier();

  const estado: EstadoAuth = {
    uid: request.auth.uid,
    codeVerifier,
    returnTo,
    criadoEm: Date.now(),
  };
  // `expiraEm` alimenta a politica de TTL do Firestore: estados abandonados
  // somem sozinhos, sem precisar de rotina de limpeza.
  await stateRef(state).set({
    ...estado,
    expiraEm: Timestamp.fromMillis(estado.criadoEm + VALIDADE_STATE_MS),
  });

  const url = new URL(ML_AUTH_URL);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', ML_CLIENT_ID.value());
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('state', state);
  url.searchParams.set('code_challenge', codeChallengeOf(codeVerifier));
  url.searchParams.set('code_challenge_method', 'S256');

  return { url: url.toString() };
});

function pagina(titulo: string, mensagem: string): string {
  const escapar = (s: string) => s.replace(/[<>&]/g, (c) => `&#${c.charCodeAt(0)};`);
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapar(titulo)}</title>
<style>body{font:16px/1.5 system-ui,sans-serif;margin:0;display:grid;place-items:center;
min-height:100vh;background:#10161c;color:#e8eef5}main{max-width:34rem;padding:2rem;text-align:center}
h1{font-size:1.25rem;margin:0 0 .5rem}p{margin:0;color:#9fb0c0}</style></head>
<body><main><h1>${escapar(titulo)}</h1><p>${escapar(mensagem)}</p></main></body></html>`;
}

/** Passo 2: o Mercado Livre devolve o `code` aqui. */
export const mlAuthCallback = onRequest(
  { secrets: [ML_CLIENT_ID, ML_CLIENT_SECRET], cors: false },
  async (req, res) => {
    const code = typeof req.query['code'] === 'string' ? req.query['code'] : '';
    const state = typeof req.query['state'] === 'string' ? req.query['state'] : '';

    const finalizar = (ok: boolean, returnTo: string, motivo?: string) => {
      if (returnTo) {
        const destino = new URL(returnTo);
        destino.searchParams.set('ml', ok ? 'ok' : 'erro');
        res.redirect(302, destino.toString());
        return;
      }
      res.status(ok ? 200 : 400).send(
        ok
          ? pagina('Conta conectada', 'Pode fechar esta aba e voltar para o Lucrato.')
          : pagina('Não deu para conectar', motivo ?? 'Tente novamente pelo Lucrato.'),
      );
    };

    if (!code || !state) {
      finalizar(false, '', 'A resposta do Mercado Livre veio incompleta.');
      return;
    }

    // Estado é de uso único: lê e apaga na mesma transação.
    const estado = await db().runTransaction(async (tx) => {
      const snap = await tx.get(stateRef(state));
      if (!snap.exists) return null;
      tx.delete(stateRef(state));
      return snap.data() as EstadoAuth;
    });

    if (!estado) {
      finalizar(false, '', 'Este link de autorização já foi usado ou expirou.');
      return;
    }
    if (Date.now() - estado.criadoEm > VALIDADE_STATE_MS) {
      finalizar(false, estado.returnTo, 'O link de autorização expirou.');
      return;
    }

    try {
      const corpo = new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: ML_CLIENT_ID.value(),
        client_secret: ML_CLIENT_SECRET.value(),
        code,
        redirect_uri: ML_REDIRECT_URI.value(),
        code_verifier: estado.codeVerifier,
      });

      const resposta = await fetch(`${ML_API}/oauth/token`, {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'content-type': 'application/x-www-form-urlencoded',
        },
        body: corpo,
      });
      const dados = (await resposta.json()) as Record<string, unknown>;
      if (!resposta.ok) {
        throw new Error(String(dados['error'] ?? resposta.status));
      }

      const accessToken = String(dados['access_token']);
      const mlUserId = Number(dados['user_id']);
      const expiresIn = Number(dados['expires_in'] ?? 21_600);

      // Nickname para o app mostrar qual conta está conectada.
      let nickname = '';
      const me = await fetch(`${ML_API}/users/me`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (me.ok) {
        nickname = String(((await me.json()) as Record<string, unknown>)['nickname'] ?? '');
      }

      await saveTokens(
        estado.uid,
        {
          accessToken,
          refreshToken: String(dados['refresh_token']),
          expiresAt: Date.now() + expiresIn * 1000,
          mlUserId,
          status: 'connected',
          refreshLockUntil: 0,
        },
        { nickname, connectedAt: Timestamp.now(), lastError: null },
      );

      // Índice para o webhook achar o dono a partir do user_id do ML.
      await db().doc(`mlIndex/${mlUserId}`).set({ uid: estado.uid, updatedAt: Timestamp.now() });

      logger.info('Conta do Mercado Livre conectada', { uid: estado.uid, mlUserId });
      finalizar(true, estado.returnTo);
    } catch (err) {
      logger.error('Falha ao trocar o code por token', { erro: String(err) });
      finalizar(false, estado.returnTo, 'O Mercado Livre recusou a autorização.');
    }
  },
);

/**
 * Desconecta a conta: apaga os tokens, tira o índice usado pelo webhook e
 * marca o documento público. A partir daí o Mercado Livre pode até continuar
 * mandando notificação, mas nada mais é aceito para este usuário.
 */
export const mlDisconnect = onCall({ enforceAppCheck: false }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Faça login para desconectar.');
  }
  const uid = request.auth.uid;

  const secret = db().doc(`users/${uid}/secret/ml`);
  const snap = await secret.get();
  const mlUserId = snap.exists ? Number(snap.get('mlUserId')) : 0;

  if (mlUserId) {
    const indice = db().doc(`mlIndex/${mlUserId}`);
    const atual = await indice.get();
    // Só remove o índice se ele ainda aponta para este usuário.
    if (atual.exists && atual.get('uid') === uid) await indice.delete();
  }

  await secret.delete();
  await db().doc(`users/${uid}/db/ml`).set(
    {
      connected: false,
      status: 'disconnected',
      nickname: null,
      mlUserId: null,
      lastError: null,
      updatedAt: Timestamp.now(),
    },
    { merge: true },
  );

  logger.info('Conta do Mercado Livre desconectada', { uid, mlUserId });
  return { ok: true as const };
});
