// Mock do @angular/fire/firestore
jest.mock('@angular/fire/firestore', () => ({
  Firestore: class Firestore {},
  doc: jest.fn((..._args: unknown[]) => ({ __doc: true, path: _args.slice(1).join('/') })),
  setDoc: jest.fn(),
  onSnapshot: jest.fn(),
}));

import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { Firestore, doc, setDoc, onSnapshot } from '@angular/fire/firestore';
import { DataService } from './data.service';
import { AuthService } from './auth.service';
import { NotifyService } from './notify.service';
import { ConnectionService } from './connection.service';
import { Purchase, Sale, Database } from '../models/models';
import { makeFakeUser, makeFakeDatabase, makeFakeSnapshot } from '../../../testing/firebase-mocks';

function makePurchase(overrides: Partial<Purchase> = {}): Purchase {
  return {
    id: 'C001',
    product: 'Produto',
    category: 'Cat',
    supplier: 'Forn',
    purchaseDate: '2025-01-01',
    receiptDate: '2025-01-05',
    quantityPurchased: 10,
    unitCost: 100,
    purchaseShipping: 0,
    otherCosts: 0,
    ...overrides,
  };
}

function makeSale(overrides: Partial<Sale> = {}): Sale {
  return {
    id: 'V001',
    batchId: 'C001',
    product: 'Produto',
    quantitySold: 1,
    unitPrice: 200,
    saleDate: '2025-02-01',
    channel: 'Mercado Livre',
    feePercentage: 0.1,
    shippingType: 'correios',
    sellerShipping: 10,
    discount: 0,
    otherCosts: 0,
    status: 'Concluída',
    ...overrides,
  };
}

interface TestHarness {
  service: DataService;
  fakeAuth: {
    currentUser: ReturnType<typeof signal<ReturnType<typeof makeFakeUser> | null | undefined>>;
    refreshIdToken: jest.Mock;
  };
  fakeNotify: { success: jest.Mock; warning: jest.Mock; error: jest.Mock; info: jest.Mock };
  fakeConnection: {
    reportSnapshot: jest.Mock;
    reportSnapshotError: jest.Mock;
    syncError: ReturnType<typeof signal<unknown>>;
    clearSyncError: jest.Mock;
  };
}

function setupHarness(initialUser: ReturnType<typeof makeFakeUser> | null | undefined = undefined): TestHarness {
  const currentUserSig = signal<ReturnType<typeof makeFakeUser> | null | undefined>(initialUser);
  const syncErrorSig = signal<unknown>(null);
  const fakeAuth = {
    currentUser: currentUserSig,
    refreshIdToken: jest.fn().mockResolvedValue(undefined),
  };
  const fakeNotify = {
    success: jest.fn(),
    warning: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
  };
  const fakeConnection = {
    reportSnapshot: jest.fn(),
    reportSnapshotError: jest.fn(),
    syncError: syncErrorSig,
    clearSyncError: jest.fn(),
  };

  TestBed.configureTestingModule({
    providers: [
      DataService,
      { provide: Firestore, useValue: {} },
      { provide: AuthService, useValue: fakeAuth },
      { provide: NotifyService, useValue: fakeNotify },
      { provide: ConnectionService, useValue: fakeConnection },
    ],
  });

  const service = TestBed.inject(DataService);
  return { service, fakeAuth, fakeNotify, fakeConnection };
}

function loadDb(service: DataService, db: Database = makeFakeDatabase()): void {
  (service as any).db.set(db);
}

