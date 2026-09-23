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
import { timingSafeEqual } from 'node:crypto';

import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { defineString } from 'firebase-functions/params';
import { onRequest } from 'firebase-functions/v2/https';

/** Tópicos que a integração processa. O resto é confirmado e descartado. */
const TOPICOS = new Set(['orders_v2', 'orders', 'shipments', 'post_purchase']);

/** Corpo maior que isso não é notificação do ML; é ruído ou ataque. */
const MAX_CORPO = 8 * 1024;

/** Eventos somem sozinhos depois disso, via TTL do Firestore. */
const VALIDADE_EVENTO_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Segredo no caminho, cadastrado junto da URL no DevCenter do Mercado Livre.
 *
 * O corpo da notificação sempre foi tratado como PONTEIRO — dele só se aproveita
 * `user_id` e `resource`, e os valores vêm de uma chamada nossa à API. Um POST
 * forjado nunca conseguiu injetar venda. O que ele conseguia era CUSTAR: cada
 * requisição virava uma escrita no Firestore e disparava o gatilho
 * `mlProcessEvent`, que por sua vez chama a API do Mercado Livre com o token do
 * vendedor — e o ML bloqueia por IP quem exagera. Endpoint público sem
 * autenticação nenhuma é fatura aberta.
 *
 * Vazio = aceita tudo, que é o comportamento antigo. Deixar opcional é
 * deliberado: configurar errado não pode DERRUBAR a captura de vendas, porque
 * notificação recusada não volta — o Mercado Livre desiste depois de uma hora.
 */
const WEBHOOK_TOKEN = defineString('ML_WEBHOOK_TOKEN', { default: '' });

/**
 * Compara sem vazar o tamanho do acerto pelo tempo.
 *
 * `===` em string sai no primeiro byte diferente. Aqui a diferença é pequena,
 * mas o custo de fazer certo também.
 */
export function segredoConfere(recebido: string, esperado: string): boolean {
  if (!esperado) return true;
  const a = Buffer.from(recebido);
  const b = Buffer.from(esperado);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** Último trecho do caminho, que é onde o segredo viaja. */
export function segredoDaUrl(caminho: string): string {
  const limpo = (caminho || '').split('?')[0].replace(/\/+$/, '');
  const partes = limpo.split('/');
  return partes[partes.length - 1] ?? '';
}

export const mlWebhook = onRequest({ cors: false, memory: '256MiB', maxInstances: 5 }, async (req, res) => {
  // Sempre 200: erro aqui faz o Mercado Livre desativar o tópico.
  const ok = () => res.status(200).send('ok');

  try {
    if (req.method !== 'POST') {
      res.status(405).send('method not allowed');
      return;
    }

    /* 404 e não 401 de propósito: quem não tem o segredo não precisa saber que
       existe um endpoint aqui. E ANTES de qualquer leitura do corpo — o ponto
       da trava é não gastar nada com quem não devia chegar. */
    if (!segredoConfere(segredoDaUrl(req.path), WEBHOOK_TOKEN.value())) {
      logger.warn('Notificação com segredo inválido', { path: req.path });
      res.status(404).send('not found');
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
