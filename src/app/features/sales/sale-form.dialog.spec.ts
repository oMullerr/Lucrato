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
