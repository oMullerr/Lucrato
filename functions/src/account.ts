/**
 * Exclusão de conta — do lado do servidor, que é o único que alcança tudo.
 *
 * ANTES DE SETEMBRO/2026 ISTO NÃO EXISTIA. O app apagava `users/{uid}/db/main`
 * pelo navegador e chamava `deleteUser()`. Ficava para trás:
 *
 *   users/{uid}/secret/ml   ACCESS E REFRESH TOKEN VIVOS DO MERCADO LIVRE
 *   mlIndex/{mlUserId}      o índice que o webhook e o poller usam
 *   users/{uid}/db/ml       estado da integração
 *   users/{uid}/db/analyses análises salvas da calculadora
 *   users/{uid}/mlItems     anúncios
 *   users/{uid}/mlLinks     vínculos anúncio → produto
 *   users/{uid}/mlInbox     vendas capturadas
 *   users/{uid}/mlReturns   devoluções
 *   users/{uid}/mlBilling   fatura do ML
 *   users/{uid}/mlPayouts   liberação do dinheiro
 *   users/{uid}/mlOrders    payload cru dos pedidos
 *
 * E não era só sujeira. Quinze minutos depois da exclusão, o `mlPoller`
 * encontrava o `mlIndex` órfão, renovava o refresh token e seguia varrendo
 * pedidos da conta do Mercado Livre — de graça, para sempre, sem ninguém para
 * ver. Pior: não sobrava NENHUM jeito de desconectar pelo app, porque as
 * `firestore.rules` negam `secret/ml` ao navegador e a conta do Firebase já não
 * existia mais para chamar `mlDisconnect`.
 *
 * O cliente não consegue consertar isso sozinho — por desenho. Por isso a
 * exclusão passou para cá.
 */
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { HttpsError, onCall } from 'firebase-functions/v2/https';

import { apagarConexao } from './ml/tokens';

/**
 * Idade máxima do login para aceitar a exclusão, em segundos.
 *
 * O app já re-autentica com a senha antes de chamar, e isto é a confirmação
 * disso do lado de cá: um token emitido há horas não prova que quem está
 * pedindo é o dono — prova só que a aba ficou aberta. Meia hora é folgado para
 * o fluxo real (reautenticar e confirmar leva segundos) e curto o bastante para
 * uma sessão esquecida não servir.
 */
const IDADE_MAXIMA_DO_LOGIN_S = 30 * 60;

/** Coleções do usuário que a exclusão precisa varrer. */
const COLECOES = [
  'db',
  'secret',
  'mlItems',
  'mlLinks',
  'mlInbox',
  'mlReturns',
  'mlBilling',
  'mlPayouts',
  'mlOrders',
] as const;

export const deleteAccount = onCall({ enforceAppCheck: false, timeoutSeconds: 300 }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Faça login para excluir a conta.');
  }
  const uid = request.auth.uid;

  /* `auth_time` é quando a SENHA foi conferida, não quando o token foi emitido
     — é a diferença entre "o dono está aqui agora" e "a sessão continua de pé".
     O refresh silencioso renova o token sem tocar neste campo. */
  const autenticadoEm = Number(request.auth.token.auth_time ?? 0);
  const idade = Date.now() / 1000 - autenticadoEm;
  if (!autenticadoEm || idade > IDADE_MAXIMA_DO_LOGIN_S) {
    throw new HttpsError(
      'failed-precondition',
      'Confirme sua senha antes de excluir a conta.',
    );
  }

  const db = getFirestore();

  /* A conexão com o ML sai PRIMEIRO, e de propósito.

     É a única parte que sobrevive fora do subtree do usuário (`mlIndex/...`) e
     a única com consequência contínua se ficar. Se a varredura falhar no meio,
     o pior caso vira "dados órfãos no Firestore" — chato — em vez de "token
     vivo sendo usado por um poller a cada quinze minutos" — que é o problema
     de verdade. */
  let mlUserId = 0;
  try {
    mlUserId = await apagarConexao(uid);
  } catch (err) {
    logger.error('Falha ao apagar a conexão do ML na exclusão de conta', {
      uid,
      erro: String(err),
    });
    // Sem isto, a conta do Auth sumiria e o token ficaria sem dono e sem cura.
    throw new HttpsError('internal', 'Não deu para desconectar o Mercado Livre. Tente de novo.');
  }

  for (const colecao of COLECOES) {
    await db.recursiveDelete(db.collection(`users/${uid}/${colecao}`));
  }
  // O documento do próprio usuário, caso exista fora das subcoleções.
  await db.recursiveDelete(db.doc(`users/${uid}`));

  /* O usuário do Auth sai POR ÚLTIMO. Invertida a ordem, uma falha na varredura
     deixaria dados sem dono e sem nenhuma sessão capaz de pedir a limpeza de
     novo — exatamente o beco em que a versão antiga metia o refresh token. */
  await getAuth().deleteUser(uid);

  logger.info('Conta excluída', { uid, mlUserId, colecoes: COLECOES.length });
  return { ok: true as const };
});
