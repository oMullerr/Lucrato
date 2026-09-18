jest.mock('@angular/fire/firestore', () => ({
  Firestore: class Firestore {},
  doc: jest.fn(),
  setDoc: jest.fn(),
  onSnapshot: jest.fn(),
}));

import { TestBed } from '@angular/core/testing';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { SaleFormDialogComponent } from './sale-form.dialog';
import { DataService } from '../../core/services/data.service';

/**
 * Regressão de fuso: o default de saleDate deve usar o dia de calendário LOCAL,
 * não `toISOString()` (UTC). Das 21h às 23h59 (BRT) a data UTC já virou.
 */
describe('SaleFormDialogComponent — default de data (fuso)', () => {
  const originalTz = process.env['TZ'];

  beforeAll(() => { process.env['TZ'] = 'America/Sao_Paulo'; });
  afterAll(() => { process.env['TZ'] = originalTz; });

  beforeEach(() => { jest.useFakeTimers(); });
  afterEach(() => {
    jest.useRealTimers();
    TestBed.resetTestingModule();
  });

  function build(): SaleFormDialogComponent {
    const fakeData = {
      nextSaleId: () => 'V001',
      settings: () => ({ defaultChannel: 'Mercado Livre', defaultMlFee: 0.12 }),
    };
    TestBed.configureTestingModule({
      providers: [
        SaleFormDialogComponent,
        { provide: DataService, useValue: fakeData },
        { provide: DialogRef, useValue: { close: jest.fn() } },
        { provide: DIALOG_DATA, useValue: {} },
      ],
    });
    return TestBed.inject(SaleFormDialogComponent);
  }

  it('às 21h30 BRT usa a data local (hoje), não a data UTC de amanhã', () => {
    const noite = new Date('2026-07-07T00:30:00Z'); // 06/07 21:30 em São Paulo
    expect(noite.getTimezoneOffset()).toBe(180); // guard: processo em UTC-3
    jest.setSystemTime(noite);

    const cmp = build();

    expect((cmp as any).model().saleDate).toBe('2026-07-06');
  });
});

/**
 * O formulário NÃO tem campo de status, e até setembro/2026 ele gravava
 * 'Concluída' em toda edição. Abrir uma venda cancelada só para corrigir a
 * observação ressuscitava o faturamento dela — mudando receita, lucro e teto do
 * MEI sem uma linha na tela.
 *
 * A regra correta é a mesma de `DataService.syncSaleStatus`: só o par
 * Concluída ↔ Devolvida é automático; o que o dono escolheu à mão fica.
 */
describe('SaleFormDialogComponent — status na edição', () => {
  afterEach(() => TestBed.resetTestingModule());

  function editar(sale: Record<string, unknown>): SaleFormDialogComponent {
    TestBed.configureTestingModule({
      providers: [
        SaleFormDialogComponent,
        {
          provide: DataService,
          useValue: {
            nextSaleId: () => 'V999',
            settings: () => ({ defaultChannel: 'Mercado Livre', defaultMlFee: 0.12 }),
            findPurchase: () => undefined,
            computedPurchases: () => [],
          },
        },
        { provide: DialogRef, useValue: { close: jest.fn() } },
        { provide: DIALOG_DATA, useValue: { sale } },
      ],
    });
    return TestBed.inject(SaleFormDialogComponent);
  }

  const base = {
    id: 'V001', batchId: 'C001', product: 'Furadeira', quantitySold: 1,
    unitPrice: 100, saleDate: '2026-07-06', channel: 'Mercado Livre',
    feePercentage: 0.12, sellerShipping: 0, discount: 0, otherCosts: 0,
  };

  it('preserva Cancelada', () => {
    expect((editar({ ...base, status: 'Cancelada' }) as any).model().status).toBe('Cancelada');
  });

  it('preserva Em disputa', () => {
    expect((editar({ ...base, status: 'Em disputa' }) as any).model().status).toBe('Em disputa');
  });

  it('normaliza Devolvida — quem manda nesse par são as devoluções', () => {
    expect((editar({ ...base, status: 'Devolvida' }) as any).model().status).toBe('Concluída');
  });

  it('Concluída continua Concluída', () => {
    expect((editar({ ...base, status: 'Concluída' }) as any).model().status).toBe('Concluída');
  });
});

describe('SaleFormDialogComponent — origem do registro', () => {
  afterEach(() => TestBed.resetTestingModule());

  function editar(sale: Record<string, unknown>): SaleFormDialogComponent {
    TestBed.configureTestingModule({
      providers: [
        SaleFormDialogComponent,
        {
          provide: DataService,
          useValue: {
            nextSaleId: () => 'V999',
            settings: () => ({ defaultChannel: 'Mercado Livre', defaultMlFee: 0.12 }),
            findPurchase: () => undefined,
            computedPurchases: () => [],
          },
        },
        { provide: DialogRef, useValue: { close: jest.fn() } },
        { provide: DIALOG_DATA, useValue: { sale } },
      ],
    });
    return TestBed.inject(SaleFormDialogComponent);
  }

  const base = {
    id: 'V001', batchId: 'C001', product: 'Furadeira', quantitySold: 1,
    unitPrice: 100, saleDate: '2026-07-06', channel: 'Mercado Livre',
    feePercentage: 0.12, sellerShipping: 0, discount: 0, otherCosts: 0,
    status: 'Concluída',
  };

  it('reconhece a venda vinda da integração', () => {
    const cmp = editar({ ...base, source: 'mercadolivre', mlOrderId: '2000017682273464' });
    expect((cmp as any).veioDoMl()).toBe(true);
  });

  it('venda digitada à mão não recebe o aviso', () => {
    expect((editar(base) as any).veioDoMl()).toBe(false);
  });

  it('editar preserva os campos da integração', () => {
    // Sem isto, corrigir uma observação apagaria o vínculo com o pedido — e a
    // venda voltaria a aparecer como duplicata na próxima sincronização.
    const cmp = editar({
      ...base,
      source: 'mercadolivre',
      externalId: '2000017682273464:MLB1',
      mlOrderId: '2000017682273464',
      mlItemId: 'MLB1',
    });
    const m = (cmp as any).model();
    expect(m.source).toBe('mercadolivre');
    expect(m.externalId).toBe('2000017682273464:MLB1');
    expect(m.mlOrderId).toBe('2000017682273464');
    expect(m.mlItemId).toBe('MLB1');
  });
});
