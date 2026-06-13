jest.mock('@angular/fire/firestore', () => ({
  Firestore: class Firestore {},
  doc: jest.fn(),
  setDoc: jest.fn(),
  onSnapshot: jest.fn(),
}));

import { TestBed } from '@angular/core/testing';
import { SalesComponent } from './sales.component';
import { setupComponentHarness } from '../../../testing/data-harness';
import { goldenDb, EXPECTED, FROZEN_NOW } from '../../../testing/golden-dataset';

describe('SalesComponent (tela Vendas — valores exibidos)', () => {
  let cmp: any;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(FROZEN_NOW);
    const h = setupComponentHarness(SalesComponent, goldenDb());
    cmp = h.component;
  });

  afterEach(() => {
    jest.useRealTimers();
    TestBed.resetTestingModule();
  });

  describe('summary() — cards de resumo', () => {
    it('sem filtros: total conta TODOS os status; receita/lucro/margem só Concluídas', () => {
      const s = cmp.summary();
      expect(s.total).toBe(7); // inclui V004 cancelada
      expect(s.revenue).toBeCloseTo(EXPECTED.kpis.grossRevenue, 10);
      expect(s.profit).toBeCloseTo(EXPECTED.kpis.netProfit, 10);
      expect(s.margin).toBeCloseTo(EXPECTED.kpis.netProfit / EXPECTED.kpis.grossRevenue, 10);
    });

    it('com filtro de canal Shopee: apenas V002 e V006', () => {
      cmp.channelFilter.set('Shopee');
      const s = cmp.summary();
      expect(s.total).toBe(2);
      expect(s.revenue).toBeCloseTo(EXPECTED.sale.V002.gross + EXPECTED.sale.V006.gross, 10);
      expect(s.profit).toBeCloseTo(EXPECTED.sale.V002.profit + EXPECTED.sale.V006.profit, 10);
    });

    it('com quick filter "loss": só V007 (margem negativa exibida)', () => {
      cmp.quickFilter.set('loss');
      const s = cmp.summary();
      expect(s.total).toBe(1);
      expect(s.revenue).toBeCloseTo(EXPECTED.sale.V007.gross, 10);
      expect(s.profit).toBeCloseTo(EXPECTED.sale.V007.profit, 10);
      expect(s.margin).toBeCloseTo(EXPECTED.sale.V007.profit / EXPECTED.sale.V007.gross, 10);
    });

    it('summary é consistente com os KPIs globais (mesma base, mesmo número)', () => {
      const s = cmp.summary();
      const k = cmp.data.kpis();
      expect(s.revenue).toBeCloseTo(k.grossRevenue, 10);
      expect(s.profit).toBeCloseTo(k.netProfit, 10);
      expect(s.margin).toBeCloseTo(k.netMargin, 10);
    });
  });

  describe('quickCounts() — chips de filtro rápido (só Concluídas têm resultado)', () => {
    it('contagens: all=7, profit=5, loss=1, lowMargin=1', () => {
      const q = cmp.quickCounts();
      expect(q.all).toBe(7); // "all" continua contando todos os status
      expect(q.profit).toBe(5); // V001, V002, V003, V005, V006 — V004 (cancelada) fora
      expect(q.loss).toBe(1);   // V007
      expect(q.lowMargin).toBe(1); // V007 (margem < 10%)
    });

    it('quick filter "profit" não lista venda cancelada (V004 tem lucro computado, mas não realizado)', () => {
      cmp.quickFilter.set('profit');
      const ids = cmp.filteredSales().map((s: any) => s.id);
      expect(ids).not.toContain('V004');
      expect(ids).toHaveLength(5);
    });
  });

  describe('isOrphanBatch() — sinalização de lote inexistente', () => {
    it('true para batchId sem compra correspondente; false para lote existente', () => {
      expect(cmp.isOrphanBatch('C999')).toBe(true);  // V005 aponta para lote inexistente
      expect(cmp.isOrphanBatch('C001')).toBe(false);
    });
  });

  describe('filteredSales() — ordenação e filtros da tabela', () => {
    it('ordem padrão: data desc, id numérico desc como desempate', () => {
      const ids = cmp.filteredSales().map((s: any) => s.id);
      expect(ids).toEqual(['V005', 'V003', 'V004', 'V007', 'V002', 'V001', 'V006']);
    });

    it('filtro de texto "fone" casa por produto', () => {
      cmp.textFilter.set('fone');
      const ids = cmp.filteredSales().map((s: any) => s.id);
      expect(ids).toEqual(['V007', 'V002', 'V001']);
    });

    it('ordenação por coluna netProfit asc', () => {
      cmp.sortState.set({ active: 'netProfit', direction: 'asc' });
      const ids = cmp.filteredSales().map((s: any) => s.id);
      expect(ids).toEqual(['V007', 'V003', 'V004', 'V005', 'V006', 'V001', 'V002']);
    });

    it('paginação: pageSize 3, página 2 → fatia [3..6) da ordem padrão', () => {
      cmp.pageState.set({ pageIndex: 1, pageSize: 3, length: 7 });
      const ids = cmp.pagedSales().map((s: any) => s.id);
      expect(ids).toEqual(['V007', 'V002', 'V001']);
    });
  });

  describe('valores por linha (ComputedSale exibido na tabela)', () => {
    it('cada venda concluída exibe lucro/margem conforme cálculo de referência', () => {
      const byId = new Map(cmp.filteredSales().map((s: any) => [s.id, s]));
      for (const [id, exp] of Object.entries(EXPECTED.sale)) {
        const row: any = byId.get(id);
        expect(row).toBeDefined();
        expect(row.grossRevenue).toBeCloseTo(exp.gross, 10);
        expect(row.feeAmount).toBeCloseTo(exp.fee, 10);
        expect(row.netRevenue).toBeCloseTo(exp.net, 10);
        expect(row.proportionalCost).toBeCloseTo(exp.cost, 10);
        expect(row.netProfit).toBeCloseTo(exp.profit, 10);
        const margin = exp.gross > 0 ? exp.profit / exp.gross : 0;
        expect(row.netMargin).toBeCloseTo(margin, 10);
      }
    });

    it('venda FLEX ignora sellerShipping e soma flexRefund (V002)', () => {
      const v2 = cmp.filteredSales().find((s: any) => s.id === 'V002');
      // net = 270 − 32.4 (fee) + 4 (flex) − 0 − 2; o sellerShipping=12 NÃO entra
      expect(v2.netRevenue).toBeCloseTo(270 - 270 * 0.12 + 4 - 2, 10);
    });

    it('venda com lote órfão (V005) tem custo 0 → lucro = receita líquida (lacuna documentada)', () => {
      const v5 = cmp.filteredSales().find((s: any) => s.id === 'V005');
      expect(v5.actualUnitCost).toBe(0);
      expect(v5.proportionalCost).toBe(0);
      expect(v5.netProfit).toBeCloseTo(v5.netRevenue, 10);
    });
  });

  describe('isCustomFee() — destaque de taxa fora do padrão', () => {
    it('taxa igual ao padrão (0.12) não é custom; diferença > 0.0001 é', () => {
      expect(cmp.isCustomFee(0.12)).toBe(false);
      expect(cmp.isCustomFee(0.12005)).toBe(false); // dentro do epsilon
      expect(cmp.isCustomFee(0.10)).toBe(true);
    });
  });

  describe('marginClass() — cor da margem por limiar', () => {
    it('negativa → danger; abaixo do mínimo (10%) → warning; acima → success', () => {
      expect(cmp.marginClass(-0.01)).toBe('text-danger');
      expect(cmp.marginClass(0.05)).toBe('text-warning');
      expect(cmp.marginClass(0.15)).toBe('text-success');
    });
  });

  describe('filtro por intervalo de datas (dateBounds)', () => {
    // bounds em UTC (mesmo parse de saleDate) → asserções independem do fuso da máquina
    it('recorta a tabela ao intervalo; vendas fora do range saem', () => {
      // 25/05 → 14/06: V005(06-12), V003(06-10), V004(06-05), V007(06-01) dentro; V002(05-20), V001(02-10), V006(2025) fora
      cmp.dateBounds.set({ start: new Date('2026-05-25'), end: new Date('2026-06-14') });
      expect(cmp.filteredSales().map((s: any) => s.id)).toEqual(['V005', 'V003', 'V004', 'V007']);
    });

    it('é inclusivo nas duas pontas (venda exatamente no limite entra)', () => {
      const d = new Date('2026-06-12'); // instante exato de V005
      cmp.dateBounds.set({ start: d, end: d });
      expect(cmp.filteredSales().map((s: any) => s.id)).toEqual(['V005']);
    });

    it('dateBounds null → ordem padrão completa (sem recorte)', () => {
      cmp.dateBounds.set(null);
      expect(cmp.filteredSales().map((s: any) => s.id))
        .toEqual(['V005', 'V003', 'V004', 'V007', 'V002', 'V001', 'V006']);
    });

    it('combina com outros filtros (AND): canal Shopee + intervalo de maio → só V002', () => {
      cmp.channelFilter.set('Shopee'); // V002 (05-20) e V006 (2025-12-15)
      cmp.dateBounds.set({ start: new Date('2026-05-01'), end: new Date('2026-05-31') });
      expect(cmp.filteredSales().map((s: any) => s.id)).toEqual(['V002']);
    });
  });
});
