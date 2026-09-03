/**
 * Processamento assíncrono das vendas.
 *
 * Dois caminhos que levam ao mesmo lugar:
 *   - gatilho: reage ao evento que o webhook enfileirou (tempo real);
 *   - poller: varre a cada 15 minutos pelo que mudou desde o último cursor.
 *
 * O poller não é redundância inútil. O webhook pode falhar por cold start ou
 * indisponibilidade, e o Mercado Livre desiste depois de uma hora — sem a
 * varredura, essa venda nunca chegaria.
 */
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';

import { ML_CLIENT_ID, ML_CLIENT_SECRET } from '../config';
import { criarMlClient } from './client';
import { marcarSync, processarPedido } from './inbox';

type Bruto = Record<string, unknown>;

/** Quanto tempo para trás o poller olha quando ainda não há cursor. */
const JANELA_INICIAL_MS = 7 * 24 * 60 * 60 * 1000;
/** `/orders/search` devolve 50 por página. */
const PAGINA = 50;
/** Teto por rodada, para uma conta movimentada não estourar o tempo da function. */
const MAX_POR_RODADA = 300;
/** Teto do backfill: 12 meses de uma conta ativa cabem bem abaixo disso. */
const MAX_BACKFILL = 3_000;

const db = () => getFirestore();

/** Extrai o id do pedido de um `resource` como `/orders/2000003508897196`. */
export function idDoRecurso(resource: string): string {
  const m = /\/orders\/(\d+)/.exec(resource);
  return m ? m[1] : '';
}

async function uidDoVendedor(mlUserId: string): Promise<string> {
  const snap = await db().doc(`mlIndex/${mlUserId}`).get();
  return snap.exists ? String(snap.get('uid') ?? '') : '';
}

/** Reage à notificação enfileirada pelo webhook. */
export const mlProcessEvent = onDocumentCreated(
  {
    document: 'mlEvents/{eventId}',
    secrets: [ML_CLIENT_ID, ML_CLIENT_SECRET],
    timeoutSeconds: 300,
  },
  async (event) => {
    const dados = event.data?.data() as Bruto | undefined;
    if (!dados) return;

    const mlUserId = String(dados['mlUserId'] ?? '');
    const topic = String(dados['topic'] ?? '');
    const resource = String(dados['resource'] ?? '');

    const uid = await uidDoVendedor(mlUserId);
    if (!uid) {
      // Vendedor desconectou: o evento não tem dono, some com o TTL.
      logger.info('Evento sem vendedor conhecido', { mlUserId, topic });
      return;
    }

    const orderId = idDoRecurso(resource);
    if (!orderId) {
      // shipments e post_purchase entram nas fases seguintes.
      logger.debug('Recurso ainda não tratado', { topic, resource });
      await event.data?.ref.delete();
      return;
    }

    const cliente = criarMlClient(uid, ML_CLIENT_ID.value(), ML_CLIENT_SECRET.value());
    try {
      const total = await processarPedido(uid, cliente, orderId);
      await marcarSync(uid);
      logger.info('Pedido processado pelo webhook', { uid, orderId, rascunhos: total });
      await event.data?.ref.delete();
    } catch (err) {
      const motivo = String((err as Error).message);
      logger.error('Falha ao processar pedido', { uid, orderId, motivo });
      await db().doc(`users/${uid}/db/ml`).set(
        { lastError: motivo, updatedAt: Timestamp.now() },
        { merge: true },
      );
      // Não apaga o evento: fica para inspeção e o TTL limpa depois.
      await event.data?.ref.set({ erro: motivo }, { merge: true });
    }
  },
);

/** Varre os pedidos alterados desde o último cursor de um vendedor. */
export async function varrerVendedor(uid: string, mlUserId: string): Promise<number> {
  const estado = await db().doc(`users/${uid}/db/ml`).get();
  const cursorSalvo = estado.exists ? String(estado.get('ordersCursor') ?? '') : '';
  const desde = cursorSalvo || new Date(Date.now() - JANELA_INICIAL_MS).toISOString();

  const cliente = criarMlClient(uid, ML_CLIENT_ID.value(), ML_CLIENT_SECRET.value());
  let offset = 0;
  let processados = 0;
  let maiorData = desde;

  while (processados < MAX_POR_RODADA) {
    const pagina = await cliente.get<Bruto>('/orders/search', {
      seller: mlUserId,
      'order.date_last_updated.from': desde,
      sort: 'date_asc',
      offset,
      limit: PAGINA,
    });

    const resultados = Array.isArray(pagina['results']) ? (pagina['results'] as Bruto[]) : [];
    if (resultados.length === 0) break;

    for (const pedido of resultados) {
      const orderId = String(pedido['id'] ?? '');
      if (!orderId) continue;
      await processarPedido(uid, cliente, orderId);
      processados++;

      const atualizado = String(pedido['last_updated'] ?? '');
      if (atualizado && atualizado > maiorData) maiorData = atualizado;
    }

    if (resultados.length < PAGINA) break;
    offset += PAGINA;
  }

  // Um segundo a mais evita reprocessar sempre o último pedido da rodada.
  const proximoCursor = new Date(new Date(maiorData).getTime() + 1000).toISOString();
  await marcarSync(uid, { ordersCursor: proximoCursor, lastPollAt: Timestamp.now() });
  return processados;
}

