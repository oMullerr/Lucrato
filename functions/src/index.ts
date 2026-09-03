/**
 * Cloud Functions do Lucrato.
 *
 * Escopo: integração SOMENTE LEITURA com a API do Mercado Livre. Nenhuma
 * function escreve no Mercado Livre, e nenhuma escreve em `users/{uid}/db/main`
 * — a ingestão grava em `users/{uid}/mlInbox/{id}` e o app aplica no razão
 * (ver o plano da feature: "Quem escreve no db/main").
 */
import { initializeApp } from 'firebase-admin/app';
import { setGlobalOptions } from 'firebase-functions/v2';
import { onCall } from 'firebase-functions/v2/https';

import { REGION } from './config';

initializeApp();
setGlobalOptions({ region: REGION, maxInstances: 10 });

/**
 * Sonda de vida: confirma que o app consegue chamar as functions com o token
 * de autenticação válido. Usada no diagnóstico da integração.
 */
export const mlHealth = onCall({ enforceAppCheck: false }, (request) => {
  if (!request.auth) {
    return { ok: false, reason: 'unauthenticated' as const };
  }
  return { ok: true as const, uid: request.auth.uid, ts: new Date().toISOString() };
});

export { mlAuthUrl, mlAuthCallback, mlDisconnect } from './ml/oauth';
export { mlSyncItems } from './ml/items';
export { mlSetLinks } from './ml/links';
export { mlWebhook } from './ml/webhook';
export { mlMarkInbox } from './ml/inbox';
export { mlProcessEvent, mlPoller } from './ml/sync';
