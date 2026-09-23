/**
 * Fechamento mensal.
 *
 * O que estes testes protegem é a ATRIBUIÇÃO. Um fechamento que muda de valor
 * depois de fechado não é fechamento — e a tentação natural (contar a devolução
 * no mês em que ela chegou) faz exatamente isso: março mudaria em abril.
 *
 * A regra vem do motor de devoluções e é a mesma do resto do app: a devolução
 * pertence ao mês da VENDA ORIGINAL.
 */
import {
  competencia,
  fechar,
  fecharMes,
  mesAnterior,
  mesesDisponiveis,
  variacao,
} from './fechamento';
import type { ComputedPurchase, ComputedSale } from './models/models';

function venda(over: Partial<ComputedSale> = {}): ComputedSale {
  return {
    saleDate: '2026-03-10',
    countsAsRevenue: true,
    effectiveQuantity: 1,
    grossRevenue: 100,
    feeAmount: 12,
    shippingEffective: -8,
    shippingCostEffective: 8,
    shippingCreditEffective: 0,
    discountEffective: 0,
    otherCostsEffective: 0,
    netRevenue: 80,
    proportionalCost: 40,
    netProfit: 40,
    returnLoss: 0,
    returnCount: 0,
    ...over,
  } as ComputedSale;
}

function lote(over: Partial<ComputedPurchase> = {}): ComputedPurchase {
  return { purchaseDate: '2026-03-02', totalActualCost: 500, ...over } as ComputedPurchase;
}

describe('competencia', () => {
  it('recorta o mes sem passar por Date', () => {
    // Passar por `Date` empurraria o dia 1 para o mes anterior em fusos atras
    // de UTC — e o app inteiro e BRT.
    expect(competencia('2026-03-01')).toBe('2026-03');
    expect(competencia('2026-12-31')).toBe('2026-12');
  });

  it('entrada vazia nao estoura', () => {
    expect(competencia('')).toBe('');
    expect(competencia(undefined as unknown as string)).toBe('');
  });
});

describe('mes anterior', () => {
  it('atravessa o ano', () => {
    expect(mesAnterior('2026-01')).toBe('2025-12');
  });

  it('mantem o zero a esquerda', () => {
    expect(mesAnterior('2026-10')).toBe('2026-09');
    expect(mesAnterior('2026-02')).toBe('2026-01');
  });
});

describe('o que entra no mes', () => {
  it('soma so as vendas da competencia', () => {
    const vendas = [venda(), venda({ saleDate: '2026-04-02' })];
    const f = fecharMes('2026-03', vendas, []);
    expect(f.vendas).toBe(1);
    expect(f.receitaBruta).toBe(100);
  });

  it('frete sai do bolso: entra positivo no relatorio', () => {
    // `shippingEffective` e negativo quando o vendedor paga. O relatorio lista
    // CUSTOS, entao inverter o sinal aqui e o que faz a coluna somar.
    const f = fecharMes('2026-03', [venda({ shippingEffective: -8 })], []);
    expect(f.frete).toBe(8);
  });

  it('venda cancelada nao entra na receita', () => {
    const f = fecharMes('2026-03', [venda({ countsAsRevenue: false })], []);
    expect(f.vendas).toBe(0);
    expect(f.receitaBruta).toBe(0);
  });

  it('compra do mes entra como investido, nao como custo do resultado', () => {
    const f = fecharMes('2026-03', [venda()], [lote({ totalActualCost: 500 })]);
    expect(f.investido).toBe(500);
    // O custo do resultado e o CMV das unidades VENDIDAS, nao o que foi comprado.
    expect(f.cmv).toBe(40);
  });

  it('margem e ticket saem zerados sem receita, em vez de NaN', () => {
    const f = fecharMes('2026-03', [], []);
    expect(f.margem).toBe(0);
    expect(f.ticketMedio).toBe(0);
  });
});

describe('devolucao pertence ao mes da venda', () => {
  it('a perda entra no mes da VENDA, nao no da chegada', () => {
    // Se fosse pelo mes da chegada, um marco ja fechado mudaria em abril.
    const v = venda({ saleDate: '2026-03-10', returnLoss: 30, returnCount: 1 });
    expect(fecharMes('2026-03', [v], []).perdaComDevolucoes).toBe(30);
    expect(fecharMes('2026-04', [v], []).perdaComDevolucoes).toBe(0);
  });

  it('venda totalmente devolvida some do faturamento mas a perda fica', () => {
    // Esconder a perda porque a venda saiu da receita faria o fechamento mentir.
    const v = venda({ countsAsRevenue: false, returnLoss: 55, returnCount: 1 });
    const f = fecharMes('2026-03', [v], []);
    expect(f.receitaBruta).toBe(0);
    expect(f.perdaComDevolucoes).toBe(55);
    expect(f.devolucoes).toBe(1);
  });

  it('perda negativa passa sem clamp', () => {
    // Ressarcimento acima do que a venda renderia — o motor permite, e o
    // relatorio nao pode esconder um numero que fecha com o resto do app.
    const f = fecharMes('2026-03', [venda({ returnLoss: -12 })], []);
    expect(f.perdaComDevolucoes).toBe(-12);
  });
});

describe('comparacao com o mes anterior', () => {
  it('traz o anterior quando houve movimento', () => {
    const vendas = [venda({ saleDate: '2026-02-10' }), venda({ saleDate: '2026-03-10' })];
    const f = fechar('2026-03', vendas, []);
    expect(f.anterior?.mes).toBe('2026-02');
  });

  it('mes anterior vazio nao vira comparacao', () => {
    // Zero ao lado faria toda variacao parecer +100%.
    const f = fechar('2026-03', [venda({ saleDate: '2026-03-10' })], []);
    expect(f.anterior).toBeNull();
  });

  it('mes anterior so com compra ainda serve de comparacao', () => {
    const f = fechar('2026-03', [venda()], [lote({ purchaseDate: '2026-02-05' })]);
    expect(f.anterior?.investido).toBe(500);
  });
});

describe('variacao', () => {
  it('calcula a diferenca relativa', () => {
    expect(variacao(150, 100)).toBeCloseTo(0.5, 6);
    expect(variacao(50, 100)).toBeCloseTo(-0.5, 6);
  });

  it('usa o modulo da base: queda a partir de prejuizo nao inverte o sinal', () => {
    // De -100 para -50 e MELHORA. Sem o modulo, sairia -0,5.
    expect(variacao(-50, -100)).toBeCloseTo(0.5, 6);
  });

  it('sem base, nao inventa numero', () => {
    expect(variacao(100, 0)).toBeNull();
    expect(variacao(100, undefined)).toBeNull();
  });
});

describe('meses disponiveis', () => {
  it('lista do mais recente para o mais antigo, sem repetir', () => {
    const vendas = [
      venda({ saleDate: '2026-03-01' }),
      venda({ saleDate: '2026-03-20' }),
      venda({ saleDate: '2026-01-15' }),
    ];
    expect(mesesDisponiveis(vendas, [lote({ purchaseDate: '2026-02-02' })])).toEqual([
      '2026-03', '2026-02', '2026-01',
    ]);
  });

  it('base vazia devolve lista vazia', () => {
    expect(mesesDisponiveis([], [])).toEqual([]);
  });
});
