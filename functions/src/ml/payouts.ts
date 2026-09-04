/**
 * Quando o dinheiro de cada venda cai na conta.
 *
 * A data de liberação **não existe** em `/orders/{id}` — o array `payments[]`
 * de lá tem status, parcelas e valores, e nada de liberação. Ela vive no
 * Mercado Pago, em `/v1/payments/{id}`, que a própria documentação do Mercado
 * Livre indica para detalhe de pagamento e que aceita o mesmo access token.
 *
 * Essa rota também é a única que devolve o **líquido pronto**
 * (`net_received_amount`). Medido na conta real: pedido de R$ 115 deposita
 * R$ 79,95, enquanto o `sale_fee` sozinho era R$ 20,70 — o frete também sai da
 * operação. Reconstruir o depósito a partir da comissão erraria por R$ 14,35
 * num pedido só, e esta tela promete "isto vai cair na sua conta".
 *
 * Só consulta o que ainda não liberou. Esse conjunto encolhe sozinho para
 * algumas dezenas de pedidos recentes, em vez de crescer com o histórico.
 */
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';

import type { PagamentoDoMl } from '../../../src/app/core/ml/payouts';
import { ML_CLIENT_ID, ML_CLIENT_SECRET } from '../config';
import { criarMlClient, MlClient } from './client';

type Bruto = Record<string, unknown>;

const texto = (v: unknown): string => (v === null || v === undefined ? '' : String(v));
const numero = (v: unknown): number => {
  const n = typeof v === 'number' ? v : Number(v);
  return isFinite(n) ? n : 0;
};

/** Host do Mercado Pago. O resto da integração fala com `api.mercadolibre.com`. */
const MP_API = 'https://api.mercadopago.com';

/** Teto de pagamentos por rodada, para não estourar o tempo da function. */
const MAX_POR_RODADA = 200;

/** Quanto tempo depois da liberação ainda vale reconferir. */
const DIAS_DE_GRACA = 3;

const db = () => getFirestore();

/**
 * Normaliza a resposta do Mercado Pago.
 *
 * `liquido` fica `null` quando o campo não veio: melhor a tela dizer que não
 * sabe do que exibir uma estimativa com cara de número certo.
 */
export function normalizarPagamento(orderId: string, bruto: Bruto): PagamentoDoMl | null {
  // O id fica como texto porque é chave de documento e passa de 2^53 — mas
  // isso faz `0` virar `"0"`, que é truthy. Sem checar o valor, um pagamento
  // sem id viraria um documento chamado "0".
  const paymentId = texto(bruto['id']);
  const liberaEm = texto(bruto['money_release_date']);
  if (!paymentId || paymentId === '0' || !liberaEm) return null;

  const detalhes = (bruto['transaction_details'] ?? {}) as Bruto;
  const liquidoCru = detalhes['net_received_amount'];
  const temLiquido = typeof liquidoCru === 'number' && isFinite(liquidoCru);

  return {
    orderId,
    paymentId,
    liberaEm,
    situacaoMl: texto(bruto['money_release_status']),
    bruto: numero(bruto['transaction_amount']),
    liquido: temLiquido ? liquidoCru : null,
  };
}

/** Já liberou e passou da carência? Então não precisa perguntar de novo. */
export function jaResolvido(gravado: PagamentoDoMl | undefined, agora: Date): boolean {
  if (!gravado || gravado.situacaoMl !== 'released') return false;
  const liberou = new Date(gravado.liberaEm).getTime();
  if (!isFinite(liberou)) return false;
  return agora.getTime() - liberou > DIAS_DE_GRACA * 24 * 60 * 60 * 1000;
}

/** Pedidos que ainda precisam de consulta, do mais recente para o mais antigo. */
async function pedidosPendentes(uid: string): Promise<string[]> {
  const [ordens, pagos] = await Promise.all([
    db().collection(`users/${uid}/mlOrders`).get(),
    db().collection(`users/${uid}/mlPayouts`).get(),
  ]);

  const gravados = new Map<string, PagamentoDoMl>();
  for (const doc of pagos.docs) gravados.set(doc.id, doc.data() as PagamentoDoMl);

  const agora = new Date();
  return ordens.docs
    .map(d => d.id)
    .filter(id => !jaResolvido(gravados.get(id), agora))
    .sort((a, b) => b.localeCompare(a))
    .slice(0, MAX_POR_RODADA);
}

