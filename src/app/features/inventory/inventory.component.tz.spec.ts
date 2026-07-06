jest.mock('@angular/fire/firestore', () => ({
  Firestore: class Firestore {},
  doc: jest.fn(),
  setDoc: jest.fn(),
  onSnapshot: jest.fn(),
}));

import { TestBed } from '@angular/core/testing';
import { InventoryComponent } from './inventory.component';
import { setupComponentHarness } from '../../../testing/data-harness';
import { makeFakeDatabase } from '../../../testing/firebase-mocks';
import { makePurchase, makeSale } from '../../../testing/fixtures';

/**
 * Regressão de fuso das sparklines (30 dias): os baldes precisam alinhar ao dia de
 * calendário LOCAL, igual a daysInStock. O código antigo misturava `ref` local
 * (setHours) com `new Date(dateString)` (meia-noite UTC), o que em UTC-3 fazia um
 * lote/venda aparecer no balde do dia ANTERIOR à data real (off-by-one de 1 balde).
 *
 * now = 2026-07-15T12:00:00Z → hoje local 15/07 em São Paulo.
 * Janela 30d = [16/06 .. 15/07]; points[k] = dia (15/07 - (29 - k)).
 *   points[29]=15/07, points[20]=06/07, points[19]=05/07.
 */
describe('InventoryComponent — sparklines por dia local (fuso)', () => {
  const originalTz = process.env['TZ'];
  let cmp: any;

  beforeAll(() => { process.env['TZ'] = 'America/Sao_Paulo'; });
  afterAll(() => { process.env['TZ'] = originalTz; });

  beforeEach(() => {
    jest.useFakeTimers();
    const noon = new Date('2026-07-15T12:00:00Z');
    expect(noon.getTimezoneOffset()).toBe(180); // guard: processo em UTC-3
    jest.setSystemTime(noon);
  });

  afterEach(() => {
    jest.useRealTimers();
    TestBed.resetTestingModule();
  });

  it('idleSparkline: lote recebido 06/07 entra no balde de 06/07, não no de 05/07', () => {
    const db = makeFakeDatabase({
      purchases: [
        makePurchase({
          id: 'C001', receiptDate: '2026-07-06', purchaseDate: '2026-07-01',
          quantityPurchased: 10, unitCost: 100, purchaseShipping: 0, otherCosts: 0,
        }),
      ],
      sales: [],
    });
    cmp = setupComponentHarness(InventoryComponent, db).component;

    const pts = cmp.idleSparkline();
    expect(pts).toHaveLength(30);
    expect(pts[19]).toBe(0);      // 05/07 — antes do recebimento
    expect(pts[20]).toBeCloseTo(1000, 10); // 06/07 — 10 × custo unit 100
    expect(pts[29]).toBeCloseTo(1000, 10); // hoje 15/07
  });

  it('revenue/margin: venda de 06/07 não vaza para o balde de 05/07', () => {
    const db = makeFakeDatabase({
      purchases: [
        makePurchase({
          id: 'C001', receiptDate: '2026-07-01', purchaseDate: '2026-07-01',
          quantityPurchased: 10, unitCost: 10, purchaseShipping: 0, otherCosts: 0,
        }),
      ],
      sales: [
        makeSale({ id: 'V001', batchId: 'C001', saleDate: '2026-07-06', quantitySold: 1, unitPrice: 100 }),
        makeSale({ id: 'V002', batchId: 'C001', saleDate: '2026-07-10', quantitySold: 1, unitPrice: 100 }),
      ],
    });
    cmp = setupComponentHarness(InventoryComponent, db).component;

    const rev = cmp.revenueSparkline();
    expect(rev[19]).toBe(0);            // 05/07 — nada vendido ainda
    expect(rev[20]).toBeGreaterThan(0); // 06/07 — primeira venda entra aqui

    const margin = cmp.marginSparkline();
    expect(margin[19]).toBe(0);         // 05/07 — sem receita → margem 0
  });
});
