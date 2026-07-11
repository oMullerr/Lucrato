jest.mock('@angular/fire/firestore', () => ({
  Firestore: class Firestore {},
  doc: jest.fn(),
  setDoc: jest.fn(),
  onSnapshot: jest.fn(),
}));

import { TestBed } from '@angular/core/testing';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { PurchaseFormDialogComponent } from './purchase-form.dialog';
import { DataService } from '../../core/services/data.service';

/**
 * Regressão de fuso: o default de purchaseDate deve usar o dia de calendário
 * LOCAL, não `toISOString()` (UTC). Das 21h às 23h59 (BRT) a data UTC já virou,
 * o que preenchia "amanhã" e travava o salvar (validação de data futura).
 */
describe('PurchaseFormDialogComponent — default de data (fuso)', () => {
  const originalTz = process.env['TZ'];

  beforeAll(() => { process.env['TZ'] = 'America/Sao_Paulo'; });
  afterAll(() => { process.env['TZ'] = originalTz; });

  beforeEach(() => { jest.useFakeTimers(); });
  afterEach(() => {
    jest.useRealTimers();
    TestBed.resetTestingModule();
  });

  function build(): PurchaseFormDialogComponent {
    const fakeData = {
      nextPurchaseId: () => 'C001',
      settings: () => ({ defaultShipping: 0 }),
    };
    TestBed.configureTestingModule({
      providers: [
        PurchaseFormDialogComponent,
        { provide: DataService, useValue: fakeData },
        { provide: DialogRef, useValue: { close: jest.fn() } },
        { provide: DIALOG_DATA, useValue: {} },
      ],
    });
    return TestBed.inject(PurchaseFormDialogComponent);
  }

  it('às 21h30 BRT usa a data local (hoje), não a data UTC de amanhã', () => {
    const noite = new Date('2026-07-07T00:30:00Z'); // 06/07 21:30 em São Paulo
    expect(noite.getTimezoneOffset()).toBe(180); // guard: processo em UTC-3
    jest.setSystemTime(noite);

    const cmp = build();

    expect((cmp as any).model().purchaseDate).toBe('2026-07-06');
  });
});

describe('PurchaseFormDialogComponent — produto (picker, prefill, auto-fill)', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-07-01T12:00:00Z'));
  });
  afterEach(() => {
    jest.useRealTimers();
    TestBed.resetTestingModule();
  });

  const validModel = {
    id: 'C001', product: 'X', category: 'A', supplier: 'B', link: '',
    purchaseDate: '2026-01-01', receiptDate: '', quantityPurchased: 1,
    unitCost: 10, purchaseShipping: 0, otherCosts: 0, notes: '',
  };

  function build(opts: { data?: unknown; purchases?: any[]; ref?: { close: jest.Mock } } = {}) {
    const ref = opts.ref ?? { close: jest.fn() };
    const purchases = opts.purchases ?? [];
    const fakeData = {
      nextPurchaseId: () => 'C001',
      settings: () => ({ defaultShipping: 0 }),
      purchases: () => purchases,
      computedPurchases: () => [],
      productNames: () => [...new Set(purchases.map(p => p.product.trim()))],
    };
    TestBed.configureTestingModule({
      providers: [
        PurchaseFormDialogComponent,
        { provide: DataService, useValue: fakeData },
        { provide: DialogRef, useValue: ref },
        { provide: DIALOG_DATA, useValue: opts.data ?? {} },
      ],
    });
    return { cmp: TestBed.inject(PurchaseFormDialogComponent), ref };
  }

  it('trima o nome do produto ao salvar', () => {
    const { cmp, ref } = build();
    (cmp as any).model.set({ ...validModel, product: '  Pipoqueira  ' });

    (cmp as any).save();

    expect(ref.close).toHaveBeenCalledWith(expect.objectContaining({ product: 'Pipoqueira' }));
  });

  it('modo prefill: cria nova compra pré-preenchida com id novo (não é edição)', () => {
    const { cmp } = build({
      data: { prefill: { product: 'Pipoqueira', category: 'Eletro', supplier: 'Amazon', link: 'http://x' } },
    });
    const m = (cmp as any).model();

    expect((cmp as any).isEdit()).toBe(false);
    expect(m.id).toBe('C001');
    expect(m.product).toBe('Pipoqueira');
    expect(m.category).toBe('Eletro');
    expect(m.supplier).toBe('Amazon');
    expect(m.link).toBe('http://x');
    // Campos "do lote" ficam em branco/default para o usuário informar.
    expect(m.quantityPurchased).toBe(1);
    expect(m.unitCost).toBe(0);
  });

  it('ao escolher produto existente em compra nova, auto-preenche campos vazios do ÚLTIMO lote', () => {
    const purchases = [
      { id: 'C001', product: 'Pipoqueira', category: 'EletroVelho', supplier: 'AmazonVelho', link: 'http://old', purchaseDate: '2026-01-01', quantityPurchased: 1, unitCost: 1, purchaseShipping: 0, otherCosts: 0 },
      { id: 'C009', product: 'Pipoqueira', category: 'EletroNovo', supplier: 'AmazonNovo', link: 'http://new', purchaseDate: '2026-05-01', quantityPurchased: 1, unitCost: 1, purchaseShipping: 0, otherCosts: 0 },
    ];
    const { cmp } = build({ purchases });

    (cmp as any).onProductChange('Pipoqueira');
    const m = (cmp as any).model();

    expect(m.product).toBe('Pipoqueira');
    expect(m.category).toBe('EletroNovo');
    expect(m.supplier).toBe('AmazonNovo');
    expect(m.link).toBe('http://new');
  });

  it('não sobrescreve campos já preenchidos ao trocar de produto', () => {
    const purchases = [
      { id: 'C001', product: 'Pipoqueira', category: 'EletroNovo', supplier: 'AmazonNovo', link: 'http://new', purchaseDate: '2026-05-01', quantityPurchased: 1, unitCost: 1, purchaseShipping: 0, otherCosts: 0 },
    ];
    const { cmp } = build({ purchases });
    (cmp as any).set('category', 'MinhaCategoria');

    (cmp as any).onProductChange('Pipoqueira');
    const m = (cmp as any).model();

    expect(m.category).toBe('MinhaCategoria'); // preservado
    expect(m.supplier).toBe('AmazonNovo');     // estava vazio → preenchido
  });
});
