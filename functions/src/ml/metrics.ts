/**
 * Métricas dos anúncios: visitas e reputação.
 *
 * Visita é o outro lado da conversão. Sozinho, o número de vendas não diz se um
 * anúncio vende pouco por falta de audiência ou por falta de conversão — e a
 * decisão é diferente em cada caso.
 *
 * A API de visitas não tem multiget amplo (a própria documentação avisa), então
 * é uma chamada por anúncio. Por isso este trabalho roda uma vez por dia e
 * apenas sobre os anúncios ativos, e não junto do poller de 15 minutos.
 */
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';

import { ML_CLIENT_ID, ML_CLIENT_SECRET } from '../config';
import { criarMlClient, MlClient } from './client';

type Bruto = Record<string, unknown>;

const texto = (v: unknown): string => (typeof v === 'string' ? v : '');
const numero = (v: unknown): number => (typeof v === 'number' && isFinite(v) ? v : 0);

/** Janela de análise. A API guarda no máximo 150 dias. */
const DIAS = 30;
/** Teto por rodada: uma chamada por anúncio custa caro em rate limit. */
const MAX_ANUNCIOS = 300;

const db = () => getFirestore();

/** Reputação do vendedor, do jeito que a tela mostra. */
export interface ReputacaoResumida {
  levelId: string;
  powerSellerStatus: string;
  completed: number;
  canceled: number;
  claimsRate: number;
  delayedRate: number;
}

export function normalizarReputacao(usuario: Bruto): ReputacaoResumida {
  const rep = (usuario['seller_reputation'] ?? {}) as Bruto;
  const transacoes = (rep['transactions'] ?? {}) as Bruto;
  const metricas = (rep['metrics'] ?? {}) as Bruto;
  const claims = (metricas['claims'] ?? {}) as Bruto;
  const atrasos = (metricas['delayed_handling_time'] ?? {}) as Bruto;

  return {
    levelId: texto(rep['level_id']),
    powerSellerStatus: texto(rep['power_seller_status']),
    completed: numero(transacoes['completed']),
    canceled: numero(transacoes['canceled']),
    claimsRate: numero(claims['rate']),
    delayedRate: numero(atrasos['rate']),
  };
}

/** Visitas de um anúncio na janela. Falha de um não derruba os outros. */
export async function visitasDoAnuncio(
  cliente: MlClient,
  itemId: string,
  dias = DIAS,
): Promise<number | null> {
  const r = await cliente
    .get<Bruto>(`/items/${itemId}/visits/time_window`, { last: dias, unit: 'day' })
    .catch(() => null);
  return r ? numero(r['total_visits']) : null;
}

/** Atualiza visitas e reputação de um vendedor. */
export async function atualizarMetricas(uid: string, mlUserId: string): Promise<number> {
  const cliente = criarMlClient(uid, ML_CLIENT_ID.value(), ML_CLIENT_SECRET.value());

  // Anúncio pausado ou encerrado não recebe visita nova; medir seria gastar
  // rate limit para confirmar zero.
  const ativos = await db()
    .collection(`users/${uid}/mlItems`)
    .where('status', '==', 'active')
    .limit(MAX_ANUNCIOS)
    .get();

  let medidos = 0;
  for (const doc of ativos.docs) {
    const visitas = await visitasDoAnuncio(cliente, doc.id);
    if (visitas === null) continue;
    await doc.ref.set(
      { visits30d: visitas, visitsUpdatedAt: Timestamp.now() },
      { merge: true },
    );
    medidos++;
  }

  const usuario = await cliente.get<Bruto>(`/users/${mlUserId}`).catch(() => null);
  await db()
    .doc(`users/${uid}/db/ml`)
    .set(
      {
        ...(usuario ? { reputation: normalizarReputacao(usuario) } : {}),
        metricsAt: Timestamp.now(),
        metricsItems: medidos,
      },
      { merge: true },
    );

  return medidos;
}

/** Atualização sob demanda, pelo botão da tela de anúncios. */
export const mlSyncMetrics = onCall(
  {
    enforceAppCheck: false,
    secrets: [ML_CLIENT_ID, ML_CLIENT_SECRET],
    timeoutSeconds: 540,
    memory: '512MiB',
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Faça login para atualizar as métricas.');
    }
    const uid = request.auth.uid;

    const segredo = await db().doc(`users/${uid}/secret/ml`).get();
    const mlUserId = segredo.exists ? String(segredo.get('mlUserId') ?? '') : '';
    if (!mlUserId) {
      throw new HttpsError('failed-precondition', 'Conecte a conta do Mercado Livre primeiro.');
    }

    try {
      const total = await atualizarMetricas(uid, mlUserId);
      logger.info('Métricas atualizadas', { uid, total });
      return { total };
    } catch (err) {
      const motivo = String((err as Error).message);
      logger.error('Falha ao atualizar métricas', { uid, motivo });
      if (motivo === 'reconexao_necessaria') {
        throw new HttpsError('failed-precondition', 'Reconecte a conta do Mercado Livre.');
      }
      throw new HttpsError('internal', 'Não deu para atualizar as métricas agora.');
    }
  },
);

/** Uma vez por dia basta: visita é métrica de tendência, não de tempo real. */
export const mlMetricsDaily = onSchedule(
  {
    schedule: 'every day 06:00',
    timeZone: 'America/Sao_Paulo',
    secrets: [ML_CLIENT_ID, ML_CLIENT_SECRET],
    timeoutSeconds: 540,
    memory: '512MiB',
  },
  async () => {
    const conectados = await db().collection('mlIndex').get();

    for (const doc of conectados.docs) {
      const uid = String(doc.get('uid') ?? '');
      if (!uid) continue;
      try {
        const total = await atualizarMetricas(uid, doc.id);
        logger.info('Métricas diárias', { uid, total });
      } catch (err) {
        // Uma conta com problema não pode derrubar as outras.
        logger.warn('Métricas falharam para um vendedor', {
          uid,
          motivo: String((err as Error).message),
        });
      }
    }
  },
);
