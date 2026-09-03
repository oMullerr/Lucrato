/**
 * Devoluções e reclamações do Mercado Livre.
 *
 * Uma reclamação pode ou não ter devolução associada; quando tem, o produto
 * volta (para você ou para um depósito do ML) e há um custo de frete real. Isso
 * tudo é traduzido para a devolução do Lucrato, que já sabe reverter
 * faturamento, comissão e estoque.
 *
 * Somente leitura: nada é respondido nem resolvido pela integração.
 */
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { HttpsError, onCall } from 'firebase-functions/v2/https';

import type { DevolucaoDoMl } from '../../../src/app/core/ml/returns-apply';
import { diaLocalDeISO } from '../../../src/app/core/ml/order-mapping';
import { MlClient } from './client';

type Bruto = Record<string, unknown>;

const texto = (v: unknown): string => (typeof v === 'string' ? v : '');
const numero = (v: unknown): number => (typeof v === 'number' && isFinite(v) ? v : 0);

const db = () => getFirestore();

/** Envio da devolução que já chegou ao destino. */
function envioEntregue(envios: Bruto[]): Bruto | undefined {
  return envios.find(e => texto(e['status']) === 'delivered');
}

/**
 * Destino do produto devolvido.
 *
 * `seller_address` significa que a peça volta para você — só nesse caso ela
 * pode voltar ao estoque vendável. Indo para o depósito do Mercado Livre, o
 * produto não retorna e o padrão vira ressarcimento, revisável na tela.
 */
export function destinoDaDevolucao(envios: Bruto[]): DevolucaoDoMl['destination'] {
  for (const envio of envios) {
    const destino = texto(((envio['destination'] ?? {}) as Bruto)['name']);
    if (destino === 'seller_address') return 'Estoque';
    if (destino === 'warehouse') return 'Ressarcido';
  }
  return 'Estoque';
}

/** Normaliza reclamação + devolução + custo num único registro. */
export function normalizarDevolucao(
  claimId: string,
  claim: Bruto,
  retorno: Bruto,
  custoFrete: number,
  itemIdDaOrder: string,
): DevolucaoDoMl | null {
  const orderId = String(claim['resource_id'] ?? retorno['resource_id'] ?? '');
  if (!orderId) return null;

  const pedidos = Array.isArray(retorno['orders']) ? (retorno['orders'] as Bruto[]) : [];
  const itemId = texto(pedidos[0]?.['item_id']) || itemIdDaOrder;
  if (!itemId) return null;

  const envios = Array.isArray(retorno['shipments']) ? (retorno['shipments'] as Bruto[]) : [];
  const entregue = envioEntregue(envios);
  const fechamento = texto(retorno['date_closed']) || texto(retorno['last_updated']);

  return {
    claimId,
    externalIdVenda: `${orderId}:${itemId}`,
    mlOrderId: orderId,
    mlItemId: itemId,
    requestDate: diaLocalDeISO(texto(retorno['date_created']) || texto(claim['date_created'])),
    ...(entregue && fechamento ? { arrivalDate: diaLocalDeISO(fechamento) } : {}),
    returnShipping: custoFrete,
    destination: destinoDaDevolucao(envios),
    // Os motivos do ML são códigos opacos (PDD9939); o código fica na
    // observação e a classificação continua sua.
    reason: 'Outro',
    estado: 'pendente',
  };
}

/** Busca reclamação, devolução e custo, e devolve o registro pronto. */
export async function montarDevolucao(
  cliente: MlClient,
  claimId: string,
): Promise<DevolucaoDoMl | null> {
  const claim = await cliente.get<Bruto>(`/post-purchase/v1/claims/${claimId}`);

  // Reclamação sem devolução associada não vira devolução no Lucrato.
  const relacionados = Array.isArray(claim['related_entities'])
    ? (claim['related_entities'] as string[])
    : [];
  if (!relacionados.includes('return')) return null;

  const retorno = await cliente
    .get<Bruto>(`/post-purchase/v2/claims/${claimId}/returns`)
    .catch(() => ({}) as Bruto);

  const custo = await cliente
    .get<Bruto>(`/post-purchase/v1/claims/${claimId}/charges/return-cost`)
    .catch(() => ({}) as Bruto);

  // Sem item na devolução, cai no primeiro item do pedido.
  let itemIdDaOrder = '';
  const orderId = String(claim['resource_id'] ?? '');
  if (orderId) {
    const pedido = await cliente.get<Bruto>(`/orders/${orderId}`).catch(() => ({}) as Bruto);
    const itens = Array.isArray(pedido['order_items']) ? (pedido['order_items'] as Bruto[]) : [];
    itemIdDaOrder = texto(((itens[0]?.['item'] ?? {}) as Bruto)['id']);
  }

  return normalizarDevolucao(claimId, claim, retorno, numero(custo['amount']), itemIdDaOrder);
}

/** Grava a devolução, preservando o que o app já resolveu sobre ela. */
export async function gravarDevolucao(uid: string, dev: DevolucaoDoMl): Promise<void> {
  const ref = db().doc(`users/${uid}/mlReturns/${dev.claimId}`);
  const atual = await ref.get();
  const estado = atual.exists ? atual.get('estado') : 'pendente';

  await ref.set(
    { ...dev, estado: estado ?? 'pendente', atualizadoEm: Timestamp.now() },
    { merge: true },
  );
}

/** Marca devoluções já registradas no razão pelo app. */
export const mlMarkReturns = onCall({ enforceAppCheck: false }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Faça login para atualizar as devoluções.');
  }
  const uid = request.auth.uid;

  const dados = (request.data ?? {}) as { claimIds?: unknown; estado?: unknown };
  const ids = Array.isArray(dados.claimIds)
    ? dados.claimIds.filter((i): i is string => typeof i === 'string' && i.trim() !== '')
    : [];
  const estado = String(dados.estado ?? '');

  if (ids.length === 0) throw new HttpsError('invalid-argument', 'Nenhuma devolução informada.');
  if (ids.length > 400) throw new HttpsError('invalid-argument', 'Envie no máximo 400 por vez.');
  if (!['pendente', 'aplicado', 'ignorado'].includes(estado)) {
    throw new HttpsError('invalid-argument', 'Situação inválida.');
  }

  const batch = db().batch();
  for (const id of ids) {
    batch.set(
      db().doc(`users/${uid}/mlReturns/${id}`),
      { estado, atualizadoEm: Timestamp.now() },
      { merge: true },
    );
  }
  await batch.commit();

  logger.info('Devoluções atualizadas', { uid, total: ids.length, estado });
  return { total: ids.length };
});

/** Caminho completo de uma reclamação. */
export async function processarReclamacao(
  uid: string,
  cliente: MlClient,
  claimId: string,
): Promise<boolean> {
  const dev = await montarDevolucao(cliente, claimId);
  if (!dev) {
    logger.debug('Reclamação sem devolução associada', { uid, claimId });
    return false;
  }
  await gravarDevolucao(uid, dev);
  logger.info('Devolução importada', { uid, claimId, venda: dev.externalIdVenda });
  return true;
}
