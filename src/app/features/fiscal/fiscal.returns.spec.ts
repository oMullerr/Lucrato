jest.mock('@angular/fire/firestore', () => ({
  Firestore: class Firestore {},
  doc: jest.fn(),
  setDoc: jest.fn(),
  onSnapshot: jest.fn(),
}));

jest.mock('ng2-charts', () => ({ BaseChartDirective: class BaseChartDirective {} }));

import { TestBed } from '@angular/core/testing';
import { FiscalComponent } from './fiscal.component';
import { setupComponentHarness } from '../../../testing/data-harness';
import { goldenDb, EXPECTED, FROZEN_NOW } from '../../../testing/golden-dataset';
import { goldenReturnsDb, EXPECTED_RETURNS } from '../../../testing/golden-returns';
import { makePurchase, makeSale, makeReturn } from '../../../testing/fixtures';

describe('FiscalComponent — devoluções reduzem o teto do MEI', () => {
  let cmp: any;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(FROZEN_NOW);
    cmp = setupComponentHarness(FiscalComponent, goldenReturnsDb()).component;
  });

  afterEach(() => {
    jest.useRealTimers();
    TestBed.resetTestingModule();
  });

  it('reduz o faturamento anual de 2026', () => {
    cmp.selectedYear.set(2026);
    expect(cmp.status().revenue).toBeCloseTo(EXPECTED_RETURNS.fiscal.revenue2026, 10);
    expect(cmp.status().revenue).toBe(370);
  });

  it('não afeta 2025 (sem devoluções naquele ano)', () => {
    cmp.selectedYear.set(2025);
    expect(cmp.status().revenue).toBeCloseTo(EXPECTED_RETURNS.fiscal.revenue2025, 10);
  });

  it('atribui a redução ao mês da VENDA, não ao da chegada', () => {
    cmp.selectedYear.set(2026);
    const monthly = cmp.status().monthly;
    // D001 chegou em 02/06 mas pertence à venda de 20/05.
    expect(monthly[4].revenue).toBeCloseTo(EXPECTED_RETURNS.fiscal.monthly2026.may, 10);
    expect(monthly[1].revenue).toBeCloseTo(EXPECTED_RETURNS.fiscal.monthly2026.feb, 10);
    expect(monthly[5].revenue).toBeCloseTo(EXPECTED_RETURNS.fiscal.monthly2026.jun, 10);
  });

  it('mantém a venda 100% devolvida na base, contribuindo zero', () => {
    // Se billableSales a descartasse pelo status, uma venda PARCIALMENTE
    // devolvida sairia inteira do faturamento. Este assert trava o contrato.
    const v003 = cmp.data.computedSales().find((s: any) => s.id === 'V003');
    expect(v003.countsAsRevenue).toBe(true);
    expect(v003.effectiveStatus).toBe('Devolvida');
    expect(v003.grossRevenue).toBe(0);
  });

  it('a projeção anual usa o faturamento já reduzido', () => {
    cmp.selectedYear.set(2026);
    expect(cmp.status().projectedAnnual).toBeCloseTo((370 / 6) * 12, 10);
  });
});

describe('FiscalComponent — devolução perto do teto', () => {
  afterEach(() => { jest.useRealTimers(); TestBed.resetTestingModule(); });

  function build(returns: any[]) {
    jest.useFakeTimers();
    jest.setSystemTime(FROZEN_NOW);
    const db = goldenReturnsDb({
      purchases: [makePurchase({ id: 'C001', quantityPurchased: 100, unitCost: 10 })],
      sales: [makeSale({
        id: 'V001', batchId: 'C001', quantitySold: 70, unitPrice: 1000,
        saleDate: '2026-03-10', feePercentage: 0.1, sellerShipping: 0,
      })],
      returns,
    });
    return setupComponentHarness(FiscalComponent, db).component as any;
  }

  it('devolução finalizada tira a apuração da faixa de perigo', () => {
    // Faixas do MEI: warn em 50% e danger em 80% do teto de 81.000.
    const semDevolucao = build([]);
    semDevolucao.selectedYear.set(2026);
    expect(semDevolucao.status().revenue).toBe(70_000); // 86,4% → danger
    expect(semDevolucao.status().band).toBe('danger');

    // O harness monta um TestBed por vez — reseta antes da segunda montagem.
    TestBed.resetTestingModule();
    const comDevolucao = build([makeReturn({
      id: 'D001', saleId: 'V001', batchId: 'C001', quantity: 10,
      requestDate: '2026-03-20', arrivalDate: '2026-03-25', destination: 'Estoque',
    })]);
    comDevolucao.selectedYear.set(2026);
    expect(comDevolucao.status().revenue).toBe(60_000); // 74,1% → warning
    expect(comDevolucao.status().band).toBe('warning');
    expect(comDevolucao.status().remaining).toBeCloseTo(81_000 - 60_000, 10);
  });

  it('devolução SOLICITADA não alivia o teto — o MEI conta o valor cheio', () => {
    const cmp = build([makeReturn({
      id: 'D001', saleId: 'V001', batchId: 'C001', quantity: 5,
      requestDate: '2026-03-20', arrivalDate: undefined, destination: 'Estoque',
    })]);
    cmp.selectedYear.set(2026);
    expect(cmp.status().revenue).toBe(70_000);
    expect(cmp.status().band).toBe('danger');
  });

  it('devolução no ano seguinte reduz o ano da VENDA', () => {
    const cmp = build([makeReturn({
      id: 'D001', saleId: 'V001', batchId: 'C001', quantity: 5,
      requestDate: '2026-12-28', arrivalDate: '2027-01-05', destination: 'Estoque',
    })]);
    cmp.selectedYear.set(2026);
    expect(cmp.status().revenue).toBe(65_000);
    cmp.selectedYear.set(2027);
    expect(cmp.status().revenue).toBe(0);
  });
});

describe('FiscalComponent — regressão sem devoluções', () => {
  afterEach(() => { jest.useRealTimers(); TestBed.resetTestingModule(); });

  it('mantém o faturamento do golden dataset', () => {
    jest.useFakeTimers();
    jest.setSystemTime(FROZEN_NOW);
    const cmp: any = setupComponentHarness(FiscalComponent, goldenDb()).component;
    cmp.selectedYear.set(2026);
    expect(cmp.status().revenue).toBeCloseTo(EXPECTED.fiscal.revenue2026, 10);
    cmp.selectedYear.set(2025);
    expect(cmp.status().revenue).toBeCloseTo(EXPECTED.fiscal.revenue2025, 10);
  });

  it('venda legada Devolvida SEM devolução continua fora do faturamento', () => {
    jest.useFakeTimers();
    jest.setSystemTime(FROZEN_NOW);
    const db = goldenReturnsDb({
      purchases: [makePurchase({ id: 'C001', quantityPurchased: 10, unitCost: 10 })],
      sales: [
        makeSale({ id: 'V001', batchId: 'C001', quantitySold: 1, unitPrice: 500, saleDate: '2026-03-10' }),
        makeSale({ id: 'V002', batchId: 'C001', quantitySold: 1, unitPrice: 900, saleDate: '2026-03-11', status: 'Devolvida' }),
      ],
      returns: [],
    });
    const cmp: any = setupComponentHarness(FiscalComponent, db).component;
    cmp.selectedYear.set(2026);
    expect(cmp.status().revenue).toBe(500);
  });
});
