/**
 * Giro, cobertura e ROI.
 *
 * O erro clássico desta métrica é medir giro com RECEITA sobre estoque: as duas
 * pontas ficam em moedas diferentes (uma com margem embutida, outra a custo) e
 * quem vende caro parece girar mais. Há teste cravando que a conta usa CMV.
 *
 * O resto dos casos é sobre divisão por zero — que aqui nunca pode virar
 * `Infinity` nem `0`. Estoque zerado não é "giro infinito", é ausência de base;
 * e um zero silencioso num painel financeiro é pior que um traço.
 */
import {
  calcularEficiencia,
  calcularMetricasDeCapital,
  JANELA_PADRAO_DIAS,
} from './metricas';
import type { ComputedPurchase, ComputedSale } from './models/models';

const HOJE = new Date('2026-09-18T12:00:00Z');

function lote(over: Partial<ComputedPurchase> = {}): ComputedPurchase {
  return {
    product: 'Furadeira',
    currentStock: 0,
    idleValue: 0,
    totalActualCost: 0,
    daysInStock: 0,
    ...over,
  } as ComputedPurchase;
}

function venda(over: Partial<ComputedSale> = {}): ComputedSale {
  return {
    product: 'Furadeira',
    countsAsRevenue: true,
    saleDate: '2026-09-01',
    proportionalCost: 0,
    netProfit: 0,
    ...over,
  } as ComputedSale;
}

describe('giro', () => {
  it('usa CMV sobre estoque, nao receita sobre estoque', () => {
    // 1000 de custo em 90 dias => 4055,55/ano sobre 1000 parados => ~4,06x.
    // Se a conta usasse receita, o numero subiria com a margem — o erro classico.
    const lotes = [lote({ currentStock: 5, idleValue: 1000, totalActualCost: 2000 })];
    const vendas = [venda({ proportionalCost: 1000, netProfit: 9999 })];

    const m = calcularMetricasDeCapital(lotes, vendas, 90, HOJE);

    expect(m.cmvDaJanela).toBe(1000);
    expect(m.giroAnual).toBeCloseTo((1000 * 365) / 90 / 1000, 4);
  });

  it('estoque zerado devolve null, nao infinito', () => {
    const vendas = [venda({ proportionalCost: 500 })];
    expect(calcularMetricasDeCapital([], vendas, 90, HOJE).giroAnual).toBeNull();
  });

  it('venda fora da janela nao entra no CMV', () => {
    const lotes = [lote({ currentStock: 1, idleValue: 100 })];
    const antiga = venda({ saleDate: '2025-01-10', proportionalCost: 900 });
    expect(calcularMetricasDeCapital(lotes, [antiga], 90, HOJE).cmvDaJanela).toBe(0);
  });

  it('venda cancelada nao conta como saida de estoque', () => {
    const lotes = [lote({ currentStock: 1, idleValue: 100 })];
    const cancelada = venda({ countsAsRevenue: false, proportionalCost: 900 });
    expect(calcularMetricasDeCapital(lotes, [cancelada], 90, HOJE).cmvDaJanela).toBe(0);
  });
});

describe('cobertura', () => {
  it('diz quantos dias o estoque atual ainda aguenta', () => {
    // 900 de CMV em 90 dias = 10/dia. 300 parados => 30 dias.
    const lotes = [lote({ currentStock: 3, idleValue: 300 })];
    const vendas = [venda({ proportionalCost: 900 })];
    expect(calcularMetricasDeCapital(lotes, vendas, 90, HOJE).coberturaDias).toBeCloseTo(30, 4);
  });

  it('sem saida na janela nao ha prazo a informar', () => {
    const lotes = [lote({ currentStock: 3, idleValue: 300 })];
    expect(calcularMetricasDeCapital(lotes, [], 90, HOJE).coberturaDias).toBeNull();
  });

  it('cobertura e o inverso do giro, em dias', () => {
    const lotes = [lote({ currentStock: 5, idleValue: 500 })];
    const vendas = [venda({ proportionalCost: 750 })];
    const m = calcularMetricasDeCapital(lotes, vendas, 90, HOJE);
    expect(m.coberturaDias).toBeCloseTo(365 / m.giroAnual!, 4);
  });
});

