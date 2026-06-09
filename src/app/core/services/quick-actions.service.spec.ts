import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { MatDialog } from '@angular/material/dialog';
import { TranslateService } from '@ngx-translate/core';
import { QuickActionsService } from './quick-actions.service';
import { DataService } from './data.service';
import { NotifyService } from './notify.service';
import { Purchase } from '../models/models';

/** Minimal TranslateService stub: returns the key so assertions stay text-agnostic. */
const fakeTranslate = { instant: (key: string) => key } as unknown as TranslateService;

function makePurchase(overrides: Partial<Purchase> = {}): Purchase {
  return {
    id: 'C001',
    product: 'Produto X',
    category: 'Eletrônicos',
    supplier: 'Fornecedor Y',
    purchaseDate: '2025-01-01',
    receiptDate: '',
    quantityPurchased: 10,
    unitCost: 100,
    purchaseShipping: 0,
    otherCosts: 0,
    ...overrides,
  };
}

describe('QuickActionsService.markReceivedToday', () => {
  let service: QuickActionsService;
  let dialogOpen: jest.Mock;
  let updatePurchase: jest.Mock;
  let notifySuccess: jest.Mock;

  function setup(dialogResult: unknown) {
    dialogOpen = jest.fn().mockReturnValue({ afterClosed: () => of(dialogResult) });
    updatePurchase = jest.fn();
    notifySuccess = jest.fn();

    TestBed.configureTestingModule({
      providers: [
        QuickActionsService,
        { provide: MatDialog, useValue: { open: dialogOpen } },
        { provide: DataService, useValue: { updatePurchase } },
        { provide: NotifyService, useValue: { success: notifySuccess } },
        { provide: TranslateService, useValue: fakeTranslate },
      ],
    });
    service = TestBed.inject(QuickActionsService);
  }

  afterEach(() => {
    TestBed.resetTestingModule();
    jest.useRealTimers();
  });

  it('confirmado: grava receiptDate com a data local de hoje e notifica', () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 4, 29, 10, 0, 0)); // 29/05/2026, horário local
    setup({ confirmed: true });

    service.markReceivedToday(makePurchase({ id: 'C007', receiptDate: '' }));

    expect(updatePurchase).toHaveBeenCalledWith('C007', { receiptDate: '2026-05-29' });
    expect(notifySuccess).toHaveBeenCalledTimes(1);
  });

  it('cancelado: não grava nada nem notifica', () => {
    setup(false);

    service.markReceivedToday(makePurchase({ receiptDate: '' }));

    expect(updatePurchase).not.toHaveBeenCalled();
    expect(notifySuccess).not.toHaveBeenCalled();
  });

  it('lote que já tem receiptDate: no-op, nem abre o diálogo', () => {
    setup({ confirmed: true });

    service.markReceivedToday(makePurchase({ receiptDate: '2026-01-05' }));

    expect(dialogOpen).not.toHaveBeenCalled();
    expect(updatePurchase).not.toHaveBeenCalled();
  });
});
