/**
 * Métricas de eficiência do capital.
 *
 * O app media bem o RESULTADO (lucro, margem, receita) e mal a EFICIÊNCIA: não
 * dizia quantas vezes o estoque gira por ano, quantos dias ele ainda cobre, nem
 * quanto o capital investido devolveu. São as três perguntas que decidem a
 * próxima compra, e nenhuma delas se responde com margem.
 *
 * Margem diz quanto sobra POR VENDA. Giro diz quantas vendas o mesmo dinheiro
 * faz por ano. Um produto de 15% que gira seis vezes rende mais que um de 30%
 * que gira uma — e o painel só mostrava o segundo número.
 *
 * Módulo PURO: recebe o retrato calculado e devolve números. Sem signals, sem
 * consulta, sem formatação.
 */
import type { ComputedPurchase, ComputedSale } from './models/models';

/** Dias considerados na janela padrão. Um trimestre absorve sazonalidade curta. */
export const JANELA_PADRAO_DIAS = 90;

const DIAS_DO_ANO = 365;

export interface MetricasDeCapital {
  /**
   * Quantas vezes o estoque se renova por ano, no ritmo da janela.
   * `null` quando não há estoque parado — dividir por zero não é "infinito
   * giro", é ausência de base para a conta.
   */
  giroAnual: number | null;
  /**
   * Dias que o estoque atual ainda cobre, no ritmo da janela.
   * `null` quando não houve saída na janela: sem consumo não há prazo.
   */
  coberturaDias: number | null;
  /** Lucro líquido sobre tudo que já foi investido. `null` sem investimento. */
  roi: number | null;
  /** Custo das mercadorias vendidas na janela — a base das outras contas. */
  cmvDaJanela: number;
  /** Capital imobilizado hoje. */
  capitalParado: number;
}

/** Dia (YYYY-MM-DD) de `dias` atrás. */
function desde(dias: number, ref: Date): string {
  const d = new Date(ref);
  d.setDate(d.getDate() - dias);
  return d.toISOString().slice(0, 10);
}

/**
 * Giro, cobertura e ROI.
 *
 * O giro usa CMV sobre estoque — e não receita sobre estoque — de propósito:
 * as duas pontas precisam estar a preço de custo, senão a margem entra na conta
 * e infla o giro de quem vende caro. É o erro clássico dessa métrica.
 */
export function calcularMetricasDeCapital(
  lotes: readonly ComputedPurchase[],
  vendas: readonly ComputedSale[],
  janelaDias: number = JANELA_PADRAO_DIAS,
  ref: Date = new Date(),
): MetricasDeCapital {
  const corte = desde(janelaDias, ref);

  const cmvDaJanela = vendas
    .filter(v => v.countsAsRevenue && v.saleDate >= corte)
    .reduce((s, v) => s + v.proportionalCost, 0);

  const capitalParado = lotes
    .filter(l => l.currentStock > 0)
    .reduce((s, l) => s + l.idleValue, 0);

  const totalInvestido = lotes.reduce((s, l) => s + l.totalActualCost, 0);
  const lucro = vendas.filter(v => v.countsAsRevenue).reduce((s, v) => s + v.netProfit, 0);

  const cmvAnualizado = janelaDias > 0 ? cmvDaJanela * (DIAS_DO_ANO / janelaDias) : 0;
  const cmvDiario = janelaDias > 0 ? cmvDaJanela / janelaDias : 0;

  return {
    giroAnual: capitalParado > 0 ? cmvAnualizado / capitalParado : null,
    coberturaDias: cmvDiario > 0 ? capitalParado / cmvDiario : null,
    roi: totalInvestido > 0 ? lucro / totalInvestido : null,
    cmvDaJanela,
    capitalParado,
  };
}

/** Eficiência de um produto, para o ranking responder "onde ponho o próximo real". */
export interface EficienciaDoProduto {
  produto: string;
  /** Lucro líquido acumulado. */
  lucro: number;
  /** Capital que passou por este produto (custo das unidades vendidas + parado). */
  capital: number;
  /** lucro / capital. `null` sem capital. */
  roi: number | null;
  /**
   * Lucro por dia de capital empatado.
   *
   * Separa o produto que dá 30% em 90 dias do que dá 15% em 20 — e é essa
   * separação que a margem sozinha esconde. `null` sem dias medidos.
   */
  lucroPorDia: number | null;
}

/**
 * Eficiência por produto.
 *
 * `diasDeGiro` é o tempo médio entre a compra e a venda das unidades daquele
 * produto, tirado dos próprios lotes: é quanto tempo o dinheiro ficou preso.
 */
export function calcularEficiencia(
  lotes: readonly ComputedPurchase[],
  vendas: readonly ComputedSale[],
): EficienciaDoProduto[] {
  const porProduto = new Map<string, { lucro: number; capital: number; dias: number; lotes: number }>();

  const pega = (nome: string) => {
    const atual = porProduto.get(nome) ?? { lucro: 0, capital: 0, dias: 0, lotes: 0 };
    porProduto.set(nome, atual);
    return atual;
  };

  for (const v of vendas) {
    if (!v.countsAsRevenue) continue;
    const e = pega(v.product);
    e.lucro += v.netProfit;
    e.capital += v.proportionalCost;
  }

  for (const l of lotes) {
    const e = pega(l.product);
    // O que ainda está parado também é capital empatado neste produto.
    e.capital += l.idleValue;
    if (l.daysInStock > 0) {
      e.dias += l.daysInStock;
      e.lotes += 1;
    }
  }

  return [...porProduto.entries()]
    .map(([produto, e]) => {
      const diasMedios = e.lotes > 0 ? e.dias / e.lotes : 0;
      return {
        produto,
        lucro: e.lucro,
        capital: e.capital,
        roi: e.capital > 0 ? e.lucro / e.capital : null,
        lucroPorDia: diasMedios > 0 ? e.lucro / diasMedios : null,
      };
    })
    .sort((a, b) => (b.roi ?? -Infinity) - (a.roi ?? -Infinity));
}
