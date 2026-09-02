jest.mock('@angular/fire/firestore', () => ({
  Firestore: class Firestore {},
  doc: jest.fn(),
  setDoc: jest.fn(),
  onSnapshot: jest.fn(),
}));

import { TestBed } from '@angular/core/testing';
import { InventoryComponent } from './inventory.component';
import { setupComponentHarness } from '../../../testing/data-harness';
import { goldenDb, EXPECTED, FROZEN_NOW } from '../../../testing/golden-dataset';
import { goldenReturnsDb, EXPECTED_RETURNS } from '../../../testing/golden-returns';
import { makePurchase, makeSale, makeReturn } from '../../../testing/fixtures';

describe('InventoryComponent — devoluções', () => {
  let cmp: any;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(FROZEN_NOW);
    cmp = setupComponentHarness(InventoryComponent, goldenReturnsDb()).component;
  });

  afterEach(() => {
    jest.useRealTimers();
    TestBed.resetTestingModule();
  });

  it('devolve a unidade ao lote quando o destino é Estoque', () => {
    const c001 = cmp.data.computedPurchases().find((p: any) => p.id === 'C001');
    expect(c001.currentStock).toBe(EXPECTED_RETURNS.inventory.stockC001);
    expect(c001.returnedToStock).toBe(1);
  });

  it('Perda não repõe estoque', () => {
    const c002 = cmp.data.computedPurchases().find((p: any) => p.id === 'C002');
    expect(c002.currentStock).toBe(EXPECTED_RETURNS.inventory.stockC002);
    expect(c002.returnedToStock).toBe(0);
  });

  it('capital parado do KPI sobe o custo da unidade devolvida', () => {
    expect(cmp.kpis().idleCapital).toBeCloseTo(EXPECTED_RETURNS.kpis.idleCapital, 10);
  });

  it('o ponto final da sparkline de capital parado bate com o KPI', () => {
    const pts = cmp.idleSparkline();
    expect(pts[pts.length - 1]).toBeCloseTo(cmp.kpis().idleCapital, 10);
  });
});

/**
 * A sparkline de capital parado é a ÚNICA agregação do app que não atribui a
 * devolução ao mês da venda: é uma série histórica de estoque, e a unidade
 * reentra na prateleira na data de CHEGADA.
 */
describe('InventoryComponent — idleSparkline usa a data de CHEGADA', () => {
  afterEach(() => { jest.useRealTimers(); TestBed.resetTestingModule(); });

  function build(arrivalDate: string | undefined, destination: any = 'Estoque') {
    jest.useFakeTimers();
    jest.setSystemTime(FROZEN_NOW); // 2026-06-15
    const db = goldenReturnsDb({
      purchases: [makePurchase({
        id: 'C001', quantityPurchased: 10, unitCost: 10,
        purchaseShipping: 0, otherCosts: 0, receiptDate: '2026-01-01',
      })],
      sales: [makeSale({
        id: 'V001', batchId: 'C001', quantitySold: 4, unitPrice: 50,
        saleDate: '2026-05-20',
      })],
      returns: [makeReturn({
        id: 'D001', saleId: 'V001', batchId: 'C001', quantity: 2,
        requestDate: '2026-06-08', arrivalDate, destination, returnShipping: 0,
      })],
    });
    return setupComponentHarness(InventoryComponent, db).component as any;
  }

  it('a unidade só volta à curva a partir do dia da chegada', () => {
    const cmp = build('2026-06-10');
    const pts = cmp.idleSparkline();
    expect(pts).toHaveLength(30);
    // Janela = últimos 30 dias (17/05 a 15/06). Índice 0 = 17/05.
    // Antes da venda (20/05): 10 un. × 10 = 100.
    expect(pts[0]).toBeCloseTo(100, 10);
    // Dia 09/06 (índice 23), ainda sem a chegada: 10 − 4 = 6 un. → 60.
    expect(pts[23]).toBeCloseTo(60, 10);
    // Dia 10/06 (índice 24), chegada registrada: 6 + 2 = 8 un. → 80.
    expect(pts[24]).toBeCloseTo(80, 10);
    expect(pts[pts.length - 1]).toBeCloseTo(80, 10);
  });

  it('devolução ainda Solicitada não entra em ponto nenhum da curva', () => {
    const cmp = build(undefined);
    const pts = cmp.idleSparkline();
    expect(pts[pts.length - 1]).toBeCloseTo(60, 10);
    expect(pts.every((p: number) => p <= 100)).toBe(true);
  });

  it('destino Perda não devolve a unidade à curva', () => {
    const cmp = build('2026-06-10', 'Perda');
    const pts = cmp.idleSparkline();
    expect(pts[pts.length - 1]).toBeCloseTo(60, 10);
  });

  it('chegada FUTURA não infla os pontos históricos', () => {
    // Chegada depois de FROZEN_NOW: nenhum ponto da janela pode subir.
    const cmp = build('2026-06-20');
    const pts = cmp.idleSparkline();
    expect(pts[pts.length - 1]).toBeCloseTo(60, 10);
  });
});

describe('InventoryComponent — regressão sem devoluções', () => {
  afterEach(() => { jest.useRealTimers(); TestBed.resetTestingModule(); });

  it('mantém estoque, capital parado e sparkline do golden dataset', () => {
    jest.useFakeTimers();
    jest.setSystemTime(FROZEN_NOW);
    const cmp: any = setupComponentHarness(InventoryComponent, goldenDb()).component;
    expect(cmp.kpis().idleCapital).toBeCloseTo(EXPECTED.kpis.idleCapital, 10);
    const pts = cmp.idleSparkline();
    expect(pts[pts.length - 1]).toBeCloseTo(EXPECTED.kpis.idleCapital, 10);
    for (const [id, stock] of Object.entries(EXPECTED.inventory.stockById)) {
      expect(cmp.data.computedPurchases().find((p: any) => p.id === id).currentStock).toBe(stock);
    }
  });
});
