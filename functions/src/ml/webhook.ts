/**
 * Recebedor das notificações do Mercado Livre.
 *
 * Regra dura da plataforma: responder HTTP 200 em até 500 ms, senão o tópico é
 * desativado por fallback e as notificações do período se perdem. Por isso esta
 * function faz UMA gravação e responde — quem busca o pedido é o gatilho.
 *
 * O corpo da notificação é tratado como PONTEIRO, nunca como dado: dele só se
 * aproveita o `user_id` e o `resource`. Os valores sempre vêm de uma chamada
 * nossa à API, autenticada com o token daquele vendedor. Um POST forjado não
 * consegue injetar venda nenhuma.
 */
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { onRequest } from 'firebase-functions/v2/https';

/** Tópicos que a integração processa. O resto é confirmado e descartado. */
const TOPICOS = new Set(['orders_v2', 'orders', 'shipments', 'post_purchase']);

/** Corpo maior que isso não é notificação do ML; é ruído ou ataque. */
const MAX_CORPO = 8 * 1024;

/** Eventos somem sozinhos depois disso, via TTL do Firestore. */
const VALIDADE_EVENTO_MS = 7 * 24 * 60 * 60 * 1000;

export const mlWebhook = onRequest({ cors: false, memory: '256MiB' }, async (req, res) => {
  // Sempre 200: erro aqui faz o Mercado Livre desativar o tópico.
  const ok = () => res.status(200).send('ok');

  try {
    if (req.method !== 'POST') {
      res.status(405).send('method not allowed');
      return;
    }

    const cru = req.rawBody ? req.rawBody.length : 0;
    if (cru > MAX_CORPO) {
      logger.warn('Notificação grande demais, descartada', { bytes: cru });
      ok();
      return;
    }

    const corpo = (req.body ?? {}) as Record<string, unknown>;
    const topic = String(corpo['topic'] ?? '');
    const resource = String(corpo['resource'] ?? '');
    const mlUserId = String(corpo['user_id'] ?? '');

    if (!mlUserId || !resource || !TOPICOS.has(topic)) {
      ok();
      return;
    }

    await getFirestore()
      .collection('mlEvents')
      .add({
        mlUserId,
        topic,
        resource,
        actions: Array.isArray(corpo['actions']) ? corpo['actions'] : [],
        recebidoEm: Timestamp.now(),
        expiraEm: Timestamp.fromMillis(Date.now() + VALIDADE_EVENTO_MS),
      });

    ok();
  } catch (err) {
    // Mesmo em falha nossa, confirmamos: o poller recupera o que faltar.
    logger.error('Falha ao enfileirar notificação', { erro: String(err) });
    res.status(200).send('ok');
  }
});
