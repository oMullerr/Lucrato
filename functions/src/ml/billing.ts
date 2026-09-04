/**
 * Faturamento do Mercado Livre.
 *
 * A comissão que chega no pedido (`sale_fee`) é o que o Mercado Livre pretende
 * cobrar. A fatura é o que ele cobrou de fato — e entre as duas cabem campanha
 * comercial, bonificação por devolução, publicidade e taxa de parcelamento.
 * Sem a fatura, a diferença some sem ninguém perceber.
 *
 * A documentação é enfática sobre como consumir estes endpoints: são recursos
 * de conciliação fiscal, não fonte operacional. Daí três decisões aqui:
 *   - uma consulta por vendedor por dia, nunca em lote paralelo;
 *   - paginação por `from_id` (o próprio `offset` duplica linha acima de 10 mil);
 *   - período fechado não é reconsultado — só o aberto muda durante o dia.
 */
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';

import type { DetalheBruto, PeriodoDeFaturamento } from '../../../src/app/core/ml/billing';
import { VERSAO_AGREGACAO, agregarPeriodo } from '../../../src/app/core/ml/billing';
import { ML_CLIENT_ID, ML_CLIENT_SECRET } from '../config';
import { criarMlClient, MlClient } from './client';

type Bruto = Record<string, unknown>;

const texto = (v: unknown): string => (v === null || v === undefined ? '' : String(v));
const numero = (v: unknown): number => {
  const n = typeof v === 'number' ? v : Number(v);
  return isFinite(n) ? n : 0;
};

/** Grupo de faturamento do Mercado Livre (o outro é MP, do Mercado Pago). */
const GRUPO = 'ML';
/** Máximo que a API aceita por página. */
const PAGINA = 1000;
/** Teto de linhas por período: acima disso os totais valem, o detalhe não. */
const MAX_DETALHES = 5_000;
/** A API entrega no máximo 12 períodos. */
const MAX_PERIODOS = 12;
/**
 * Pausa entre períodos.
 *
 * Medido na conta real: doze chamadas seguidas ao `/details` derrubam a
 * varredura no sexto período com 429, e o bloqueio é por IP — insistir com
 * backoff curto não passa. A documentação pede consumo sequencial; esta pausa
 * é o que "sequencial" quer dizer na prática.
 */
const PAUSA_ENTRE_PERIODOS_MS = 1_500;

const db = () => getFirestore();

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Um período como o `/monthly/periods` devolve, já limpo. */
interface PeriodoBruto {
  key: string;
  dateFrom: string;
  dateTo: string;
  status: 'OPEN' | 'CLOSED';
  totalMl: number;
}

/** O ciclo do Mercado Livre não é o mês civil: pode ir de 19/02 a 18/03. */
export function normalizarPeriodo(bruto: Bruto): PeriodoBruto | null {
  const key = texto(bruto['key']).slice(0, 10);
  if (!key) return null;

  const janela = (bruto['period'] ?? {}) as Bruto;
  const status = texto(bruto['period_status']).toUpperCase() === 'OPEN' ? 'OPEN' : 'CLOSED';

  return {
    key,
    dateFrom: texto(janela['date_from']).slice(0, 10),
    dateTo: texto(janela['date_to']).slice(0, 10),
    status,
    totalMl: numero(bruto['amount']),
  };
}

/**
 * Uma linha do detalhe, achatada.
 *
 * `sales_info` e `items_info` são listas porque uma cobrança pode se referir a
 * mais de uma venda; para conciliar basta o primeiro pedido, que é quem a
 * cobrança debita.
 */
export function normalizarDetalhe(bruto: Bruto): DetalheBruto | null {
  const cobranca = (bruto['charge_info'] ?? {}) as Bruto;
  const detailId = numero(cobranca['detail_id']);
  if (!detailId) return null;

  const vendas = Array.isArray(bruto['sales_info']) ? (bruto['sales_info'] as Bruto[]) : [];
  const tipo = texto(cobranca['detail_type']).toUpperCase() === 'BONUS' ? 'BONUS' : 'CHARGE';

  return {
    detailId,
    subTipo: texto(cobranca['detail_sub_type']),
    tipo,
    rotulo: texto(cobranca['transaction_detail']),
    valor: Math.abs(numero(cobranca['detail_amount'])),
    orderId: vendas.length > 0 ? texto(vendas[0]['order_id']) : '',
  };
}

