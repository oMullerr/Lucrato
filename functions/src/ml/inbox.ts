/**
 * Caixa de entrada: onde as vendas do Mercado Livre esperam para entrar no razão.
 *
 * A function NUNCA escreve em `users/{uid}/db/main`. O app grava lá arrays
 * inteiros e transação do Firestore não funciona offline, então uma escrita do
 * servidor no mesmo documento poderia ser apagada pela próxima gravação do
 * navegador — perda silenciosa. A caixa é durável e o app aplica de lá.
 */
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { HttpsError, onCall } from 'firebase-functions/v2/https';

import type { RascunhoVenda } from '../../../src/app/core/ml/order-mapping';
import { mapearPedido } from '../../../src/app/core/ml/order-mapping';
import { MlClient } from './client';
import { montarPedido } from './orders';

/** Situação de um item da caixa. */
export type EstadoNaCaixa = 'pendente' | 'aplicado' | 'ignorado';

export interface ItemDaCaixa extends RascunhoVenda {
  /** Produto do Lucrato, quando o anúncio já está vinculado. */
  produto: string;
  vinculado: boolean;
  estado: EstadoNaCaixa;
}

const db = () => getFirestore();

/**
 * Grava (ou atualiza) os rascunhos de um pedido.
 *
 * Idempotente pela chave `externalId`: reprocessar o mesmo pedido atualiza o
 * que mudou — situação, estorno, frete — em vez de duplicar. Itens já
 * aplicados no razão continuam marcados como aplicados; quem concilia a venda
 * em si é o app.
 */
export async function gravarNaCaixa(uid: string, rascunhos: readonly RascunhoVenda[]): Promise<number> {
  if (rascunhos.length === 0) return 0;

  const batch = db().batch();

  for (const rascunho of rascunhos) {
    const vinculo = await db().doc(`users/${uid}/mlLinks/${rascunho.mlItemId}`).get();
    const produtoVinculado = vinculo.exists ? String(vinculo.get('produto') ?? '') : '';

    const ref = db().doc(`users/${uid}/mlInbox/${rascunho.externalId}`);
    const atual = await ref.get();
    const estado = (atual.exists ? atual.get('estado') : 'pendente') as EstadoNaCaixa;

    const item: ItemDaCaixa = {
      ...rascunho,
      produto: produtoVinculado || rascunho.product,
      vinculado: !!produtoVinculado,
      estado: estado ?? 'pendente',
    };

    batch.set(ref, { ...item, atualizadoEm: Timestamp.now() }, { merge: true });
  }

  await batch.commit();
  return rascunhos.length;
}

/**
 * Caminho completo de um pedido: busca, normaliza, mapeia e guarda.
 *
 * Guarda também o pedido normalizado em `mlOrders`, que serve de auditoria
 * quando um número no razão for questionado.
 */
export async function processarPedido(
  uid: string,
  cliente: MlClient,
  orderId: string,
): Promise<number> {
  const pedido = await montarPedido(cliente, orderId);
  if (!pedido.orderId) {
    logger.warn('Pedido sem id, ignorado', { uid, orderId });
    return 0;
  }

  await db()
    .doc(`users/${uid}/mlOrders/${pedido.orderId}`)
    .set({ ...pedido, atualizadoEm: Timestamp.now() }, { merge: true });

  const rascunhos = mapearPedido(pedido);
  return gravarNaCaixa(uid, rascunhos);
}

/**
 * Marca itens da caixa depois que o app resolveu o que fazer com eles.
 *
 * O app grava a venda no razão pelo caminho de sempre e depois avisa aqui —
 * o documento da caixa é só do servidor, para o navegador não conseguir
 * marcar como aplicado algo que nunca entrou.
 */
export const mlMarkInbox = onCall({ enforceAppCheck: false }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Faça login para atualizar a caixa de entrada.');
  }
  const uid = request.auth.uid;

  const dados = (request.data ?? {}) as { externalIds?: unknown; estado?: unknown };
  const ids = Array.isArray(dados.externalIds)
    ? dados.externalIds.filter((i): i is string => typeof i === 'string' && i.trim() !== '')
    : [];
  const estado = String(dados.estado ?? '') as EstadoNaCaixa;

  if (ids.length === 0) throw new HttpsError('invalid-argument', 'Nenhum item informado.');
  if (ids.length > 400) throw new HttpsError('invalid-argument', 'Envie no máximo 400 itens por vez.');
  if (!['pendente', 'aplicado', 'ignorado'].includes(estado)) {
    throw new HttpsError('invalid-argument', 'Situação inválida.');
  }

  const batch = db().batch();
  for (const id of ids) {
    batch.set(
      db().doc(`users/${uid}/mlInbox/${id}`),
      { estado, atualizadoEm: Timestamp.now() },
      { merge: true },
    );
  }
  await batch.commit();

  logger.info('Caixa de entrada atualizada', { uid, total: ids.length, estado });
  return { total: ids.length };
});

/** Marca o último sync bem-sucedido, que o app mostra na tela de Integrações. */
export async function marcarSync(uid: string, extras: Record<string, unknown> = {}): Promise<void> {
  await db()
    .doc(`users/${uid}/db/ml`)
    .set({ lastSyncAt: Timestamp.now(), lastError: null, ...extras }, { merge: true });
}
