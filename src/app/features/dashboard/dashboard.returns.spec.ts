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
import { goldenDb, EXPECTED, FROZEN_NOW } from '../../../testing/golden-dataset';
import { goldenReturnsDb, EXPECTED_RETURNS } from '../../../testing/golden-returns';
import { makeSale, makeReturn, makePurchase } from '../../../testing/fixtures';

/** Soma da cascata: passos entre a receita bruta e a receita líquida. */
function waterfallReconciles(steps: any[]): { sum: number; declared: number } {
  const idxGross = steps.findIndex(s => s.kind === 'gain' && s.tone === 'success');
  const idxNet = steps.findIndex(s => s.kind === 'subtotal');
  const sum = steps.slice(idxGross, idxNet).reduce((acc, s) => acc + s.value, 0);
  return { sum, declared: steps[idxNet].value };
}

describe('DashboardComponent — devoluções', () => {
  let cmp: any;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(FROZEN_NOW);
    cmp = setupComponentHarness(DashboardComponent, goldenReturnsDb()).component;
    cmp.range.set('all');
  });

  afterEach(() => {
    jest.useRealTimers();
    TestBed.resetTestingModule();
  });

  describe('periodKpis', () => {
    it('desconta o faturamento devolvido', () => {
      expect(cmp.periodKpis().grossRevenue).toBeCloseTo(EXPECTED_RETURNS.kpis.grossRevenue, 10);
      expect(cmp.periodKpis().returnedRevenue).toBeCloseTo(EXPECTED_RETURNS.kpis.returnedRevenue, 10);
    });

    it('expõe o prejuízo com devoluções sem clampar o valor negativo', () => {
      expect(cmp.periodKpis().returnLoss).toBeCloseTo(EXPECTED_RETURNS.kpis.returnLoss, 10);
      expect(cmp.periodKpis().netProfit).toBeCloseTo(EXPECTED_RETURNS.kpis.netProfit, 10);
    });

    it('calcula a taxa sobre as unidades brutas vendidas', () => {
      const k = cmp.periodKpis();
      expect(k.grossUnitsSold).toBe(EXPECTED_RETURNS.kpis.grossUnitsSold);
      expect(k.returnedUnits).toBe(EXPECTED_RETURNS.kpis.returnedUnits);
      expect(k.totalSold).toBe(EXPECTED_RETURNS.kpis.totalSold);
      expect(k.returnRate).toBeCloseTo(EXPECTED_RETURNS.kpis.returnRate, 10);
    });

    it('separa frete, ressarcimento e valor em risco', () => {
      const k = cmp.periodKpis();
      expect(k.returnShippingCost).toBe(12);
      expect(k.returnRefunds).toBe(100);
      expect(k.pendingReturnValue).toBe(90);
      expect(k.pendingReturnCount).toBe(1);
    });

    it('bate com os KPIs globais do DataService', () => {
      const k = cmp.periodKpis();
      const g = cmp.dataService.kpis();
      expect(k.returnLoss).toBeCloseTo(g.returnLoss, 10);
      expect(k.grossRevenue).toBeCloseTo(g.grossRevenue, 10);
      expect(k.netProfit).toBeCloseTo(g.netProfit, 10);
    });
  });

  describe('seção de devoluções', () => {
    it('aparece quando há devoluções no período', () => {
      expect(cmp.hasReturns()).toBe(true);
    });

    it('só considera devoluções FINALIZADAS cuja venda cai no período', () => {
      expect(cmp.periodReturns().map((r: any) => r.id).sort()).toEqual(['D001', 'D002', 'D003']);
    });

    it('tom da taxa de devolução segue as faixas', () => {
      expect(cmp.returnRateVariant()).toBe('danger'); // 30%
    });
  });

  describe('gráfico por motivo', () => {
    it('agrupa o prejuízo por motivo, ordenado do maior para o menor', () => {
      const chart = cmp.returnsByReasonChart();
      expect(chart.datasets[0].data[0]).toBeCloseTo(EXPECTED_RETURNS.loss.D001, 10);
      const soma = chart.datasets[0].data.reduce((a: number, b: number) => a + b, 0);
      expect(soma).toBeCloseTo(EXPECTED_RETURNS.kpis.returnLoss, 10);
    });
  });

  describe('ranking de produtos devolvidos', () => {
    it('soma unidades e prejuízo por produto, do pior para o melhor', () => {
      const list = cmp.topReturnedProducts();
      // Caneca perde 28,40 numa devolução só; Fone BT acumula D001 (38,87) com o
      // ganho de D003 (−20,00) e fica em 18,87 — logo Caneca lidera o ranking.
      expect(list[0].product).toBe('Caneca');
      expect(list[0].loss).toBeCloseTo(EXPECTED_RETURNS.loss.D002, 10);
      expect(list[1].product).toBe('Fone BT');
      expect(list[1].units).toBe(2);
      expect(list[1].loss).toBeCloseTo(EXPECTED_RETURNS.loss.D001 + EXPECTED_RETURNS.loss.D003, 10);
      const soma = list.reduce((a: number, p: any) => a + p.loss, 0);
      expect(soma).toBeCloseTo(EXPECTED_RETURNS.kpis.returnLoss, 10);
    });

    it('usa o módulo para a largura da barra (ganho também tem barra)', () => {
      expect(cmp.absLoss(-2.5)).toBe(2.5);
      expect(cmp.maxReturnLoss()).toBeGreaterThan(0);
    });
  });

  describe('waterfall', () => {
    it('inclui os passos de frete de devolução e ressarcimento', () => {
      const labels = cmp.waterfall().map((s: any) => s.label);
      expect(labels).toContain('dashboard.wfReturnShipping');
      expect(labels).toContain('dashboard.wfReturnRefund');
    });

    it('a soma dos passos fecha com a receita líquida declarada', () => {
      const { sum, declared } = waterfallReconciles(cmp.waterfall());
      expect(sum).toBeCloseTo(declared, 10);
      expect(declared).toBeCloseTo(EXPECTED_RETURNS.kpis.netRevenue, 10);
    });
  });

  describe('doughnut de composição', () => {
    it('inclui o frete de devolução, mas NÃO o prejuízo (evita contagem dupla)', () => {
      const chart = cmp.compositionChart();
      expect(chart.labels).toContain('dashboard.compReturnShipping');
      const idx = chart.labels.indexOf('dashboard.compReturnShipping');
      expect(chart.datasets[0].data[idx]).toBe(12);
      expect(chart.labels).not.toContain('dashboard.kpiReturnLoss');
    });

    it('a legenda soma 100%', () => {
      const total = cmp.compositionLegend().reduce((a: number, i: any) => a + i.pct, 0);
      expect(total).toBeCloseTo(100, 6);
    });
  });
});

