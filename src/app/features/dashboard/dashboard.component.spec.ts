jest.mock('@angular/fire/firestore', () => ({
  Firestore: class Firestore {},
  doc: jest.fn(),
  setDoc: jest.fn(),
  onSnapshot: jest.fn(),
}));

// ng2-charts é ESM (lodash-es) e só é usado no template — nunca renderizado aqui.
jest.mock('ng2-charts', () => ({ BaseChartDirective: class BaseChartDirective {} }));

import { TestBed } from '@angular/core/testing';
import { DashboardComponent } from './dashboard.component';
import { setupComponentHarness } from '../../../testing/data-harness';
import { goldenDb, EXPECTED, FROZEN_NOW, GOLDEN_PURCHASES, GOLDEN_SALES } from '../../../testing/golden-dataset';

describe('DashboardComponent (tela Dashboard — valores exibidos)', () => {
  let cmp: any;

  function setup(db = goldenDb()): void {
    const h = setupComponentHarness(DashboardComponent, db);
    cmp = h.component;
  }

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(FROZEN_NOW);
    setup();
  });

  afterEach(() => {
    jest.useRealTimers();
    TestBed.resetTestingModule();
  });

  describe('rangeBounds() — seletor de período', () => {
    it('"all" → null (sem filtro)', () => {
      cmp.range.set('all');
      expect(cmp.rangeBounds()).toBeNull();
    });

    it('"custom" incompleto → null; completo → dia inteiro nas duas pontas', () => {
      cmp.range.set('custom');
      cmp.customStart.set(new Date(2026, 4, 1));
      expect(cmp.rangeBounds()).toBeNull();
      cmp.customEnd.set(new Date(2026, 4, 10));
      const b = cmp.rangeBounds();
      expect(b.start.getHours()).toBe(0);
      expect(b.start.getMinutes()).toBe(0);
      expect(b.end.getHours()).toBe(23);
      expect(b.end.getMinutes()).toBe(59);
    });

    it('customRangeLabel formata DD/MM – DD/MM', () => {
      cmp.customStart.set(new Date(2026, 4, 1));
      cmp.customEnd.set(new Date(2026, 4, 10));
      expect(cmp.customRangeLabel()).toBe('01/05 – 10/05');
    });
  });

  describe('periodSales() — vendas do período (canceladas sempre fora)', () => {
    it('30d (padrão): V002, V003, V005, V007', () => {
      expect(cmp.periodSales().map((s: any) => s.id)).toEqual(EXPECTED.dash30d.ids);
    });

    it('7d: apenas V003 e V005', () => {
      cmp.range.set('7d');
      expect(cmp.periodSales().map((s: any) => s.id)).toEqual(EXPECTED.dash7d.ids);
    });

    it('90d: igual a 30d (V001 de fevereiro continua fora)', () => {
      cmp.range.set('90d');
      expect(cmp.periodSales().map((s: any) => s.id)).toEqual(EXPECTED.dash30d.ids);
    });

    it('12m: inclui V001 (fev/26) e V006 (dez/25); "all": as 6 concluídas', () => {
      cmp.range.set('12m');
      expect(cmp.periodSales().map((s: any) => s.id)).toEqual(['V001', 'V002', 'V003', 'V005', 'V006', 'V007']);
      cmp.range.set('all');
      expect(cmp.periodSales().map((s: any) => s.id)).toEqual(['V001', 'V002', 'V003', 'V005', 'V006', 'V007']);
    });
  });

  describe('periodKpis() — cards KPI do topo', () => {
    it('30d: todos os campos batem com o cálculo de referência', () => {
      const k = cmp.periodKpis();
      const e = EXPECTED.dash30d;
      expect(k.grossRevenue).toBeCloseTo(e.grossRevenue, 10);
      expect(k.netRevenue).toBeCloseTo(e.netRevenue, 10);
      expect(k.totalFees).toBeCloseTo(e.totalFees, 10);
      expect(k.netProfit).toBeCloseTo(e.netProfit, 10);
      expect(k.proportionalCost).toBeCloseTo(e.proportionalCost, 10);
      expect(k.totalShipping).toBeCloseTo(e.totalShipping, 10);
      expect(k.totalFlexRefund).toBeCloseTo(e.totalFlexRefund, 10);
      expect(k.totalDiscounts).toBeCloseTo(e.totalDiscounts, 10);
      expect(k.totalOtherCosts).toBeCloseTo(e.totalOtherCosts, 10);
      expect(k.totalSold).toBe(e.totalSold);
      expect(k.salesCount).toBe(e.salesCount);
      expect(k.netMargin).toBeCloseTo(e.netProfit / e.grossRevenue, 10);
      expect(k.averageTicket).toBeCloseTo(e.grossRevenue / e.salesCount, 10);
    });

    it('"all": idêntico aos KPIs globais do DataService (consistência entre telas)', () => {
      cmp.range.set('all');
      const k = cmp.periodKpis();
      const g = cmp.dataService.kpis();
      expect(k.grossRevenue).toBeCloseTo(g.grossRevenue, 10);
      expect(k.netRevenue).toBeCloseTo(g.netRevenue, 10);
      expect(k.netProfit).toBeCloseTo(g.netProfit, 10);
      expect(k.totalFees).toBeCloseTo(g.totalFees, 10);
      expect(k.netMargin).toBeCloseTo(g.netMargin, 10);
    });
  });

  describe('monthlyChart() — evolução mensal (hero)', () => {
    it('"all": meses em ordem cronológica cruzando 2025→2026, com somas certas', () => {
      cmp.range.set('all');
      const chart = cmp.monthlyChart();
      expect(chart.labels).toEqual(['dez/25', 'fev/26', 'mai/26', 'jun/26']);
      const m = EXPECTED.monthly;
      expect(chart.datasets[0].data.map((x: number) => +x.toFixed(6))).toEqual(
        [m['202511'].net, m['202601'].net, m['202604'].net, m['202605'].net].map(x => +x.toFixed(6)),
      );
      expect(chart.datasets[1].data.map((x: number) => +x.toFixed(6))).toEqual(
        [m['202511'].profit, m['202601'].profit, m['202604'].profit, m['202605'].profit].map(x => +x.toFixed(6)),
      );
    });

    it('sem vendas no período → datasets vazios', () => {
      cmp.range.set('custom');
      cmp.customStart.set(new Date(2024, 0, 1));
      cmp.customEnd.set(new Date(2024, 0, 31));
      expect(cmp.monthlyChart()).toEqual({ labels: [], datasets: [] });
    });
  });

  describe('productProfitChart() — lucro por produto', () => {
    it('"all": agrega e ordena por lucro desc; trunca nomes longos', () => {
      cmp.range.set('all');
      const chart = cmp.productProfitChart();
      expect(chart.labels).toEqual([
        'Fone BT', 'Mouse', 'Suporte Articulado de Pa…', 'Caneca',
      ]);
      const p = EXPECTED.products;
      const data = chart.datasets[0].data as number[];
      expect(data[0]).toBeCloseTo(p['Fone BT'].netProfit, 10);
      expect(data[1]).toBeCloseTo(p['Mouse'].netProfit, 10);
      expect(data[2]).toBeCloseTo(p['Suporte Articulado de Parede TV'].netProfit, 10);
      expect(data[3]).toBeCloseTo(p['Caneca'].netProfit, 10);
    });

    it('produto com prejuízo recebe cor de perigo', () => {
      TestBed.resetTestingModule();
      // variante: só a venda com prejuízo (V007) e seu lote
      setup(goldenDb({
        purchases: GOLDEN_PURCHASES.filter(c => c.id === 'C001'),
        sales: GOLDEN_SALES.filter(s => s.id === 'V007'),
      }));
      cmp.range.set('all');
      const chart = cmp.productProfitChart();
      const data = chart.datasets[0].data as number[];
      expect(data[0]).toBeCloseTo(EXPECTED.sale.V007.profit, 10);
      const bg = chart.datasets[0].backgroundColor as string[];
      const border = chart.datasets[0].borderColor as string[];
      expect(bg[0]).not.toBe(border[0]); // rgba(danger) ≠ hex success — só sanity
      expect(cmp.productCount()).toBe(1);
    });

    it('productChartHeight: mínimo 280px, cresce 36px por produto', () => {
      cmp.range.set('all');
      expect(cmp.productChartHeight()).toBe(Math.max(280, 4 * 36 + 50));
    });
  });

  describe('compositionChart() + compositionLegend() — composição da receita', () => {
    it('"all": 6 fatias [lucro, taxas, frete, descontos, outros, custo]', () => {
      cmp.range.set('all');
      const data = cmp.compositionChart().datasets[0].data as number[];
      const e = EXPECTED.kpis;
      expect(data[0]).toBeCloseTo(Math.max(0, e.netProfit), 10);
      expect(data[1]).toBeCloseTo(e.totalFees, 10);
      expect(data[2]).toBeCloseTo(e.totalShipping, 10);
      expect(data[3]).toBeCloseTo(e.totalDiscounts, 10);
      expect(data[4]).toBeCloseTo(e.totalOtherCosts, 10);
      expect(data[5]).toBeCloseTo(Math.max(0, e.proportionalCost), 10);
    });

    it('legenda: percentuais somam 100%', () => {
      cmp.range.set('all');
      const legend = cmp.compositionLegend();
      const totalPct = legend.reduce((s: number, it: any) => s + it.pct, 0);
      expect(totalPct).toBeCloseTo(100, 8);
    });

    it('lucro negativo é zerado nas fatias (clamp ≥ 0)', () => {
      TestBed.resetTestingModule();
      setup(goldenDb({
        purchases: GOLDEN_PURCHASES.filter(c => c.id === 'C001'),
        sales: GOLDEN_SALES.filter(s => s.id === 'V007'), // lucro −37
      }));
      cmp.range.set('all');
      const data = cmp.compositionChart().datasets[0].data as number[];
      expect(data[0]).toBe(0); // Math.max(0, −37)
    });
  });

  describe('waterfall() — cascata receita → lucro', () => {
    it('"all": passos, sinais e identidades contábeis', () => {
      cmp.range.set('all');
      const steps = cmp.waterfall();
      const values = steps.map((s: any) => s.value);
      const e = EXPECTED.kpis;
      // investido, bruto, −taxas, −frete, +flex, −descontos, −outros, líquida, −custo, lucro
      expect(values).toHaveLength(10);
      expect(values[0]).toBeCloseTo(e.totalInvested, 10);
      expect(values[1]).toBeCloseTo(e.grossRevenue, 10);
      expect(values[2]).toBeCloseTo(-e.totalFees, 10);
      expect(values[3]).toBeCloseTo(-e.totalShipping, 10);
      expect(values[4]).toBeCloseTo(e.totalFlexRefund, 10);
      expect(values[5]).toBeCloseTo(-e.totalDiscounts, 10);
      expect(values[6]).toBeCloseTo(-e.totalOtherCosts, 10);
      expect(values[7]).toBeCloseTo(e.netRevenue, 10);
      expect(values[8]).toBeCloseTo(-e.proportionalCost, 10);
      expect(values[9]).toBeCloseTo(e.netProfit, 10);
      // identidades: bruto − taxas − frete + flex − descontos − outros = líquida; líquida − custo = lucro
      expect(values[1] + values[2] + values[3] + values[4] + values[5] + values[6]).toBeCloseTo(values[7], 8);
      expect(values[7] + values[8]).toBeCloseTo(values[9], 8);
      expect(steps[9].tone).toBe('success'); // lucro ≥ 0
    });

    it('passos condicionais somem quando flexRefund = 0 e otherCosts = 0', () => {
      TestBed.resetTestingModule();
      setup(goldenDb({
        purchases: GOLDEN_PURCHASES.filter(c => c.id === 'C001'),
        sales: GOLDEN_SALES.filter(s => s.id === 'V001'), // correios, sem outros custos
      }));
      cmp.range.set('all');
      const steps = cmp.waterfall();
      expect(steps).toHaveLength(8); // sem o passo flex e sem o passo outros custos
      const labels = steps.map((s: any) => s.label);
      expect(labels).not.toContain('dashboard.wfFlexRefund');
      expect(labels).not.toContain('dashboard.wfOtherCosts');
    });

    it('lucro negativo no período → tom danger no passo final', () => {
      TestBed.resetTestingModule();
      setup(goldenDb({
        purchases: GOLDEN_PURCHASES.filter(c => c.id === 'C001'),
        sales: GOLDEN_SALES.filter(s => s.id === 'V007'),
      }));
      cmp.range.set('all');
      const steps = cmp.waterfall();
      expect(steps[steps.length - 1].tone).toBe('danger');
    });
  });

  describe('idleRanking() — capital parado por lote', () => {
    it('só idleValue > 0, ordenado desc; maxIdle = primeiro', () => {
      const ids = cmp.idleRanking().map((c: any) => c.id);
      expect(ids).toEqual(['C001', 'C003', 'C002', 'C004']); // 212, 110, 40, 32
      expect(cmp.maxIdle()).toBeCloseTo(EXPECTED.inventory.idleById.C001, 10);
    });
  });

  describe('sparklines — tendências dos KPIs', () => {
    it('30d: 30 pontos cumulativos; final = total do período (lucro, receita, taxas)', () => {
      const e = EXPECTED.dash30d;
      const profit = cmp.profitSpark();
      const revenue = cmp.revenueSpark();
      const fees = cmp.feesSpark();
      expect(profit).toHaveLength(30);
      expect(revenue).toHaveLength(30);
      expect(fees).toHaveLength(30);
      expect(profit[29]).toBeCloseTo(e.netProfit, 8);
      expect(revenue[29]).toBeCloseTo(e.grossRevenue, 8);
      expect(fees[29]).toBeCloseTo(e.totalFees, 8);
      // receita cumulativa nunca decresce
      for (let i = 1; i < revenue.length; i++) {
        expect(revenue[i]).toBeGreaterThanOrEqual(revenue[i - 1]);
      }
    });

    it('7d: 7 pontos; final = total da janela de 7 dias', () => {
      cmp.range.set('7d');
      const profit = cmp.profitSpark();
      expect(profit).toHaveLength(7);
      expect(profit[6]).toBeCloseTo(EXPECTED.sale.V003.profit + EXPECTED.sale.V005.profit, 8);
    });

    it('marginSpark: último ponto = margem do período', () => {
      const pts = cmp.marginSpark();
      expect(pts).toHaveLength(30);
      const e = EXPECTED.dash30d;
      expect(pts[29]).toBeCloseTo(e.netProfit / e.grossRevenue, 10);
    });

    it('"all" → sem bounds → sparkline vazia; menos de 2 vendas → vazia', () => {
      cmp.range.set('all');
      expect(cmp.profitSpark()).toEqual([]);
      TestBed.resetTestingModule();
      setup(goldenDb({
        purchases: GOLDEN_PURCHASES.filter(c => c.id === 'C002'),
        sales: GOLDEN_SALES.filter(s => s.id === 'V003'),
      }));
      expect(cmp.profitSpark()).toEqual([]);
    });
  });
});
