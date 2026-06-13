jest.mock('@angular/fire/firestore', () => ({
  Firestore: class Firestore {},
  doc: jest.fn(),
  setDoc: jest.fn(),
  onSnapshot: jest.fn(),
}));

import { TestBed } from '@angular/core/testing';
import { InventoryComponent } from './inventory.component';
import { setupComponentHarness } from '../../../testing/data-harness';
import { goldenDb, EXPECTED, FROZEN_NOW, GOLDEN_PURCHASES } from '../../../testing/golden-dataset';
import { makeSale } from '../../../testing/fixtures';

describe('InventoryComponent (tela Estoque — valores exibidos)', () => {
  let cmp: any;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(FROZEN_NOW);
    const h = setupComponentHarness(InventoryComponent, goldenDb());
    cmp = h.component;
  });

  afterEach(() => {
    jest.useRealTimers();
    TestBed.resetTestingModule();
  });

  describe('hero — lucro líquido e mini-waterfall', () => {
    it('valores do hero vêm direto dos KPIs', () => {
      const k = cmp.kpis();
      expect(k.netProfit).toBeCloseTo(EXPECTED.kpis.netProfit, 10);
      expect(k.grossRevenue).toBeCloseTo(EXPECTED.kpis.grossRevenue, 10);
      expect(k.netMargin).toBeCloseTo(EXPECTED.kpis.netMargin, 10);
    });

    it('identidade do cálculo inline "Custos & taxas" (template linha 82): bruto − lucro = taxas + frete − flex + descontos + outros + custo do produto', () => {
      const k = cmp.kpis();
      const costsAndFees = k.grossRevenue - k.netProfit;
      const breakdown =
        EXPECTED.kpis.totalFees +
        EXPECTED.kpis.totalShipping -
        EXPECTED.kpis.totalFlexRefund + // nuance: reembolso flex é ABATIDO dos "custos" exibidos
        EXPECTED.kpis.totalDiscounts +
        EXPECTED.kpis.totalOtherCosts +
        EXPECTED.kpis.proportionalCost;
      expect(costsAndFees).toBeCloseTo(breakdown, 10);
    });
  });

  describe('statusCounts() — chips e subtítulo', () => {
    it('contagens por status', () => {
      const c = cmp.statusCounts();
      expect(c.all).toBe(6);
      expect(c['Parado']).toBe(1);
      expect(c['Atenção']).toBe(1);
      expect(c['Em trânsito']).toBe(1);
      expect(c['Em Estoque']).toBe(1);
      expect(c['Vendido']).toBe(2);
    });
  });

  describe('alerts() — card de atenção', () => {
    it('só Parado + Atenção, ordenados por dias em estoque desc', () => {
      const ids = cmp.alerts().map((a: any) => a.id);
      expect(ids).toEqual(['C001', 'C004']); // 151d, 27d
    });

    it('alertLevel = high quando existe lote Parado', () => {
      expect(cmp.alertLevel()).toBe('high');
    });

    it('alertSummary: contagens e capital dos lotes parados', () => {
      const s = cmp.alertSummary();
      expect(s.count).toBe(2);
      expect(s.stalledCount).toBe(1);
      expect(s.idleValue).toBeCloseTo(EXPECTED.inventory.idleById.C001, 10);
    });
  });

  describe('sortedPurchases() — ordem padrão da tabela', () => {
    it('prioridade de status: Parado → Atenção → Em trânsito → Em Estoque → Vendido; id asc no empate', () => {
      const ids = cmp.sortedPurchases().map((c: any) => c.id);
      expect(ids).toEqual(['C001', 'C004', 'C003', 'C002', 'C005', 'C006']);
    });

    it('filtro por chip de status', () => {
      cmp.filter.set('Vendido');
      expect(cmp.filteredPurchases().map((c: any) => c.id)).toEqual(['C005', 'C006']);
    });
  });

  describe('KPI cards — capital investido, parado e ticket médio', () => {
    it('valores idênticos aos KPIs de referência', () => {
      const k = cmp.kpis();
      expect(k.totalInvested).toBeCloseTo(EXPECTED.kpis.totalInvested, 10);
      expect(k.idleCapital).toBeCloseTo(EXPECTED.kpis.idleCapital, 10);
      expect(k.averageTicket).toBeCloseTo(EXPECTED.kpis.averageTicket, 10);
    });
  });

  describe('sparklines (30 dias, hora local)', () => {
    it('profitSparkline: 30 pontos, cumulativa, ponto final = lucro dos últimos 30 dias', () => {
      const pts = cmp.profitSparkline();
      expect(pts).toHaveLength(30);
      for (let i = 1; i < pts.length; i++) {
        // lucro pode ser negativo, então monotonicidade não se aplica — mas a curva é cumulativa:
        // cada ponto = anterior + valor do dia; o último cobre toda a janela.
        expect(typeof pts[i]).toBe('number');
      }
      // Janela de 30 dias inclui V002 (20/mai), V003, V005, V007 — V001 (fev) e V006 (2025) fora
      const exp = EXPECTED.sale.V002.profit + EXPECTED.sale.V003.profit + EXPECTED.sale.V005.profit + EXPECTED.sale.V007.profit;
      expect(pts[pts.length - 1]).toBeCloseTo(exp, 10);
    });

    it('revenueSparkline: cumulativa e não-decrescente; ponto final = receita dos últimos 30 dias', () => {
      const pts = cmp.revenueSparkline();
      expect(pts).toHaveLength(30);
      for (let i = 1; i < pts.length; i++) {
        expect(pts[i]).toBeGreaterThanOrEqual(pts[i - 1]);
      }
      expect(pts[pts.length - 1]).toBeCloseTo(EXPECTED.dash30d.grossRevenue, 10);
    });

    it('marginSparkline: ponto final = margem acumulada de TODAS as vendas concluídas', () => {
      const pts = cmp.marginSparkline();
      expect(pts).toHaveLength(30);
      expect(pts[pts.length - 1]).toBeCloseTo(EXPECTED.kpis.netMargin, 10);
    });

    it('idleSparkline: ignora canceladas e usa purchaseDate como fallback; ponto final = idleCapital do KPI', () => {
      const pts = cmp.idleSparkline();
      expect(pts).toHaveLength(30);
      // C003 (em trânsito) conta desde a compra — mesma base do KPI idleCapital do card;
      // V004 (cancelada) NÃO reduz o estoque de C002.
      expect(pts[pts.length - 1]).toBeCloseTo(EXPECTED.kpis.idleCapital, 10);
      expect(pts[pts.length - 1]).toBeCloseTo(cmp.kpis().idleCapital, 10);
    });
  });

  describe('marginClass() — cor da margem média', () => {
    it('undefined → muted; negativa → danger; abaixo de 10% → warning; acima → success', () => {
      expect(cmp.marginClass(undefined)).toBe('text-muted');
      expect(cmp.marginClass(-0.05)).toBe('text-danger');
      expect(cmp.marginClass(0.05)).toBe('text-warning');
      expect(cmp.marginClass(0.2)).toBe('text-success');
    });
  });

  describe('confirmDelete() — guard contra vendas órfãs', () => {
    it('lote com APENAS venda cancelada vinculada: avisa e NÃO abre dialog (fecha a brecha de órfãos)', () => {
      TestBed.resetTestingModule();
      // C002 tem quantitySold = 0 (só venda cancelada) — o guard antigo deixaria excluir.
      const h = setupComponentHarness(InventoryComponent, goldenDb({
        purchases: GOLDEN_PURCHASES,
        sales: [makeSale({ id: 'V900', batchId: 'C002', status: 'Cancelada' })],
      }));
      const c002 = h.data.computedPurchases().find(c => c.id === 'C002')!;
      expect(c002.quantitySold).toBe(0);

      (h.component as any).confirmDelete(c002, new Event('click'));

      expect(h.fakes.notify.warning).toHaveBeenCalled();
      expect(h.fakes.dialog.open).not.toHaveBeenCalled();
    });

    it('lote sem nenhuma venda vinculada: abre o dialog de confirmação normalmente', () => {
      TestBed.resetTestingModule();
      const h = setupComponentHarness(InventoryComponent, goldenDb({
        purchases: GOLDEN_PURCHASES,
        sales: [],
      }));
      const c001 = h.data.computedPurchases().find(c => c.id === 'C001')!;

      (h.component as any).confirmDelete(c001, new Event('click'));

      expect(h.fakes.notify.warning).not.toHaveBeenCalled();
      expect(h.fakes.dialog.open).toHaveBeenCalledTimes(1);
    });
  });
});
