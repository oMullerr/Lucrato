jest.mock('@angular/fire/firestore', () => ({
  Firestore: class Firestore {},
  doc: jest.fn(),
  setDoc: jest.fn(),
  onSnapshot: jest.fn(),
}));

import { TestBed } from '@angular/core/testing';
import { PurchasesComponent } from './purchases.component';
import { setupComponentHarness } from '../../../testing/data-harness';
import { goldenDb, EXPECTED, FROZEN_NOW } from '../../../testing/golden-dataset';

describe('PurchasesComponent (tela Compras — valores exibidos)', () => {
  let cmp: any;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(FROZEN_NOW);
    const h = setupComponentHarness(PurchasesComponent, goldenDb());
    cmp = h.component;
  });

  afterEach(() => {
    jest.useRealTimers();
    TestBed.resetTestingModule();
  });

  describe('totals() — chips por status', () => {
    it('contagens por status no relógio congelado', () => {
      const t = cmp.totals();
      expect(t.all).toBe(6);
      expect(t['Em trânsito']).toBe(1); // C003 sem receiptDate
      expect(t['Em Estoque']).toBe(1);  // C002 (21 dias < 25)
      expect(t['Atenção']).toBe(1);     // C004 (27 dias, entre 25 e 30)
      expect(t['Parado']).toBe(1);      // C001 (151 dias ≥ 30)
      expect(t['Vendido']).toBe(2);     // C005 (esgotado) + C006 (qty 0)
    });
  });

  describe('filteredPurchases() — ordenação e filtros', () => {
    it('ordem padrão: data de compra desc, id numérico desc no empate', () => {
      // C003 e C006 têm a mesma data (2026-06-01) → C006 vem antes (id maior)
      const ids = cmp.filteredPurchases().map((c: any) => c.id);
      expect(ids).toEqual(['C006', 'C003', 'C004', 'C002', 'C001', 'C005']);
    });

    it('filtro por status Vendido', () => {
      cmp.statusFilter.set('Vendido');
      const ids = cmp.filteredPurchases().map((c: any) => c.id);
      expect(ids).toEqual(['C006', 'C005']);
    });

    it('filtro de texto casa produto, id, categoria e fornecedor', () => {
      cmp.textFilter.set('techimport'); // fornecedor
      expect(cmp.filteredPurchases().map((c: any) => c.id)).toEqual(['C003', 'C001', 'C005']);

      cmp.textFilter.set('casa'); // categoria "Casa" e fornecedor "CasaForte"
      expect(cmp.filteredPurchases().map((c: any) => c.id)).toEqual(['C006', 'C004', 'C002']);

      cmp.textFilter.set('c001'); // id
      expect(cmp.filteredPurchases().map((c: any) => c.id)).toEqual(['C001']);
    });

    it('ordenação por coluna quantityPurchased asc', () => {
      cmp.sortState.set({ active: 'quantityPurchased', direction: 'asc' });
      const ids = cmp.filteredPurchases().map((c: any) => c.id);
      expect(ids).toEqual(['C006', 'C005', 'C002', 'C004', 'C001', 'C003']); // 0,2,5,8,10,20
    });

    it('paginação: pageSize 2, página 2 → fatia [2..4) da ordem padrão', () => {
      cmp.pageState.set({ pageIndex: 1, pageSize: 2, length: 6 });
      const ids = cmp.pagedPurchases().map((c: any) => c.id);
      expect(ids).toEqual(['C004', 'C002']);
    });
  });

  describe('valores por linha (ComputedPurchase exibido na tabela)', () => {
    it('custo total real, custo unitário, estoque, capital parado e dias em estoque', () => {
      const byId = new Map(cmp.filteredPurchases().map((c: any) => [c.id, c]));

      const c001: any = byId.get('C001');
      expect(c001.totalActualCost).toBeCloseTo(10 * 50 + 20 + 10, 10);
      expect(c001.actualUnitCost).toBeCloseTo(EXPECTED.unit.C001, 10);
      expect(c001.currentStock).toBe(EXPECTED.inventory.stockById.C001);
      expect(c001.idleValue).toBeCloseTo(EXPECTED.inventory.idleById.C001, 10);
      expect(c001.daysInStock).toBe(EXPECTED.inventory.daysInStock.C001);

      const c005: any = byId.get('C005');
      expect(c005.currentStock).toBe(0);
      expect(c005.idleValue).toBe(0);
      // dias congelam na última venda (2025-12-15), não em "hoje"
      expect(c005.daysInStock).toBe(EXPECTED.inventory.daysInStock.C005);

      const c006: any = byId.get('C006');
      expect(c006.actualUnitCost).toBe(0); // guard de divisão por zero (qty 0)
      expect(c006.totalActualCost).toBeCloseTo(0 * 100 + 50, 10);
    });

    it('status por lote bate com a referência', () => {
      const byId = new Map(cmp.filteredPurchases().map((c: any) => [c.id, c]));
      for (const [id, status] of Object.entries(EXPECTED.inventory.statusById)) {
        expect((byId.get(id) as any).status).toBe(status);
      }
    });

    it('venda cancelada (V004) não consome estoque do lote C002', () => {
      const c002: any = cmp.filteredPurchases().find((c: any) => c.id === 'C002');
      expect(c002.quantitySold).toBe(1); // só V003; V004 cancelada fica fora
      expect(c002.currentStock).toBe(5 - 1);
    });
  });

  describe('filtro por intervalo de datas (dateBounds)', () => {
    // bounds em UTC (mesmo parse de purchaseDate) → asserções independem do fuso da máquina
    it('recorta a lista ao intervalo; compras fora do range saem', () => {
      // 15/04 → 30/06: C006(06-01), C003(06-01), C004(05-15), C002(05-01) dentro; C001(01-10), C005(2025) fora
      cmp.dateBounds.set({ start: new Date('2026-04-15'), end: new Date('2026-06-30') });
      expect(cmp.filteredPurchases().map((c: any) => c.id)).toEqual(['C006', 'C003', 'C004', 'C002']);
    });

    it('é inclusivo nas duas pontas (compra exatamente no limite entra)', () => {
      const d = new Date('2026-05-15'); // instante exato de C004
      cmp.dateBounds.set({ start: d, end: d });
      expect(cmp.filteredPurchases().map((c: any) => c.id)).toEqual(['C004']);
    });

    it('dateBounds null → ordem padrão completa (sem recorte)', () => {
      cmp.dateBounds.set(null);
      expect(cmp.filteredPurchases().map((c: any) => c.id))
        .toEqual(['C006', 'C003', 'C004', 'C002', 'C001', 'C005']);
    });

    it('combina com status (AND): Vendido + ano de 2026 → só C006 (C005 é de 2025)', () => {
      cmp.statusFilter.set('Vendido'); // C005 (2025-11) e C006 (2026-06)
      cmp.dateBounds.set({ start: new Date('2026-01-01'), end: new Date('2026-12-31') });
      expect(cmp.filteredPurchases().map((c: any) => c.id)).toEqual(['C006']);
    });
  });
});