/**
 * Traz o histórico que o Mercado Livre ainda entrega.
 *
 * A API guarda 12 meses de pedidos; depois disso não há como buscar. Tudo cai
 * na caixa de entrada, nunca direto no razão: boa parte já foi digitada à mão,
 * e a conciliação acontece no app, com a sua aprovação.
 */
export const mlBackfill = onCall(
  {
    enforceAppCheck: false,
    secrets: [ML_CLIENT_ID, ML_CLIENT_SECRET],
    timeoutSeconds: 540,
    memory: '512MiB',
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Faça login para importar o histórico.');
    }
    const uid = request.auth.uid;

    const segredo = await db().doc(`users/${uid}/secret/ml`).get();
    const mlUserId = segredo.exists ? String(segredo.get('mlUserId') ?? '') : '';
    if (!mlUserId) {
      throw new HttpsError('failed-precondition', 'Conecte a conta do Mercado Livre primeiro.');
    }

    const meses = Math.min(12, Math.max(1, Number((request.data as Bruto)?.['meses'] ?? 12)));
    const desde = new Date();
    desde.setMonth(desde.getMonth() - meses);

    const cliente = criarMlClient(uid, ML_CLIENT_ID.value(), ML_CLIENT_SECRET.value());
    let offset = 0;
    let processados = 0;

    try {
      while (processados < MAX_BACKFILL) {
        const pagina = await cliente.get<Bruto>('/orders/search', {
          seller: mlUserId,
          'order.date_created.from': desde.toISOString(),
          sort: 'date_asc',
          offset,
          limit: PAGINA,
        });

        const resultados = Array.isArray(pagina['results']) ? (pagina['results'] as Bruto[]) : [];
        if (resultados.length === 0) break;

        for (const pedido of resultados) {
          const orderId = String(pedido['id'] ?? '');
          if (!orderId) continue;
          await processarPedido(uid, cliente, orderId);
          processados++;
        }

        if (resultados.length < PAGINA) break;
        offset += PAGINA;
      }

      await marcarSync(uid, { backfillAt: Timestamp.now(), backfillTotal: processados });
      logger.info('Histórico importado', { uid, processados, meses });
      return { total: processados };
    } catch (err) {
      const motivo = String((err as Error).message);
      logger.error('Falha no backfill', { uid, motivo, processados });
      await db().doc(`users/${uid}/db/ml`).set(
        { lastError: motivo, updatedAt: Timestamp.now() },
        { merge: true },
      );
      if (motivo === 'reconexao_necessaria') {
        throw new HttpsError('failed-precondition', 'Reconecte a conta do Mercado Livre.');
      }
      throw new HttpsError('internal', 'Não deu para importar o histórico agora.');
    }
  },
);

/** Rede de segurança: roda de 15 em 15 minutos para todos os conectados. */
export const mlPoller = onSchedule(
  {
    schedule: 'every 15 minutes',
    secrets: [ML_CLIENT_ID, ML_CLIENT_SECRET],
    timeoutSeconds: 540,
    memory: '512MiB',
  },
  async () => {
    const conectados = await db().collection('mlIndex').get();

    for (const doc of conectados.docs) {
      const uid = String(doc.get('uid') ?? '');
      const mlUserId = doc.id;
      if (!uid) continue;

      try {
        const total = await varrerVendedor(uid, mlUserId);
        if (total > 0) logger.info('Varredura trouxe pedidos', { uid, total });
      } catch (err) {
        const motivo = String((err as Error).message);
        // Conta que precisa reconectar não deve derrubar a varredura das outras.
        logger.warn('Varredura falhou para um vendedor', { uid, motivo });
        await db().doc(`users/${uid}/db/ml`).set(
          { lastError: motivo, updatedAt: Timestamp.now() },
          { merge: true },
        );
      }
    }
  },
);
