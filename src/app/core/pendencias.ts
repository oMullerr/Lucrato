/**
 * O que está pedindo decisão, somado de todos os cantos do app.
 *
 * O Lucrato sabia de tudo isto — só não dizia em lugar nenhum. O alerta de
 * estoque parado ficava no fim da tela de Estoque, a venda capturada esperava
 * na Caixa do ML, a divergência de fatura morava em Faturamento e o teto do MEI
 * em Fiscal. Quem abre o app de manhã não visita cinco telas para descobrir se
 * há algo a fazer: abre uma, e ou há pauta ou não há.
 *
 * Módulo PURO de propósito. Recebe o retrato já calculado e devolve a lista
 * ordenada por gravidade; nenhuma consulta, nenhum signal, nenhum ícone. A tela
 * decide como desenhar, e este arquivo decide o que MERECE aparecer — que é a
 * parte que precisa de teste.
 */
import type { ComputedPurchase, ComputedReturn } from './models/models';
import type { Severidade } from './ml/alerts';

export type TipoPendencia =
  | 'ml_reconectar'
  | 'caixa_esperando'
  | 'estoque_parado'
  | 'devolucao_aberta'
  | 'mei_teto';

export interface Pendencia {
  tipo: TipoPendencia;
  severidade: Severidade;
  /** Números que a mensagem usa. */
  dados: Record<string, string | number>;
}

/** Retrato que a tela entrega; tudo já calculado em outro lugar. */
export interface RetratoDoNegocio {
  /** Conta do ML precisa ser reconectada. */
  precisaReconectar: boolean;
  /** Itens da caixa esperando decisão, e quanto somam. */
  caixaEsperando: number;
  caixaValor: number;
  lotes: readonly ComputedPurchase[];
  devolucoes: readonly ComputedReturn[];
  /** Banda do teto fiscal do ano corrente; `null` quando não há regime. */
  bandaFiscal: 'ok' | 'warning' | 'danger' | 'over' | null;
  /** Percentual do teto já usado (0–1+), para a mensagem. */
  usoDoTeto: number;
}

const ORDEM: Record<Severidade, number> = { alta: 0, media: 1, baixa: 2 };

/**
 * Monta a pauta.
 *
 * Regra de corte, a mesma do motor de alertas dos anúncios: entra o que aponta
 * para uma AÇÃO. Número que só informa é KPI, e KPI já tem tela. Por isso não
 * há "você vendeu X este mês" aqui — não há o que fazer com isso às 8h.
 */
export function montarPendencias(r: RetratoDoNegocio): Pendencia[] {
  const lista: Pendencia[] = [];

  /* Reconectar vem primeiro entre as graves: enquanto a autorização está
     vencida, TODAS as outras contas envelhecem em silêncio. */
  if (r.precisaReconectar) {
    lista.push({ tipo: 'ml_reconectar', severidade: 'alta', dados: {} });
  }

  if (r.caixaEsperando > 0) {
    lista.push({
      tipo: 'caixa_esperando',
      /* Faturamento que ainda não entrou no razão desequilibra lucro, teto do
         MEI e fluxo de caixa ao mesmo tempo. Nunca é aviso de rodapé. */
      severidade: 'alta',
      dados: { total: r.caixaEsperando, valor: r.caixaValor },
    });
  }

  const parados = r.lotes.filter(l => l.status === 'Parado');
  if (parados.length > 0) {
    lista.push({
      tipo: 'estoque_parado',
      severidade: 'media',
      dados: {
        total: parados.length,
        valor: parados.reduce((s, l) => s + l.idleValue, 0),
      },
    });
  }

  const abertas = r.devolucoes.filter(d => d.status === 'Solicitado');
  if (abertas.length > 0) {
    lista.push({
      tipo: 'devolucao_aberta',
      severidade: 'media',
      dados: {
        total: abertas.length,
        valor: abertas.reduce((s, d) => s + d.returnedRevenue, 0),
      },
    });
  }

  /* 'ok' não vira pendência: estar dentro do teto é o esperado, e um aviso
     verde todo dia treina a pessoa a ignorar a lista inteira. */
  if (r.bandaFiscal && r.bandaFiscal !== 'ok') {
    lista.push({
      tipo: 'mei_teto',
      severidade: r.bandaFiscal === 'warning' ? 'media' : 'alta',
      dados: { pct: Math.round(r.usoDoTeto * 100) },
    });
  }

  return lista.sort((a, b) => ORDEM[a.severidade] - ORDEM[b.severidade]);
}