describe('DashboardComponent — waterfall com estorno (passo que faltava)', () => {
  afterEach(() => { jest.useRealTimers(); TestBed.resetTestingModule(); });

  it('fecha a cascata quando a venda tem estorno', () => {
    jest.useFakeTimers();
    jest.setSystemTime(FROZEN_NOW);
    const db = goldenReturnsDb({
      purchases: [makePurchase({ id: 'C001', quantityPurchased: 10, unitCost: 50 })],
      sales: [makeSale({
        id: 'V001', batchId: 'C001', quantitySold: 2, unitPrice: 100,
        saleDate: '2026-06-10', feePercentage: 0.1, sellerShipping: 15,
        discount: 5, estorno: 60, otherCosts: 3,
      })],
      returns: [],
    });
    const cmp: any = setupComponentHarness(DashboardComponent, db).component;
    cmp.range.set('all');

    const labels = cmp.waterfall().map((s: any) => s.label);
    expect(labels).toContain('dashboard.wfEstorno');

    const { sum, declared } = waterfallReconciles(cmp.waterfall());
    // 200 − 20 (taxa) − 15 (frete) + 60 (estorno) − 5 (desconto) − 3 (outros)
    expect(declared).toBeCloseTo(217, 10);
    expect(sum).toBeCloseTo(declared, 10);
  });

  it('fecha a cascata combinando estorno, devolução e ressarcimento', () => {
    jest.useFakeTimers();
    jest.setSystemTime(FROZEN_NOW);
    const db = goldenReturnsDb({
      purchases: [makePurchase({ id: 'C001', quantityPurchased: 10, unitCost: 50 })],
      sales: [makeSale({
        id: 'V001', batchId: 'C001', quantitySold: 4, unitPrice: 100,
        saleDate: '2026-06-10', feePercentage: 0.1, sellerShipping: 15,
        discount: 20, estorno: 40, otherCosts: 3,
      })],
      returns: [makeReturn({
        id: 'D001', saleId: 'V001', batchId: 'C001', quantity: 1,
        requestDate: '2026-06-11', arrivalDate: '2026-06-13',
        returnShipping: 9, destination: 'Fornecedor', refundedAmount: 25,
      })],
    });
    const cmp: any = setupComponentHarness(DashboardComponent, db).component;
    cmp.range.set('all');

    const { sum, declared } = waterfallReconciles(cmp.waterfall());
    expect(sum).toBeCloseTo(declared, 10);
    expect(declared).toBeCloseTo(cmp.periodKpis().netRevenue, 10);
  });
});

describe('DashboardComponent — regressão sem devoluções', () => {
  afterEach(() => { jest.useRealTimers(); TestBed.resetTestingModule(); });

  it('mantém os KPIs do golden dataset e esconde a seção de devoluções', () => {
    jest.useFakeTimers();
    jest.setSystemTime(FROZEN_NOW);
    const cmp: any = setupComponentHarness(DashboardComponent, goldenDb()).component;
    cmp.range.set('all');

    expect(cmp.hasReturns()).toBe(false);
    expect(cmp.periodKpis().grossRevenue).toBeCloseTo(EXPECTED.kpis.grossRevenue, 10);
    expect(cmp.periodKpis().netProfit).toBeCloseTo(EXPECTED.kpis.netProfit, 10);
    expect(cmp.periodKpis().returnLoss).toBe(0);
    expect(cmp.periodKpis().totalSold).toBe(EXPECTED.kpis.totalSold);

    const labels = cmp.waterfall().map((s: any) => s.label);
    expect(labels).not.toContain('dashboard.wfReturnShipping');
    expect(labels).not.toContain('dashboard.wfReturnRefund');
  });
});
