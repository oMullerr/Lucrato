jest.mock('@angular/fire/firestore', () => ({
  Firestore: class Firestore {},
  doc: jest.fn(),
  setDoc: jest.fn(),
  onSnapshot: jest.fn(),
}));

import { TestBed } from '@angular/core/testing';
import { AnalyticsComponent } from './analytics.component';
import { setupComponentHarness } from '../../../testing/data-harness';
import { goldenDb, FROZEN_NOW } from '../../../testing/golden-dataset';
import { goldenReturnsDb, EXPECTED_RETURNS } from '../../../testing/golden-returns';

describe('AnalyticsComponent — devoluções', () => {
  let cmp: any;
  let fakes: any;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(FROZEN_NOW);
    const h = setupComponentHarness(AnalyticsComponent, goldenReturnsDb());
    cmp = h.component;
    fakes = h.fakes;
  });

  afterEach(() => {
    jest.useRealTimers();
    TestBed.resetTestingModule();
  });

  describe('ranking por produto', () => {
    const byProduct = (list: any[], name: string) => list.find(p => p.product === name);

    it('conta quantidade LÍQUIDA de devoluções', () => {
      const fone = byProduct(cmp.productRanking(), 'Fone BT');
      // 6 vendidas − 2 devolvidas (D001 em V002, D003 em V001)
      expect(fone.qty).toBe(4);
      expect(fone.returnedQty).toBe(2);
    });

    it('expõe taxa de devolução e prejuízo por produto', () => {
      const fone = byProduct(cmp.productRanking(), 'Fone BT');
      expect(fone.returnRate).toBeCloseTo(2 / 6, 10);
      expect(fone.returnLoss).toBeCloseTo(EXPECTED_RETURNS.loss.D001 + EXPECTED_RETURNS.loss.D003, 10);
    });

    it('produto 100% devolvido zera receita mas mantém o prejuízo', () => {
      const caneca = byProduct(cmp.productRanking(), 'Caneca');
      expect(caneca.qty).toBe(0);
      expect(caneca.revenue).toBe(0);
      expect(caneca.returnedQty).toBe(1);
      expect(caneca.returnLoss).toBeCloseTo(EXPECTED_RETURNS.loss.D002, 10);
    });

    it('produto sem devolução fica intacto', () => {
      const mouse = byProduct(cmp.productRanking(), 'Mouse');
      expect(mouse.returnedQty).toBe(0);
      expect(mouse.returnRate).toBe(0);
      expect(mouse.returnLoss).toBe(0);
    });

    it('a soma do prejuízo por produto bate com o KPI global', () => {
      const soma = cmp.productRanking().reduce((a: number, p: any) => a + p.returnLoss, 0);
      expect(soma).toBeCloseTo(EXPECTED_RETURNS.kpis.returnLoss, 10);
    });
  });

  describe('bloco de resumo', () => {
    it('adiciona o 4º bloco Devoluções com os valores do KPI', () => {
      const blocks = cmp.resumeBlocks();
      expect(blocks).toHaveLength(4);
      const returns = blocks[3];
      expect(returns.title).toBe('analytics.resReturns');
      const value = (label: string) => returns.rows.find((r: any) => r.label === label).value;
      expect(value('returns.kpiCount')).toBe(EXPECTED_RETURNS.kpis.returnCount);
      expect(value('returns.kpiUnits')).toBe(EXPECTED_RETURNS.kpis.returnedUnits);
      expect(value('returns.kpiRate')).toBeCloseTo(EXPECTED_RETURNS.kpis.returnRate, 10);
      expect(value('dashboard.kpiReturnLoss')).toBeCloseTo(EXPECTED_RETURNS.kpis.returnLoss, 10);
    });
  });

  describe('exportação XLSX', () => {
    it('inclui a aba de Devoluções com as finalizadas', () => {
      cmp.exportAll();
      const [, sheets] = fakes.xlsx.download.mock.calls[0];
      expect(sheets).toHaveLength(5);
      const returnsSheet = sheets[4];
      expect(returnsSheet.name).toBe('analytics.sheetReturns');
      expect(returnsSheet.rows.map((r: any) => r.id).sort()).toEqual(['D001', 'D002', 'D003']);
    });

    it('o total de prejuízo da aba bate com o KPI do dashboard', () => {
      cmp.exportAll();
      const [, sheets] = fakes.xlsx.download.mock.calls[0];
      const soma = sheets[4].rows.reduce((a: number, r: any) => a + r.lossAmount, 0);
      expect(soma).toBeCloseTo(EXPECTED_RETURNS.kpis.returnLoss, 10);
    });

    it('a aba de produtos ganha as colunas de devolução', () => {
      cmp.exportAll();
      const [, sheets] = fakes.xlsx.download.mock.calls[0];
      const keys = sheets[0].columns.map((c: any) => c.key);
      expect(keys).toContain('returnedQty');
      expect(keys).toContain('returnLoss');
    });
  });
});

describe('AnalyticsComponent — regressão sem devoluções', () => {
  afterEach(() => { jest.useRealTimers(); TestBed.resetTestingModule(); });

  it('não adiciona a aba de Devoluções ao export', () => {
    jest.useFakeTimers();
    jest.setSystemTime(FROZEN_NOW);
    const h = setupComponentHarness(AnalyticsComponent, goldenDb());
    (h.component as any).exportAll();
    const [, sheets] = h.fakes.xlsx.download.mock.calls[0];
    expect(sheets).toHaveLength(4);
    expect((h.component as any).finalizedReturns()).toEqual([]);
  });

  it('mantém o bloco de resumo de devoluções zerado', () => {
    jest.useFakeTimers();
    jest.setSystemTime(FROZEN_NOW);
    const cmp: any = setupComponentHarness(AnalyticsComponent, goldenDb()).component;
    const rows = cmp.resumeBlocks()[3].rows;
    expect(rows.every((r: any) => r.value === 0)).toBe(true);
  });
});
