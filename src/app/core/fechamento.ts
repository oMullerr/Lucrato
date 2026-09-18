/**
 * Fechamento mensal.
 *
 * Todos os números do app são "ao vivo": os KPIs somam a história inteira e se
 * mexem a cada venda que entra. Isso responde "como vai o negócio", mas não
 * responde "quanto eu lucrei em março" — e é essa a pergunta de quem vai pagar
 * imposto, comparar meses ou entender por que a margem caiu.
 *
 * Módulo PURO. Recebe o retrato calculado e devolve o fechamento de um mês,
 * com o mês anterior ao lado para a comparação não exigir uma segunda visita.
 *
 * REGRA DE ATRIBUIÇÃO, e ela vem do motor de devoluções: uma devolução pertence
 * ao mês da VENDA ORIGINAL, não ao mês em que chegou. Sem isso, um março que já
 * foi fechado mudaria de valor em abril, e o fechamento deixaria de fechar.
 */
import type { ComputedPurchase, ComputedSale } from './models/models';

export interface LinhaDoFechamento {
  /** 'YYYY-MM'. */
  mes: string;
  /** Vendas que contam como receita no mês. */
  vendas: number;
  /** Unidades líquidas de devolução. */
  unidades: number;
  receitaBruta: number;
  comissao: number;
  frete: number;
  descontos: number;
  outrosCustos: number;
  receitaLiquida: number;
  /** Custo das mercadorias vendidas. */
  cmv: number;
  lucroLiquido: number;
  margem: number;
  ticketMedio: number;
  /** Prejuízo das devoluções atribuídas a este mês. Pode ser negativo. */
  perdaComDevolucoes: number;
  devolucoes: number;
  /** Compras feitas no mês — saída de caixa, não custo do resultado. */
  investido: number;
}

export interface Fechamento {
  atual: LinhaDoFechamento;
  /** `null` quando não há mês anterior com movimento. */
  anterior: LinhaDoFechamento | null;
}

/** 'YYYY-MM' de uma data ISO ('YYYY-MM-DD'), sem passar por `Date`. */
export function competencia(iso: string): string {
  return (iso ?? '').slice(0, 7);
}

/** Mês anterior a 'YYYY-MM'. */
export function mesAnterior(mes: string): string {
  const [a, m] = mes.split('-').map(Number);
  if (!a || !m) return '';
  return m === 1
    ? `${a - 1}-12`
    : `${a}-${String(m - 1).padStart(2, '0')}`;
}

const vazia = (mes: string): LinhaDoFechamento => ({
  mes,
  vendas: 0, unidades: 0,
  receitaBruta: 0, comissao: 0, frete: 0, descontos: 0, outrosCustos: 0,
  receitaLiquida: 0, cmv: 0, lucroLiquido: 0, margem: 0, ticketMedio: 0,
  perdaComDevolucoes: 0, devolucoes: 0, investido: 0,
});

/** Fecha um mês. */
export function fecharMes(
  mes: string,
  vendas: readonly ComputedSale[],
  lotes: readonly ComputedPurchase[],
): LinhaDoFechamento {
  const linha = vazia(mes);

  for (const v of vendas) {
    if (competencia(v.saleDate) !== mes) continue;

    /* A perda com devolução entra mesmo quando a venda deixou de contar como
       receita: uma venda totalmente devolvida some do faturamento mas o
       prejuízo dela é deste mês, e escondê-lo faria o fechamento mentir. */
    linha.perdaComDevolucoes += v.returnLoss;
    linha.devolucoes += v.returnCount;

    if (!v.countsAsRevenue) continue;

    linha.vendas += 1;
    linha.unidades += v.effectiveQuantity;
    linha.receitaBruta += v.grossRevenue;
    linha.comissao += v.feeAmount;
    // `shippingEffective` é negativo quando o frete sai do bolso do vendedor.
    linha.frete += -v.shippingEffective;
    linha.descontos += v.discountEffective;
    linha.outrosCustos += v.otherCostsEffective;
    linha.receitaLiquida += v.netRevenue;
    linha.cmv += v.proportionalCost;
    linha.lucroLiquido += v.netProfit;
  }

  for (const l of lotes) {
    if (competencia(l.purchaseDate) === mes) linha.investido += l.totalActualCost;
  }

  linha.margem = linha.receitaBruta > 0 ? linha.lucroLiquido / linha.receitaBruta : 0;
  linha.ticketMedio = linha.vendas > 0 ? linha.receitaBruta / linha.vendas : 0;
  return linha;
}

/** Fechamento de um mês, com o anterior ao lado quando houve movimento nele. */
export function fechar(
  mes: string,
  vendas: readonly ComputedSale[],
  lotes: readonly ComputedPurchase[],
): Fechamento {
  const anterior = fecharMes(mesAnterior(mes), vendas, lotes);
  return {
    atual: fecharMes(mes, vendas, lotes),
    // Mês sem venda e sem compra não serve de comparação — mostrar zero ao lado
    // faria toda variação parecer +100%.
    anterior: anterior.vendas > 0 || anterior.investido > 0 ? anterior : null,
  };
}

/** Meses com movimento, do mais recente para o mais antigo. */
export function mesesDisponiveis(
  vendas: readonly ComputedSale[],
  lotes: readonly ComputedPurchase[],
): string[] {
  const meses = new Set<string>();
  for (const v of vendas) {
    const c = competencia(v.saleDate);
    if (c) meses.add(c);
  }
  for (const l of lotes) {
    const c = competencia(l.purchaseDate);
    if (c) meses.add(c);
  }
  return [...meses].sort((a, b) => b.localeCompare(a));
}

/**
 * Variação percentual entre dois valores.
 *
 * `null` quando não há base de comparação: partir de zero não é "cresceu
 * infinito", e um "+∞%" num relatório financeiro é ruído, não informação.
 */
export function variacao(atual: number, anterior: number | undefined): number | null {
  if (anterior === undefined || anterior === 0) return null;
  return (atual - anterior) / Math.abs(anterior);
}
