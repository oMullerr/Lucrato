/**
 * Vínculo entre anúncio do Mercado Livre e produto do Lucrato.
 *
 * Um anúncio aponta para um produto; vários anúncios podem apontar para o
 * mesmo (o clássico e o premium do mesmo item, por exemplo). O lote só é
 * escolhido na hora da venda, por FIFO, então aqui não se fala em lote.
 *
 * A chave é normalizada no servidor com o MESMO módulo que a tela usa
 * (`src/app/core/ml/matching.ts`), para as duas pontas nunca divergirem.
 */
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { HttpsError, onCall } from 'firebase-functions/v2/https';

import { normalizarChaveProduto } from '../../../src/app/core/ml/matching';

/** Teto por chamada: o batch do Firestore aceita 500 operações. */
const MAX_POR_CHAMADA = 400;

interface EntradaVinculo {
  itemId?: unknown;
  /** Nome do produto como está no Lucrato. Vazio ou nulo desfaz o vínculo. */
  produto?: unknown;
}

/** Cria, atualiza ou desfaz vínculos em lote. */
export const mlSetLinks = onCall({ enforceAppCheck: false }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Faça login para vincular anúncios.');
  }
  const uid = request.auth.uid;

  const bruto = (request.data ?? {}) as { links?: unknown };
  const entradas = Array.isArray(bruto.links) ? (bruto.links as EntradaVinculo[]) : null;
  if (!entradas || entradas.length === 0) {
    throw new HttpsError('invalid-argument', 'Nenhum vínculo informado.');
  }
  if (entradas.length > MAX_POR_CHAMADA) {
    throw new HttpsError('invalid-argument', `Envie no máximo ${MAX_POR_CHAMADA} vínculos por vez.`);
  }

  const db = getFirestore();
  const batch = db.batch();
  let vinculados = 0;
  let desfeitos = 0;

  for (const entrada of entradas) {
    const itemId = typeof entrada.itemId === 'string' ? entrada.itemId.trim() : '';
    if (!itemId) {
      throw new HttpsError('invalid-argument', 'Anúncio sem identificador.');
    }

    const ref = db.doc(`users/${uid}/mlLinks/${itemId}`);
    const produto = typeof entrada.produto === 'string' ? entrada.produto.trim() : '';
    const productKey = normalizarChaveProduto(produto);

    if (!productKey) {
      batch.delete(ref);
      desfeitos++;
      continue;
    }

    batch.set(
      ref,
      { itemId, produto, productKey, linkedAt: Timestamp.now() },
      { merge: true },
    );
    vinculados++;
  }

  await batch.commit();
  await db.doc(`users/${uid}/db/ml`).set(
    { linksUpdatedAt: Timestamp.now() },
    { merge: true },
  );

  logger.info('Vínculos atualizados', { uid, vinculados, desfeitos });
  return { vinculados, desfeitos };
});