describe('ROI', () => {
  it('lucro sobre tudo que ja foi investido', () => {
    const lotes = [lote({ totalActualCost: 1000 }), lote({ totalActualCost: 1000 })];
    const vendas = [venda({ netProfit: 400 })];
    expect(calcularMetricasDeCapital(lotes, vendas, 90, HOJE).roi).toBeCloseTo(0.2, 4);
  });

  it('sem investimento nao ha retorno a calcular', () => {
    expect(calcularMetricasDeCapital([], [], 90, HOJE).roi).toBeNull();
  });

  it('prejuizo devolve ROI negativo, sem clamp', () => {
    const lotes = [lote({ totalActualCost: 1000 })];
    const vendas = [venda({ netProfit: -250 })];
    expect(calcularMetricasDeCapital(lotes, vendas, 90, HOJE).roi).toBeCloseTo(-0.25, 4);
  });

  it('ROI acumulado ignora a janela — e historia inteira, nao ritmo', () => {
    const lotes = [lote({ totalActualCost: 1000 })];
    const antiga = venda({ saleDate: '2024-02-02', netProfit: 300 });
    expect(calcularMetricasDeCapital(lotes, [antiga], 90, HOJE).roi).toBeCloseTo(0.3, 4);
  });
});

describe('eficiencia por produto', () => {
  it('ordena por ROI, do melhor para o pior', () => {
    const lotes = [
      lote({ product: 'A', daysInStock: 30 }),
      lote({ product: 'B', daysInStock: 30 }),
    ];
    const vendas = [
      venda({ product: 'A', proportionalCost: 100, netProfit: 50 }),  // 50%
      venda({ product: 'B', proportionalCost: 100, netProfit: 10 }),  // 10%
    ];
    expect(calcularEficiencia(lotes, vendas).map(e => e.produto)).toEqual(['A', 'B']);
  });

  it('capital inclui o que ainda esta parado', () => {
    const lotes = [lote({ product: 'A', idleValue: 400, daysInStock: 10 })];
    const vendas = [venda({ product: 'A', proportionalCost: 100, netProfit: 50 })];
    const [e] = calcularEficiencia(lotes, vendas);
    expect(e.capital).toBe(500);
    expect(e.roi).toBeCloseTo(0.1, 4);
  });

  it('lucro por dia separa margem alta lenta de margem baixa rapida', () => {
    // A: 30 de lucro em 90 dias = 0,33/dia. B: 15 em 20 dias = 0,75/dia.
    // Pela margem, A ganharia; pelo dinheiro parado, B rende mais que o dobro.
    const lotes = [
      lote({ product: 'A', daysInStock: 90 }),
      lote({ product: 'B', daysInStock: 20 }),
    ];
    const vendas = [
      venda({ product: 'A', proportionalCost: 100, netProfit: 30 }),
      venda({ product: 'B', proportionalCost: 100, netProfit: 15 }),
    ];
    const porNome = new Map(calcularEficiencia(lotes, vendas).map(e => [e.produto, e]));
    expect(porNome.get('A')!.lucroPorDia).toBeCloseTo(30 / 90, 4);
    expect(porNome.get('B')!.lucroPorDia).toBeCloseTo(15 / 20, 4);
    expect(porNome.get('B')!.lucroPorDia!).toBeGreaterThan(porNome.get('A')!.lucroPorDia!);
  });

  it('produto sem dias medidos nao inventa lucro por dia', () => {
    const lotes = [lote({ product: 'A', daysInStock: 0 })];
    const vendas = [venda({ product: 'A', proportionalCost: 100, netProfit: 50 })];
    expect(calcularEficiencia(lotes, vendas)[0].lucroPorDia).toBeNull();
  });
});

describe('janela padrao', () => {
  it('e um trimestre, para absorver sazonalidade curta', () => {
    expect(JANELA_PADRAO_DIAS).toBe(90);
  });
});
