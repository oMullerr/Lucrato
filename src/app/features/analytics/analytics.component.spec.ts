jest.mock('@angular/fire/firestore', () => ({
  Firestore: class Firestore {},
  doc: jest.fn(),
  setDoc: jest.fn(),
  onSnapshot: jest.fn(),
}));

import { TestBed } from '@angular/core/testing';
import { AnalyticsComponent } from './analytics.component';
import { setupComponentHarness } from '../../../testing/data-harness';
import { goldenDb, EXPECTED, FROZEN_NOW } from '../../../testing/golden-dataset';

describe('AnalyticsComponent (tela Análises — valores exibidos)', () => {
  let cmp: any;
  let xlsx: { download: jest.Mock };

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(FROZEN_NOW);
    const h = setupComponentHarness(AnalyticsComponent, goldenDb());
    cmp = h.component;
    xlsx = h.fakes.xlsx;
  });

  afterEach(() => {
    jest.useRealTimers();
    TestBed.resetTestingModule();
  });

  describe('resumeBlocks() — cards de resumo ≡ KPIs', () => {
    it('Investimento: investido, capital parado, lotes, em estoque', () => {
      const rows = cmp.resumeBlocks()[0].rows;
      expect(rows[0].value).toBeCloseTo(EXPECTED.kpis.totalInvested, 10);
      expect(rows[1].value).toBeCloseTo(EXPECTED.kpis.idleCapital, 10);
      expect(rows[2].value).toBe(EXPECTED.kpis.totalBatches);
      expect(rows[3].value).toBe(EXPECTED.kpis.batchesInStock);
    });

    it('Resultado: receita bruta/líquida, lucro bruto/líquido', () => {
      const rows = cmp.resumeBlocks()[1].rows;
      expect(rows[0].value).toBeCloseTo(EXPECTED.kpis.grossRevenue, 10);
      expect(rows[1].value).toBeCloseTo(EXPECTED.kpis.netRevenue, 10);
      expect(rows[2].value).toBeCloseTo(EXPECTED.kpis.grossProfit, 10);
      expect(rows[3].value).toBeCloseTo(EXPECTED.kpis.netProfit, 10);
    });

    it('Eficiência: taxas, descontos, ticket médio, margem líquida', () => {
      const rows = cmp.resumeBlocks()[2].rows;
      expect(rows[0].value).toBeCloseTo(EXPECTED.kpis.totalFees, 10);
      expect(rows[1].value).toBeCloseTo(EXPECTED.kpis.totalDiscounts, 10);
      expect(rows[2].value).toBeCloseTo(EXPECTED.kpis.averageTicket, 10);
      expect(rows[3].value).toBeCloseTo(EXPECTED.kpis.netMargin, 10);
    });
  });

  describe('productRanking() — aba Produtos', () => {
    it('agrega por produto e ordena por lucro líquido desc (padrão)', () => {
      const list = cmp.productRanking();
      expect(list.map((p: any) => p.product)).toEqual([
        'Fone BT', 'Mouse', 'Suporte Articulado de Parede TV', 'Caneca',
      ]);
      const fone = list[0];
      const exp = EXPECTED.products['Fone BT'];
      expect(fone.qty).toBe(exp.qty);
      expect(fone.revenue).toBeCloseTo(exp.revenue, 10);
      expect(fone.netRevenue).toBeCloseTo(exp.netRevenue, 10);
      expect(fone.cost).toBeCloseTo(exp.cost, 10);
      expect(fone.netProfit).toBeCloseTo(exp.netProfit, 10);
      expect(fone.margin).toBeCloseTo(exp.netProfit / exp.revenue, 10);
    });

    it('vendas canceladas ficam fora do ranking (Caneca só com V003)', () => {
      const caneca = cmp.productRanking().find((p: any) => p.product === 'Caneca');
      expect(caneca.qty).toBe(1); // V004 (2 un, cancelada) não soma
      expect(caneca.revenue).toBeCloseTo(EXPECTED.sale.V003.gross, 10);
    });

    it('sortProduct() repete a coluna → alterna para asc', () => {
      cmp.sortProduct('netProfit'); // já era netProfit desc → vira asc
      const list = cmp.productRanking();
      expect(list[0].product).toBe('Caneca');
      expect(list[list.length - 1].product).toBe('Fone BT');
    });

    it('paginação da aba: pageSize 2 → 2 primeiros', () => {
      cmp.productPage.set({ pageIndex: 0, pageSize: 2, length: 4 });
      expect(cmp.pagedProductRanking().map((p: any) => p.product)).toEqual(['Fone BT', 'Mouse']);
    });
  });

  describe('categoryStats() — aba Categorias', () => {
    it('agrega compras e vendas por categoria (lucro desc padrão)', () => {
      const list = cmp.categoryStats();
      expect(list.map((c: any) => c.category)).toEqual(['Eletrônicos', 'Casa', 'Acessórios', 'Outros']);
      const ele = list[0];
      const exp = EXPECTED.categories['Eletrônicos'];
      expect(ele.batches).toBe(exp.batches);
      expect(ele.invested).toBeCloseTo(exp.invested, 10);
      expect(ele.idleCapital).toBeCloseTo(exp.idleCapital, 10);
      expect(ele.revenue).toBeCloseTo(exp.revenue, 10);
      expect(ele.profit).toBeCloseTo(exp.profit, 10);
      expect(ele.margin).toBeCloseTo(exp.profit / exp.revenue, 10);
    });

    it('INCONSISTÊNCIA DOCUMENTADA: venda órfã (V005) não entra em nenhuma categoria — soma das categorias ≠ KPI global', () => {
      const totalCategoryRevenue = cmp.categoryStats().reduce((s: number, c: any) => s + c.revenue, 0);
      // O dashboard e os KPIs contam V005 (lote inexistente); a aba Categorias descarta.
      expect(EXPECTED.kpis.grossRevenue - totalCategoryRevenue).toBeCloseTo(EXPECTED.sale.V005.gross, 10);
    });
  });

  describe('monthlyStats() — aba Evolução Mensal', () => {
    it('buckets por mês UTC, ordem cronológica asc (cruza 2025→2026)', () => {
      const list = cmp.monthlyStats();
      expect(list.map((m: any) => m.sortKey)).toEqual(['202511', '202601', '202604', '202605']);
      expect(list[0].month).toBe('dez/2025');
      expect(list[1].month).toBe('fev/2026');
    });

    it('valores de cada mês: qty, receita, taxas, líquida, custo, lucro, margem', () => {
      const byKey = new Map(cmp.monthlyStats().map((m: any) => [m.sortKey, m]));
      for (const [key, exp] of Object.entries(EXPECTED.monthly)) {
        const m: any = byKey.get(key);
        expect(m).toBeDefined();
        expect(m.qty).toBe(exp.qty);
        expect(m.revenue).toBeCloseTo(exp.revenue, 10);
        expect(m.fees).toBeCloseTo(exp.fees, 10);
        expect(m.netRevenue).toBeCloseTo(exp.net, 10);
        expect(m.cost).toBeCloseTo(exp.cost, 10);
        expect(m.profit).toBeCloseTo(exp.profit, 10);
        expect(m.margin).toBeCloseTo(exp.revenue > 0 ? exp.profit / exp.revenue : 0, 10);
      }
    });

    it('soma dos meses ≡ KPIs globais (consistência entre abas)', () => {
      const list = cmp.monthlyStats();
      const sum = (k: string) => list.reduce((s: number, m: any) => s + m[k], 0);
      expect(sum('revenue')).toBeCloseTo(EXPECTED.kpis.grossRevenue, 10);
      expect(sum('profit')).toBeCloseTo(EXPECTED.kpis.netProfit, 10);
      expect(sum('fees')).toBeCloseTo(EXPECTED.kpis.totalFees, 10);
    });
  });

  describe('idleInventory() — aba Estoque Parado', () => {
    it('só lotes com estoque > 0, ordenados por capital parado desc', () => {
      const ids = cmp.idleInventory().map((c: any) => c.id);
      expect(ids).toEqual(['C001', 'C003', 'C002', 'C004']); // 212, 110, 40, 32
    });

    it('inclui lote Em trânsito (C003) — consistente com o KPI idleCapital e o ranking do dashboard', () => {
      expect(cmp.idleInventory().some((c: any) => c.id === 'C003')).toBe(true);
    });

    it('maxIdleDays = maior dias-em-estoque entre os listados', () => {
      expect(cmp.maxIdleDays()).toBe(EXPECTED.inventory.daysInStock.C001);
    });
  });

  describe('exportação Excel ≡ dados da tela', () => {
    it('exportAll envia 4 abas com EXATAMENTE as mesmas linhas exibidas', () => {
      cmp.exportAll();
      expect(xlsx.download).toHaveBeenCalledTimes(1);
      const [filename, sheets, resumo] = xlsx.download.mock.calls[0];
      expect(filename).toMatch(/lucrato-analises-\d{4}-\d{2}-\d{2}\.xlsx/);
      expect(sheets).toHaveLength(4);
      expect(sheets[0].rows).toEqual(cmp.productRanking());
      expect(sheets[1].rows).toEqual(cmp.categoryStats());
      expect(sheets[2].rows).toEqual(cmp.monthlyStats());
      expect(sheets[3].rows).toEqual(cmp.idleInventory());
      // margem usa média PONDERADA (lucro/receita), não média simples
      const marginCol = sheets[0].columns.find((c: any) => c.key === 'margin');
      expect(marginCol.total).toBe('weightedAvg');
      expect(marginCol.numKey).toBe('netProfit');
      expect(marginCol.denKey).toBe('revenue');
      // resumo da capa ≡ KPIs
      expect(resumo.blocks[1].rows[3].value).toBeCloseTo(EXPECTED.kpis.netProfit, 10);
      expect(resumo.blocks[2].rows[3].value).toBeCloseTo(EXPECTED.kpis.netMargin, 10);
    });
  });
});