/** Períodos que o Mercado Livre ainda entrega, do mais recente para o mais antigo. */
export async function buscarPeriodos(cliente: MlClient): Promise<PeriodoBruto[]> {
  const r = await cliente.get<Bruto>('/billing/integration/monthly/periods', {
    group: GRUPO,
    document_type: 'BILL',
    limit: MAX_PERIODOS,
  });

  const resultados = Array.isArray(r['results']) ? (r['results'] as Bruto[]) : [];
  return resultados
    .map(normalizarPeriodo)
    .filter((p): p is PeriodoBruto => p !== null)
    .sort((a, b) => b.key.localeCompare(a.key));
}

/**
 * Detalhe de um período inteiro.
 *
 * Pagina por `from_id` e não por `offset`: a documentação avisa que só o
 * primeiro garante integridade em listagens longas, e que `offset` para em
 * 10 mil. Devolve também se a coleta foi truncada, para a tela não apresentar
 * um detalhe incompleto como se fosse completo.
 */
export async function buscarDetalhes(
  cliente: MlClient,
  key: string,
): Promise<{ detalhes: DetalheBruto[]; truncado: boolean }> {
  const detalhes: DetalheBruto[] = [];
  let fromId = 0;

  while (detalhes.length < MAX_DETALHES) {
    const pagina = await cliente.get<Bruto>(
      `/billing/integration/periods/key/${key}/group/${GRUPO}/details`,
      {
        document_type: 'BILL',
        limit: PAGINA,
        from_id: fromId,
        sort_by: 'ID',
        order_by: 'ASC',
      },
    );

    const resultados = Array.isArray(pagina['results']) ? (pagina['results'] as Bruto[]) : [];
    if (resultados.length === 0) break;

    for (const linha of resultados) {
      const d = normalizarDetalhe(linha);
      if (d) detalhes.push(d);
    }

    const ultimo = numero(pagina['last_id']);
    // Sem um cursor que avança, continuar seria repetir a mesma página para
    // sempre. Parar é a única saída segura.
    if (!ultimo || ultimo === fromId) break;
    fromId = ultimo;

    if (resultados.length < PAGINA) break;
  }

  return { detalhes, truncado: detalhes.length >= MAX_DETALHES };
}

/** Guarda o que já foi coletado. `null` quando o período ainda não existe aqui. */
async function periodoGravado(uid: string, key: string): Promise<PeriodoDeFaturamento | null> {
  const snap = await db().doc(`users/${uid}/mlBilling/${key}`).get();
  return snap.exists ? (snap.data() as PeriodoDeFaturamento) : null;
}

/**
 * Sincroniza os períodos de faturamento de um vendedor.
 *
 * Período fechado que já foi coletado é pulado: ele não muda, e reconsultá-lo
 * é justamente o uso que a documentação aponta como causa de 429. O mais
 * recente é a exceção — ainda pode receber uma bonificação atrasada.
 *
 * A varredura é retomável de propósito. Se o Mercado Livre bloquear no meio,
 * o que já veio fica gravado e a próxima rodada continua de onde parou, em vez
 * de recomeçar do zero e bater na mesma parede.
 */