describe('DataService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (setDoc as jest.Mock).mockResolvedValue(undefined);
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  // ─── Computed signals ──────────────────────────────

  describe('computed signals', () => {
    it('loaded = false quando db é null', () => {
      const { service } = setupHarness();
      expect(service.loaded()).toBe(false);
    });

    it('loaded = true após snapshot', () => {
      const { service } = setupHarness();
      loadDb(service);
      expect(service.loaded()).toBe(true);
    });

    it('purchases/sales/settings retornam vazios quando db é null', () => {
      const { service } = setupHarness();
      expect(service.purchases()).toEqual([]);
      expect(service.sales()).toEqual([]);
      expect(service.settings()).toBeNull();
    });

    it('computedPurchases aplica calculatePurchase em cada item', () => {
      const { service } = setupHarness();
      loadDb(service, makeFakeDatabase({
        purchases: [makePurchase({ id: 'C001', quantityPurchased: 10, unitCost: 100 })],
        sales: [],
      }));
      const cp = service.computedPurchases();
      expect(cp).toHaveLength(1);
      expect(cp[0].totalPurchaseCost).toBe(1000);
    });

    it('computedSales aplica calculateSale em cada item', () => {
      const { service } = setupHarness();
      loadDb(service, makeFakeDatabase({
        purchases: [makePurchase()],
        sales: [makeSale({ quantitySold: 2, unitPrice: 100 })],
      }));
      const cs = service.computedSales();
      expect(cs).toHaveLength(1);
      expect(cs[0].grossRevenue).toBe(200);
    });

    it('kpis agrega corretamente', () => {
      const { service } = setupHarness();
      loadDb(service, makeFakeDatabase({
        purchases: [makePurchase()],
        sales: [makeSale({ status: 'Concluída' })],
      }));
      const kpis = service.kpis();
      expect(kpis.totalBatches).toBe(1);
    });
  });

  // ─── nextPurchaseId / nextSaleId / find ─────────────

  describe('ID helpers e find', () => {
    it('nextPurchaseId delega a nextId com prefixo "C"', () => {
      const { service } = setupHarness();
      loadDb(service, makeFakeDatabase({
        purchases: [makePurchase({ id: 'C001' }), makePurchase({ id: 'C002' })],
      }));
      expect(service.nextPurchaseId()).toBe('C003');
    });

    it('nextSaleId delega a nextId com prefixo "V"', () => {
      const { service } = setupHarness();
      loadDb(service, makeFakeDatabase({
        sales: [makeSale({ id: 'V001' })],
      }));
      expect(service.nextSaleId()).toBe('V002');
    });

    it('findPurchase retorna purchase quando existe', () => {
      const { service } = setupHarness();
      loadDb(service, makeFakeDatabase({ purchases: [makePurchase({ id: 'C001' })] }));
      expect(service.findPurchase('C001')?.id).toBe('C001');
      expect(service.findPurchase('C999')).toBeUndefined();
    });

    it('findSale retorna sale quando existe', () => {
      const { service } = setupHarness();
      loadDb(service, makeFakeDatabase({ sales: [makeSale({ id: 'V001' })] }));
      expect(service.findSale('V001')?.id).toBe('V001');
      expect(service.findSale('V999')).toBeUndefined();
    });
  });

  // ─── CRUD Purchases ────────────────────────────────

  describe('CRUD Purchases', () => {
    it('addPurchase adiciona ao array e chama setDoc (persist)', () => {
      const fakeUser = makeFakeUser();
      const harness = setupHarness(fakeUser);
      loadDb(harness.service);

      const newPurchase = makePurchase({ id: 'C100' });
      harness.service.addPurchase(newPurchase);

      expect(harness.service.purchases()).toHaveLength(1);
      expect(harness.service.purchases()[0].id).toBe('C100');
      expect(setDoc).toHaveBeenCalled();
    });

    it('updatePurchase faz merge parcial', () => {
      const harness = setupHarness(makeFakeUser());
      loadDb(harness.service, makeFakeDatabase({
        purchases: [makePurchase({ id: 'C001', product: 'Antigo' })],
      }));

      harness.service.updatePurchase('C001', { product: 'Novo' });
      expect(harness.service.purchases()[0].product).toBe('Novo');
    });

    it('updatePurchase é no-op quando id não existe', () => {
      const harness = setupHarness(makeFakeUser());
      loadDb(harness.service, makeFakeDatabase({
        purchases: [makePurchase({ id: 'C001', product: 'Antigo' })],
      }));
      harness.service.updatePurchase('C999', { product: 'Não muda' });
      expect(harness.service.purchases()[0].product).toBe('Antigo');
    });

    it('removePurchase filtra do array', () => {
      const harness = setupHarness(makeFakeUser());
      loadDb(harness.service, makeFakeDatabase({
        purchases: [makePurchase({ id: 'C001' }), makePurchase({ id: 'C002' })],
      }));
      harness.service.removePurchase('C001');
      expect(harness.service.purchases().map(p => p.id)).toEqual(['C002']);
    });

    it('removePurchaseWithSales remove purchase E suas sales', () => {
      const harness = setupHarness(makeFakeUser());
      loadDb(harness.service, makeFakeDatabase({
        purchases: [makePurchase({ id: 'C001' }), makePurchase({ id: 'C002' })],
        sales: [
          makeSale({ id: 'V001', batchId: 'C001' }),
          makeSale({ id: 'V002', batchId: 'C002' }),
          makeSale({ id: 'V003', batchId: 'C001' }),
        ],
      }));
      harness.service.removePurchaseWithSales('C001');
      expect(harness.service.purchases().map(p => p.id)).toEqual(['C002']);
      expect(harness.service.sales().map(s => s.id)).toEqual(['V002']);
    });
  });

  // ─── CRUD Sales ────────────────────────────────────

  describe('CRUD Sales', () => {
    it('addSale adiciona e persiste', () => {
      const harness = setupHarness(makeFakeUser());
      loadDb(harness.service);
      harness.service.addSale(makeSale({ id: 'V001' }));
      expect(harness.service.sales()).toHaveLength(1);
      expect(setDoc).toHaveBeenCalled();
    });

    it('updateSale faz merge parcial', () => {
      const harness = setupHarness(makeFakeUser());
      loadDb(harness.service, makeFakeDatabase({
        sales: [makeSale({ id: 'V001', notes: 'antigo' })],
      }));
      harness.service.updateSale('V001', { notes: 'novo' });
      expect(harness.service.sales()[0].notes).toBe('novo');
    });

    it('removeSale filtra do array', () => {
      const harness = setupHarness(makeFakeUser());
      loadDb(harness.service, makeFakeDatabase({
        sales: [makeSale({ id: 'V001' }), makeSale({ id: 'V002' })],
      }));
      harness.service.removeSale('V001');
      expect(harness.service.sales().map(s => s.id)).toEqual(['V002']);
    });
  });

  // ─── bulkImport ─────────────────────────────────────

  describe('bulkImport', () => {
    it('early-return quando ambos arrays vazios (sem persist)', async () => {
      const harness = setupHarness(makeFakeUser());
      loadDb(harness.service);
      await harness.service.bulkImport([], []);
      expect(setDoc).not.toHaveBeenCalled();
    });

    it('faz push dos dois arrays em uma única persist', async () => {
      const harness = setupHarness(makeFakeUser());
      loadDb(harness.service);
      await harness.service.bulkImport(
        [makePurchase({ id: 'C100' })],
        [makeSale({ id: 'V100' })],
      );
      expect(harness.service.purchases()).toHaveLength(1);
      expect(harness.service.sales()).toHaveLength(1);
      expect(setDoc).toHaveBeenCalledTimes(1);
    });
  });

  // ─── update() transactional / rollback ──────────────

  describe('update() rollback', () => {
    it('restaura estado anterior quando persist falha', async () => {
      const harness = setupHarness(makeFakeUser());
      const original = makeFakeDatabase({
        purchases: [makePurchase({ id: 'C001', product: 'Original' })],
      });
      loadDb(harness.service, original);

      (setDoc as jest.Mock).mockRejectedValueOnce(new Error('falha'));

      // Captura a promise interna chamando update (sale add → persist falha)
      harness.service.updatePurchase('C001', { product: 'Modificado' });
      // O update otimisticamente aplica antes da promise rejeitar
      expect(harness.service.purchases()[0].product).toBe('Modificado');

      // Aguarda microtasks
      await new Promise(r => setTimeout(r, 0));

      // Rollback aconteceu
      expect(harness.service.purchases()[0].product).toBe('Original');
    });

    it('é no-op quando db() é null', () => {
      const { service } = setupHarness();
      // db ainda é null (não chamamos loadDb)
      service.addPurchase(makePurchase());
      expect(setDoc).not.toHaveBeenCalled();
    });
  });

  // ─── Helpers privados via cast ──────────────────────

  describe('helpers privados via cast', () => {
    it('defaultSettings retorna valores hardcoded', () => {
      const { service } = setupHarness();
      const defaults = (service as any).defaultSettings();
      expect(defaults.defaultMlFee).toBe(0.12);
      expect(defaults.yellowAlertDays).toBe(25);
      expect(defaults.redAlertDays).toBe(30);
      expect(defaults.minimumMargin).toBe(0.10);
      expect(defaults.defaultChannel).toBe('Mercado Livre');
      expect(defaults.categories).toContain('Eletrônicos');
    });

    it('createEmpty retorna database com defaults', () => {
      const { service } = setupHarness();
      const empty = (service as any).createEmpty();
      expect(empty.purchases).toEqual([]);
      expect(empty.sales).toEqual([]);
      expect(empty.settings.defaultMlFee).toBe(0.12);
      expect(empty.metadata.versao).toBeTruthy();
    });

    it('migrateDatabase preenche settings ausentes com defaults', () => {
      const { service } = setupHarness();
      const migrated = (service as any).migrateDatabase({});
      expect(migrated.settings.defaultMlFee).toBe(0.12);
      expect(migrated.purchases).toEqual([]);
      expect(migrated.sales).toEqual([]);
    });

    it('migrateDatabase faz merge campo a campo no settings', () => {
      const { service } = setupHarness();
      const migrated = (service as any).migrateDatabase({
        settings: { defaultMlFee: 0.20 },
        purchases: [makePurchase()],
      });
      expect(migrated.settings.defaultMlFee).toBe(0.20);
      // Outros campos vêm dos defaults
      expect(migrated.settings.yellowAlertDays).toBe(25);
      expect(migrated.purchases).toHaveLength(1);
    });

    it('migrateDatabase preserva metadata quando presente', () => {
      const { service } = setupHarness();
      const migrated = (service as any).migrateDatabase({
        metadata: { versao: '2.0.0', ultimaAtualizacao: '2026-01-01' },
      });
      expect(migrated.metadata.versao).toBe('2.0.0');
    });
  });

  // ─── reset() ────────────────────────────────────────

  describe('reset', () => {
    it('zera todos os dados e chama setDoc', async () => {
      const harness = setupHarness(makeFakeUser());
      loadDb(harness.service, makeFakeDatabase({
        purchases: [makePurchase()],
        sales: [makeSale()],
      }));

      await harness.service.reset();

      expect(harness.service.purchases()).toEqual([]);
      expect(harness.service.sales()).toEqual([]);
      expect(setDoc).toHaveBeenCalled();
    });

    it('faz rollback e relança quando setDoc falha', async () => {
      const harness = setupHarness(makeFakeUser());
      const original = makeFakeDatabase({
        purchases: [makePurchase({ id: 'C001' })],
      });
      loadDb(harness.service, original);

      (setDoc as jest.Mock).mockRejectedValueOnce(new Error('boom'));

      await expect(harness.service.reset()).rejects.toThrow();
      expect(harness.service.purchases()).toHaveLength(1);
      expect(harness.fakeNotify.error).toHaveBeenCalled();
    });

    it('é no-op quando deslogado', async () => {
      const { service } = setupHarness(null);
      await service.reset();
      expect(setDoc).not.toHaveBeenCalled();
    });
  });

  // ─── startSync / stopSync ───────────────────────────

  describe('startSync (via cast)', () => {
    it('chama refreshIdToken e registra onSnapshot no path correto', async () => {
      const { service, fakeAuth } = setupHarness(makeFakeUser());
      (onSnapshot as jest.Mock).mockReturnValue(jest.fn()); // unsub

      await (service as any).startSync('user-123');

      expect(fakeAuth.refreshIdToken).toHaveBeenCalled();
      expect(doc).toHaveBeenCalledWith(expect.anything(), 'users/user-123/db/main');
      expect(onSnapshot).toHaveBeenCalled();
    });

    it('quando snapshot existe, seta db via migrateDatabase', async () => {
      const harness = setupHarness(makeFakeUser());
      let onNext: (snap: any) => void = () => undefined;
      (onSnapshot as jest.Mock).mockImplementation((_ref, next) => {
        onNext = next;
        return jest.fn();
      });

      await (harness.service as any).startSync('user-123');

      const snap = makeFakeSnapshot({
        purchases: [makePurchase()],
        sales: [],
        settings: { defaultMlFee: 0.15 },
        metadata: { versao: '1.0.0', ultimaAtualizacao: '2025-01-01' },
      });
      onNext(snap);

      expect(harness.service.loaded()).toBe(true);
      expect(harness.service.settings()?.defaultMlFee).toBe(0.15);
    });

    it('quando snapshot não existe (não-cache), cria empty + setDoc', async () => {
      const harness = setupHarness(makeFakeUser());
      let onNext: (snap: any) => void = () => undefined;
      (onSnapshot as jest.Mock).mockImplementation((_ref, next) => {
        onNext = next;
        return jest.fn();
      });

      await (harness.service as any).startSync('user-123');

      const snap = makeFakeSnapshot(null, { exists: false, fromCache: false });
      onNext(snap);

      expect(harness.service.loaded()).toBe(true);
      expect(setDoc).toHaveBeenCalled();
    });

    it('quando fromCache=true e db=null, seta empty e mostra warning', async () => {
      const harness = setupHarness(makeFakeUser());
      let onNext: (snap: any) => void = () => undefined;
      (onSnapshot as jest.Mock).mockImplementation((_ref, next) => {
        onNext = next;
        return jest.fn();
      });

      await (harness.service as any).startSync('user-123');

      const snap = makeFakeSnapshot(null, { exists: false, fromCache: true });
      onNext(snap);

      expect(harness.service.loaded()).toBe(true);
      expect(harness.fakeNotify.warning).toHaveBeenCalled();
    });

    it('em caso de erro, chama notify.error e agenda retry', async () => {
      jest.useFakeTimers();
      const harness = setupHarness(makeFakeUser());
      let onError: (err: any) => void = () => undefined;
      (onSnapshot as jest.Mock).mockImplementation((_ref, _next, errorCb) => {
        onError = errorCb;
        return jest.fn();
      });

      await (harness.service as any).startSync('user-123');
      onError({ code: 'unavailable' });

      expect(harness.fakeConnection.reportSnapshotError).toHaveBeenCalled();
      expect(harness.fakeNotify.error).toHaveBeenCalled();
      // Retry deve estar agendado
      expect((harness.service as any)._retryTimer).toBeDefined();
      jest.useRealTimers();
    });
  });

  describe('stopSync (via cast)', () => {
    it('chama unsub, zera db e reseta flags', async () => {
      const harness = setupHarness(makeFakeUser());
      const unsubMock = jest.fn();
      (onSnapshot as jest.Mock).mockReturnValue(unsubMock);

      await (harness.service as any).startSync('user-123');
      loadDb(harness.service);
      expect(harness.service.loaded()).toBe(true);

      (harness.service as any).stopSync();

      expect(unsubMock).toHaveBeenCalled();
      expect(harness.service.loaded()).toBe(false);
    });
  });
});