/**
 * Busca o pagamento de um pedido.
 *
 * O id do pagamento vem do próprio pedido; a liberação vem do Mercado Pago.
 * São duas chamadas por pedido, e é por isso que a lista de pendentes precisa
 * ser curta.
 */
async function pagamentoDoPedido(
  cliente: MlClient,
  orderId: string,
): Promise<PagamentoDoMl | null> {
  const pedido = await cliente.get<Bruto>(`/orders/${orderId}`).catch(() => null);
  if (!pedido) return null;

  const pagamentos = Array.isArray(pedido['payments']) ? (pedido['payments'] as Bruto[]) : [];
  // O primeiro pagamento aprovado é o que carrega o dinheiro da venda.
  const escolhido = pagamentos.find(p => texto(p['status']) === 'approved') ?? pagamentos[0];
  const paymentId = escolhido ? texto(escolhido['id']) : '';
  if (!paymentId) return null;

  const mp = await cliente
    .get<Bruto>(`${MP_API}/v1/payments/${paymentId}`)
    .catch(() => null);
  return mp ? normalizarPagamento(orderId, mp) : null;
}

/** Atualiza os recebíveis de um vendedor. */
export async function sincronizarRecebiveis(uid: string): Promise<number> {
  const cliente = criarMlClient(uid, ML_CLIENT_ID.value(), ML_CLIENT_SECRET.value());
  const pendentes = await pedidosPendentes(uid);

  let atualizados = 0;
  for (const orderId of pendentes) {
    const pagamento = await pagamentoDoPedido(cliente, orderId);
    if (!pagamento) continue;

    await db()
      .doc(`users/${uid}/mlPayouts/${orderId}`)
      .set({ ...pagamento, atualizadoEm: Timestamp.now() }, { merge: false });
    atualizados++;
  }

  await db()
    .doc(`users/${uid}/db/ml`)
    .set({ payoutsAt: Timestamp.now(), payoutsPending: pendentes.length }, { merge: true });

  return atualizados;
}

async function mlUserIdDe(uid: string): Promise<string> {
  const segredo = await db().doc(`users/${uid}/secret/ml`).get();
  return segredo.exists ? texto(segredo.get('mlUserId')) : '';
}

/** Atualização sob demanda, pelo botão da tela. */
export const mlSyncPayouts = onCall(
  {
    enforceAppCheck: false,
    secrets: [ML_CLIENT_ID, ML_CLIENT_SECRET],
    timeoutSeconds: 540,
    memory: '512MiB',
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Faça login para conferir os recebíveis.');
    }
    const uid = request.auth.uid;

    if (!(await mlUserIdDe(uid))) {
      throw new HttpsError('failed-precondition', 'Conecte a conta do Mercado Livre primeiro.');
    }

    try {
      const total = await sincronizarRecebiveis(uid);
      logger.info('Recebíveis sincronizados', { uid, total });
      return { total };
    } catch (err) {
      const motivo = String((err as Error).message);
      logger.error('Falha ao sincronizar recebíveis', { uid, motivo });
      if (motivo === 'reconexao_necessaria') {
        throw new HttpsError('failed-precondition', 'Reconecte a conta do Mercado Livre.');
      }
      throw new HttpsError('internal', 'Não deu para trazer os recebíveis agora.');
    }
  },
);

/**
 * Uma vez por dia, às 7h.
 *
 * Depois das métricas (6h) e do faturamento (6h30): três trabalhos pesados no
 * mesmo minuto disputariam o mesmo rate limit.
 */
export const mlPayoutsDaily = onSchedule(
  {
    schedule: 'every day 07:00',
    timeZone: 'America/Sao_Paulo',
    secrets: [ML_CLIENT_ID, ML_CLIENT_SECRET],
    timeoutSeconds: 540,
    memory: '512MiB',
  },
  async () => {
    const conectados = await db().collection('mlIndex').get();

    for (const doc of conectados.docs) {
      const uid = texto(doc.get('uid'));
      if (!uid) continue;
      try {
        const total = await sincronizarRecebiveis(uid);
        if (total > 0) logger.info('Recebíveis do dia', { uid, total });
      } catch (err) {
        // Uma conta com problema não pode derrubar as outras.
        logger.warn('Recebíveis falharam para um vendedor', {
          uid,
          motivo: String((err as Error).message),
        });
      }
    }
  },
);