export async function sincronizarFaturamento(
  uid: string,
  completo = false,
): Promise<{ total: number; faltam: number }> {
  const cliente = criarMlClient(uid, ML_CLIENT_ID.value(), ML_CLIENT_SECRET.value());
  const periodos = await buscarPeriodos(cliente);

  // Os fechados vêm depois do aberto; o primeiro fechado é o que ainda recebe
  // ajuste, então ele é reconsultado mesmo quando já está gravado.
  const maisRecenteFechado = periodos.find(p => p.status === 'CLOSED')?.key ?? '';

  const pendentes: PeriodoBruto[] = [];
  for (const p of periodos) {
    const gravado = await periodoGravado(uid, p.key);
    const jaTemos =
      gravado !== null &&
      gravado.status === 'CLOSED' &&
      p.status === 'CLOSED' &&
      // Agregação de uma versão anterior está desatualizada: os baldes foram
      // somados com uma classificação que não é mais a nossa.
      gravado.versao === VERSAO_AGREGACAO;
    const revisar = completo || p.key === maisRecenteFechado;
    if (jaTemos && !revisar) continue;
    pendentes.push(p);
  }

  let atualizados = 0;
  let bloqueado = false;

  for (const p of pendentes) {
    if (atualizados > 0) await dormir(PAUSA_ENTRE_PERIODOS_MS);

    try {
      const { detalhes, truncado } = await buscarDetalhes(cliente, p.key);
      const agregado = agregarPeriodo(p, detalhes, truncado);

      await db()
        .doc(`users/${uid}/mlBilling/${p.key}`)
        .set({ ...agregado, atualizadoEm: Timestamp.now() }, { merge: false });

      atualizados++;
    } catch (err) {
      const motivo = String((err as Error).message);
      // Bloqueio preventivo por IP: parar e voltar depois é o comportamento
      // que a documentação pede. Continuar a varredura só aprofundaria o bloqueio.
      if (motivo.startsWith('ml_api_429')) {
        logger.warn('Mercado Livre bloqueou a varredura do faturamento', {
          uid,
          periodo: p.key,
          coletados: atualizados,
        });
        bloqueado = true;
        break;
      }
      throw err;
    }
  }

  const faltam = bloqueado ? pendentes.length - atualizados : 0;

  await db()
    .doc(`users/${uid}/db/ml`)
    .set(
      {
        billingAt: Timestamp.now(),
        billingPeriods: periodos.length,
        billingPending: faltam,
      },
      { merge: true },
    );

  return { total: atualizados, faltam };
}

async function mlUserIdDe(uid: string): Promise<string> {
  const segredo = await db().doc(`users/${uid}/secret/ml`).get();
  return segredo.exists ? texto(segredo.get('mlUserId')) : '';
}

/** Atualização sob demanda, pelo botão da tela. Reconsulta os 12 períodos. */
export const mlSyncBilling = onCall(
  {
    enforceAppCheck: false,
    secrets: [ML_CLIENT_ID, ML_CLIENT_SECRET],
    timeoutSeconds: 540,
    memory: '512MiB',
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Faça login para conferir o faturamento.');
    }
    const uid = request.auth.uid;

    if (!(await mlUserIdDe(uid))) {
      throw new HttpsError('failed-precondition', 'Conecte a conta do Mercado Livre primeiro.');
    }

    try {
      const { total, faltam } = await sincronizarFaturamento(uid, true);
      logger.info('Faturamento sincronizado', { uid, total, faltam });
      return { total, faltam };
    } catch (err) {
      const motivo = String((err as Error).message);
      logger.error('Falha ao sincronizar faturamento', { uid, motivo });
      if (motivo === 'reconexao_necessaria') {
        throw new HttpsError('failed-precondition', 'Reconecte a conta do Mercado Livre.');
      }
      throw new HttpsError('internal', 'Não deu para trazer o faturamento agora.');
    }
  },
);

/**
 * Uma vez por dia, como a documentação pede.
 *
 * Roda depois das métricas para as duas não disputarem o mesmo rate limit no
 * mesmo minuto.
 */
export const mlBillingDaily = onSchedule(
  {
    schedule: 'every day 06:30',
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
        const { total, faltam } = await sincronizarFaturamento(uid, false);
        if (total > 0) logger.info('Faturamento diário', { uid, total, faltam });
      } catch (err) {
        // Uma conta com problema não pode derrubar as outras.
        logger.warn('Faturamento falhou para um vendedor', {
          uid,
          motivo: String((err as Error).message),
        });
      }
    }
  },
);
