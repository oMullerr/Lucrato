/**
 * Campos da integração com o Mercado Livre no DataService.
 *
 * O contrato aqui é de compatibilidade: uma base gravada antes da integração
 * tem de carregar exatamente igual, e os campos novos são todos opcionais.
 */
jest.mock('@angular/fire/firestore', () => ({
  Firestore: class Firestore {},
  doc: jest.fn((..._args: unknown[]) => ({ __doc: true, path: _args.slice(1).join('/') })),
  setDoc: jest.fn(),
  onSnapshot: jest.fn(),
  deleteField: jest.fn(() => ({ __delete: true })),
}));

import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { Firestore } from '@angular/fire/firestore';
import { DataService } from './data.service';
import { AuthService } from './auth.service';
import { NotifyService } from './notify.service';
import { ConnectionService } from './connection.service';
import { Database } from '../models/models';
import { makeFakeUser } from '../../../testing/firebase-mocks';
import { makePurchase, makeSale } from '../../../testing/fixtures';

const fakeTranslate = { instant: (key: string) => key } as unknown as TranslateService;

function setup(): DataService {
  const fakeAuth = {
    currentUser: signal<ReturnType<typeof makeFakeUser> | null | undefined>(makeFakeUser()),
    refreshIdToken: jest.fn().mockResolvedValue(undefined),
  };
  TestBed.configureTestingModule({
    providers: [
      DataService,
      { provide: Firestore, useValue: {} },
      { provide: AuthService, useValue: fakeAuth },
      { provide: NotifyService, useValue: { success: jest.fn(), warning: jest.fn(), error: jest.fn(), info: jest.fn() } },
      {
        provide: ConnectionService,
        useValue: {
          reportSnapshot: jest.fn(), reportSnapshotError: jest.fn(),
          syncError: signal<unknown>(null), clearSyncError: jest.fn(),
        },
      },
      { provide: TranslateService, useValue: fakeTranslate },
    ],
  });
  return TestBed.inject(DataService);
}

const migrate = (service: DataService, raw: unknown) =>
  (service as any).migrateDatabase(raw) as Database;

afterEach(() => TestBed.resetTestingModule());

describe('migração das configurações novas', () => {
  it('base antiga ganha mlAutoApply ligado por padrão', () => {
    expect(migrate(setup(), { settings: {} }).settings.mlAutoApply).toBe(true);
  });

  it('base antiga ganha imposto zero por padrão', () => {
    expect(migrate(setup(), { settings: {} }).settings.taxPercentage).toBe(0);
  });

  it('preserva a escolha do usuário quando já existe', () => {
    const s = migrate(setup(), { settings: { mlAutoApply: false, taxPercentage: 6 } }).settings;
    expect(s.mlAutoApply).toBe(false);
    expect(s.taxPercentage).toBe(6);
  });

  it('não mexe em nenhuma configuração existente', () => {
    const antes = { defaultMlFee: 0.17, returnWindowDays: 7, minimumMargin: 0.25 };
    const depois = migrate(setup(), { settings: antes }).settings;
    expect(depois.defaultMlFee).toBe(0.17);
    expect(depois.returnWindowDays).toBe(7);
    expect(depois.minimumMargin).toBe(0.25);
  });
});

describe('registros antigos continuam válidos', () => {
  it('compra sem sku carrega sem sku', () => {
    const migrated = migrate(setup(), {
      purchases: [makePurchase({ id: 'C001' })],
      settings: {},
    });
    expect(migrated.purchases[0].sku).toBeUndefined();
    expect(migrated.purchases[0].id).toBe('C001');
  });

  it('venda manual não ganha origem nem id externo', () => {
    const migrated = migrate(setup(), {
      sales: [makeSale({ id: 'V001', batchId: 'C001' })],
      settings: {},
    });
    expect(migrated.sales[0].source).toBeUndefined();
    expect(migrated.sales[0].externalId).toBeUndefined();
  });
});

describe('registros vindos da integração sobrevivem à migração', () => {
  it('mantém origem, id externo e ids do Mercado Livre', () => {
    const vendaDoMl = {
      ...makeSale({ id: 'V009', batchId: 'C001' }),
      source: 'mercadolivre' as const,
      externalId: '2000003508897196:MLB2608564035:0',
      mlOrderId: '2000003508897196',
      mlItemId: 'MLB2608564035',
      mlPackId: '2000003508553677',
      mlShipmentId: '41297142475',
    };
    const migrated = migrate(setup(), { sales: [vendaDoMl], settings: {} });
    expect(migrated.sales[0]).toEqual(vendaDoMl);
  });
});
