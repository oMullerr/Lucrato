/**
 * Quando o dinheiro cai na conta do Mercado Pago.
 *
 * A data de liberação **não existe** em `/orders/{id}` — o array `payments[]`
 * de lá tem status, parcelas e valores, e nada de liberação. Ela vive no
 * Mercado Pago, junto com o **líquido pronto** (`net_received_amount`). Medido
 * na conta real: um pedido de R$ 115 deposita R$ 79,95, enquanto o `sale_fee`
 * sozinho era R$ 20,70 — o frete também sai da operação. Reconstruir o depósito
 * a partir da comissão erraria por R$ 14,35 num pedido só, e esta tela promete
 * "isto vai cair na sua conta".
 *
 * **A busca é pela CONTA, não pelos pedidos.** A primeira versão caminhava
 * `mlOrders → /orders/{id} → payments[] → /v1/payments/{id}`, e por isso não
 * enxergava dinheiro que entra sem pedido atrás — bonificação, ajuste,
 * devolução de tarifa, que o Mercado Pago trata como `money_transfer`. Foram
 * dois créditos de R$ 0,80 e R$ 0,90 liberando no MESMO instante de dois
 * pagamentos de venda: o app do Mercado Pago somava os dois na linha do dia e
 * o nosso número ficava R$ 1,70 abaixo. Nenhum ajuste de cálculo resolveria —
 * o dado não estava sendo buscado.
 *
 * De quebra, ficou muito mais barato: eram duas chamadas por pedido (~200 para
 * 99 pedidos); a busca devolve 50 por página.
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

/** Máximo que a busca de pagamentos devolve por página. */
const PAGINA = 50;

/** Teto de pagamentos por rodada, para não estourar o tempo da function. */
const MAX_POR_RODADA = 1_000;

/**
 * Janela de criação varrida a cada rodada.
 *
 * O Mercado Pago libera em até ~30 dias; 120 cobre com folga qualquer pendente,
 * inclusive um que tenha ficado para trás. Pagamento antigo já liberado é
 * regravado igual — idempotente e barato.
 */
const DIAS_DE_JANELA = 120;

/** Quanto tempo depois da liberação ainda vale reconferir. */
const DIAS_DE_GRACA = 3;

const db = () => getFirestore();

/**
 * Normaliza a resposta do Mercado Pago.
 *
 * `liquido` fica `null` quando o campo não veio: melhor a tela dizer que não
 * sabe do que exibir uma estimativa com cara de número certo.
 */
export function normalizarPagamento(bruto: Bruto): PagamentoDoMl | null {
  // O id fica como texto porque é chave de documento e passa de 2^53 — mas
  // isso faz `0` virar `"0"`, que é truthy. Sem checar o valor, um pagamento
  // sem id viraria um documento chamado "0".
  const paymentId = texto(bruto['id']);
  if (!paymentId || paymentId === '0') return null;

  // Sem data de liberação não há o que prever. É assim que a busca devolve as
  // tentativas recusadas — com `net_received_amount` zero e liberação nula.
  const liberaEm = texto(bruto['money_release_date']);
  if (!liberaEm) return null;

  // Só dinheiro aprovado entra: o resto ainda pode não acontecer.
  if (texto(bruto['status']) !== 'approved') return null;

  const detalhes = (bruto['transaction_details'] ?? {}) as Bruto;
  const liquidoCru = detalhes['net_received_amount'];
  const temLiquido = typeof liquidoCru === 'number' && isFinite(liquidoCru);

  // Crédito sem pedido (bonificação, ajuste) vem sem o nó `order`.
  const pedido = (bruto['order'] ?? {}) as Bruto;

  return {
    paymentId,
    orderId: texto(pedido['id']),
    liberaEm,
    // Guardado para reconhecer liberação imediata: nesses o Mercado Pago manda
    // a data de liberação igual à da aprovação e deixa a situação em `pending`
    // para sempre.
    aprovadoEm: texto(bruto['date_approved']),
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

/** Uma página da busca de pagamentos da conta. */
async function buscarPagina(
  cliente: MlClient,
  desde: Date,
  ate: Date,
  offset: number,
): Promise<Bruto[]> {
  const pagina = await cliente.get<Bruto>(`${MP_API}/v1/payments/search`, {
    sort: 'date_created',
    criteria: 'desc',
    range: 'date_created',
    begin_date: desde.toISOString(),
    end_date: ate.toISOString(),
    offset,
    limit: PAGINA,
  });
  return Array.isArray(pagina['results']) ? (pagina['results'] as Bruto[]) : [];
}

/**
 * Todos os pagamentos da conta na janela, inclusive os sem pedido.
 *
 * É a diferença que importa em relação à primeira versão: aqui a pergunta é
 * "o que entrou na conta", não "o que os pedidos que eu conheço renderam".
 */
export async function pagamentosDaConta(
  cliente: MlClient,
  agora: Date = new Date(),
): Promise<PagamentoDoMl[]> {
  const desde = new Date(agora.getTime() - DIAS_DE_JANELA * 24 * 60 * 60 * 1000);
  // Um dia à frente cobre pagamento criado com o relógio adiantado do lado deles.
  const ate = new Date(agora.getTime() + 24 * 60 * 60 * 1000);

  const encontrados: PagamentoDoMl[] = [];
  for (let offset = 0; offset < MAX_POR_RODADA; offset += PAGINA) {
    const resultados = await buscarPagina(cliente, desde, ate, offset);
    if (resultados.length === 0) break;

    for (const bruto of resultados) {
      const p = normalizarPagamento(bruto);
      if (p) encontrados.push(p);
    }

    if (resultados.length < PAGINA) break;
  }
  return encontrados;
}

/** Atualiza os recebíveis de um vendedor. */
export async function sincronizarRecebiveis(uid: string): Promise<number> {
  const cliente = criarMlClient(uid, ML_CLIENT_ID.value(), ML_CLIENT_SECRET.value());
  const pagamentos = await pagamentosDaConta(cliente);

  const gravados = await db().collection(`users/${uid}/mlPayouts`).get();
  const anteriores = new Map<string, PagamentoDoMl>();
  for (const doc of gravados.docs) anteriores.set(doc.id, doc.data() as PagamentoDoMl);

  const agora = new Date();
  let atualizados = 0;

  for (const p of pagamentos) {
    // Já liberado e fora da carência não muda mais: poupa escrita à toa.
    if (jaResolvido(anteriores.get(p.paymentId), agora)) continue;

    await db()
      .doc(`users/${uid}/mlPayouts/${p.paymentId}`)
      .set({ ...p, atualizadoEm: Timestamp.now() }, { merge: false });
    atualizados++;
  }

  const pendentes = pagamentos.filter(p => p.situacaoMl !== 'released').length;

  await db()
    .doc(`users/${uid}/db/ml`)
    .set(
      { payoutsAt: Timestamp.now(), payoutsPending: pendentes },
      { merge: true },
    );

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
