/**
 * Intervalo mínimo entre execuções caras, conferido no SERVIDOR.
 *
 * `mlBackfill` (540s de timeout, até 3.000 pedidos) e `mlSyncItems` (540s, até
 * 5.000 anúncios) tinham como única trava o sinal `working` do navegador — que
 * some num F5. Recarregar a página e clicar de novo disparava outra varredura
 * por cima da anterior, e as duas competiam pelo mesmo rate limit do Mercado
 * Livre, que bloqueia por IP quem exagera.
 *
 * Não é controle de acesso (o porteiro continua sendo o token do Firebase
 * Auth): é conta de luz e respeito ao limite da plataforma. Por isso a marca
 * fica no documento público `db/ml`, que o app já lê — assim a tela pode um dia
 * dizer "espere mais N minutos" em vez de só recusar.
 */
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';

/** Operações que pagam pedágio, e quanto. */
export const INTERVALOS_MS = {
  backfill: 10 * 60 * 1000,
  syncItems: 5 * 60 * 1000,
  syncMetrics: 30 * 60 * 1000,
  syncBilling: 5 * 60 * 1000,
  syncPayouts: 5 * 60 * 1000,
} as const;

export type OperacaoLimitada = keyof typeof INTERVALOS_MS;

/** Campo em `db/ml` onde a última execução fica marcada. */
const campo = (op: OperacaoLimitada) => `ultimaExecucao_${op}`;

/**
 * Decide se a operação pode rodar agora. Puro, para ser testável sem Firestore.
 *
 * Marca ausente ou no futuro (relógio corrigido para trás, migração de dado)
 * LIBERA: travar o dono por causa de um carimbo estranho é pior que deixar
 * rodar uma vez a mais.
 */
export function podeExecutar(
  ultimaMs: number | null | undefined,
  intervaloMs: number,
  agoraMs: number,
): { ok: true } | { ok: false; faltamMs: number } {
  if (!ultimaMs || ultimaMs > agoraMs) return { ok: true };
  const decorrido = agoraMs - ultimaMs;
  if (decorrido >= intervaloMs) return { ok: true };
  return { ok: false, faltamMs: intervaloMs - decorrido };
}

/** Minutos que faltam, arredondados para cima — zero minuto não é espera. */
export function minutosDeEspera(faltamMs: number): number {
  return Math.max(1, Math.ceil(faltamMs / 60_000));
}

/**
 * Cobra o pedágio e marca a execução. Lança `resource-exhausted` se for cedo.
 *
 * A marca é gravada ANTES do trabalho começar, de propósito: marcar no fim
 * deixaria a janela inteira da varredura (que pode durar nove minutos) livre
 * para uma segunda chamada entrar por baixo.
 */
export async function cobrarIntervalo(uid: string, op: OperacaoLimitada): Promise<void> {
  const ref = getFirestore().doc(`users/${uid}/db/ml`);
  const snap = await ref.get();
  const ultima = snap.exists ? (snap.get(campo(op)) as Timestamp | undefined) : undefined;

  const veredito = podeExecutar(ultima?.toMillis(), INTERVALOS_MS[op], Date.now());
  if (!veredito.ok) {
    throw new HttpsError(
      'resource-exhausted',
      `Esta sincronização acabou de rodar. Tente de novo em ${minutosDeEspera(veredito.faltamMs)} min.`,
    );
  }

  await ref.set({ [campo(op)]: Timestamp.now() }, { merge: true });
}
