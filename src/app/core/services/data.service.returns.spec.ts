/**
 * Persistência de devoluções no DataService: CRUD, cascatas, migração do
 * documento legado e sincronização do status da venda.
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
import { Firestore, setDoc } from '@angular/fire/firestore';
import { DataService } from './data.service';
import { AuthService } from './auth.service';
import { NotifyService } from './notify.service';
import { ConnectionService } from './connection.service';
import { Database, Return, Sale } from '../models/models';
import { makeFakeUser, makeFakeDatabase } from '../../../testing/firebase-mocks';
import { makePurchase, makeSale, makeReturn } from '../../../testing/fixtures';

const fakeTranslate = { instant: (key: string) => key } as unknown as TranslateService;

function setup(db?: Database) {
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
  const service = TestBed.inject(DataService);
  if (db) (service as any).db.set(db);
  return service;
}

/** Base: lote de 10, venda V001 de 3 unidades. */
function baseDb(returns: Return[] = [], sales?: Sale[]): Database {
  return makeFakeDatabase({
    purchases: [makePurchase({ id: 'C001', quantityPurchased: 10 })],
    sales: sales ?? [makeSale({ id: 'V001', batchId: 'C001', quantitySold: 3 })],
    returns,
  });
}

const lastPayload = () => (setDoc as jest.Mock).mock.calls.at(-1)![1];

describe('DataService — devoluções', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (setDoc as jest.Mock).mockResolvedValue(undefined);
  });
  afterEach(() => TestBed.resetTestingModule());

  describe('CRUD', () => {
    it('nextReturnId começa em D001 e segue a sequência', () => {
      expect(setup(baseDb()).nextReturnId()).toBe('D001');
      TestBed.resetTestingModule();
      const s = setup(baseDb([makeReturn({ id: 'D001' }), makeReturn({ id: 'D002' })]));
      expect(s.nextReturnId()).toBe('D003');
    });

    it('addReturn insere e persiste o array returns', () => {
      const service = setup(baseDb());
      service.addReturn(makeReturn({ id: 'D001', saleId: 'V001' }));
      expect(service.returns()).toHaveLength(1);
      expect(lastPayload().returns).toHaveLength(1);
      expect(lastPayload().returns[0].id).toBe('D001');
    });

    it('persist() sempre envia a chave returns — sem isso a feature seria um no-op', () => {
      const service = setup(baseDb());
      service.addPurchase(makePurchase({ id: 'C002' }));
      expect(Object.keys(lastPayload())).toEqual(
        expect.arrayContaining(['purchases', 'sales', 'returns', 'metadata']),
      );
    });

    it('updateReturn faz merge parcial', () => {
      const service = setup(baseDb([makeReturn({ id: 'D001', saleId: 'V001', quantity: 1 })]));
      service.updateReturn('D001', { quantity: 2, arrivalDate: '2026-03-01' });
      expect(service.returns()[0]).toMatchObject({ quantity: 2, arrivalDate: '2026-03-01' });
    });

    it('removeReturn apaga só a devolução alvo', () => {
      const service = setup(baseDb([
        makeReturn({ id: 'D001', saleId: 'V001' }),
        makeReturn({ id: 'D002', saleId: 'V001' }),
      ]));
      service.removeReturn('D001');
      expect(service.returns().map(r => r.id)).toEqual(['D002']);
    });

    it('findReturn e returnsForSale filtram corretamente', () => {
      const service = setup(baseDb([
        makeReturn({ id: 'D001', saleId: 'V001' }),
        makeReturn({ id: 'D002', saleId: 'V999' }),
      ]));
      expect(service.findReturn('D002')?.saleId).toBe('V999');
      expect(service.returnsForSale('V001').map(r => r.id)).toEqual(['D001']);
    });
  });

  describe('syncSaleStatus', () => {
    it('marca a venda como Devolvida quando as finalizadas cobrem o total', () => {
      const service = setup(baseDb());
      service.addReturn(makeReturn({ id: 'D001', saleId: 'V001', quantity: 3, arrivalDate: '2026-03-01' }));
      expect(service.findSale('V001')!.status).toBe('Devolvida');
    });

    it('mantém Concluída numa devolução parcial', () => {
      const service = setup(baseDb());
      service.addReturn(makeReturn({ id: 'D001', saleId: 'V001', quantity: 1, arrivalDate: '2026-03-01' }));
      expect(service.findSale('V001')!.status).toBe('Concluída');
    });

    it('ignora devolução ainda Solicitada', () => {
      const service = setup(baseDb());
      service.addReturn(makeReturn({ id: 'D001', saleId: 'V001', quantity: 3, arrivalDate: undefined }));
      expect(service.findSale('V001')!.status).toBe('Concluída');
    });

    it('volta para Concluída quando a devolução é apagada', () => {
      const service = setup(baseDb());
      service.addReturn(makeReturn({ id: 'D001', saleId: 'V001', quantity: 3, arrivalDate: '2026-03-01' }));
      expect(service.findSale('V001')!.status).toBe('Devolvida');
      service.removeReturn('D001');
      expect(service.findSale('V001')!.status).toBe('Concluída');
    });

    it('volta para Concluída quando a devolução é revertida para Solicitada', () => {
      const service = setup(baseDb([
        makeReturn({ id: 'D001', saleId: 'V001', quantity: 3, arrivalDate: '2026-03-01' }),
      ]));
      service.updateReturn('D001', { arrivalDate: undefined });
      expect(service.findSale('V001')!.status).toBe('Concluída');
    });

    it('NUNCA sobrescreve Cancelada nem Em disputa — são escolhas do usuário', () => {
      for (const status of ['Cancelada', 'Em disputa'] as const) {
        TestBed.resetTestingModule();
        const service = setup(baseDb([], [
          makeSale({ id: 'V001', batchId: 'C001', quantitySold: 3, status }),
        ]));
        service.addReturn(makeReturn({ id: 'D001', saleId: 'V001', quantity: 3, arrivalDate: '2026-03-01' }));
        expect(service.findSale('V001')!.status).toBe(status);
      }
    });

    it('ressincroniza as duas vendas quando a devolução é remanejada', () => {
      const service = setup(baseDb([], [
        makeSale({ id: 'V001', batchId: 'C001', quantitySold: 3 }),
        makeSale({ id: 'V002', batchId: 'C001', quantitySold: 3 }),
      ]));
      // Semeado pelo mutator para que o status persistido comece coerente.
      service.addReturn(makeReturn({ id: 'D001', saleId: 'V001', quantity: 3, arrivalDate: '2026-03-01' }));
      expect(service.findSale('V001')!.status).toBe('Devolvida');

      service.updateReturn('D001', { saleId: 'V002' });
      expect(service.findSale('V001')!.status).toBe('Concluída');
      expect(service.findSale('V002')!.status).toBe('Devolvida');
    });

    it('status persistido desatualizado não corrompe nenhum valor de dinheiro', () => {
      // Documento semeado direto (sem passar pelos mutators): Sale.status ficou
      // 'Concluída' mesmo com devolução total. É o pior caso de uma escrita
      // perdida — o dinheiro não pode depender desse campo.
      const service = setup(baseDb([
        makeReturn({ id: 'D001', saleId: 'V001', quantity: 3, arrivalDate: '2026-03-01' }),
      ]));
      expect(service.findSale('V001')!.status).toBe('Concluída'); // stale, de propósito

      const [computed] = service.computedSales();
      expect(computed!.grossRevenue).toBe(0);
      expect(computed!.effectiveQuantity).toBe(0);
      expect(computed!.effectiveStatus).toBe('Devolvida'); // a UI mostra o correto
      expect(service.kpis().grossRevenue).toBe(0);
      expect(service.computedPurchases()[0]!.currentStock).toBe(10);
    });
  });

  describe('cascatas', () => {
    it('removeSale apaga as devoluções da venda e preserva as demais', () => {
      const service = setup(baseDb([
        makeReturn({ id: 'D001', saleId: 'V001' }),
        makeReturn({ id: 'D002', saleId: 'V002' }),
      ], [
        makeSale({ id: 'V001', batchId: 'C001' }),
        makeSale({ id: 'V002', batchId: 'C001' }),
      ]));
      service.removeSale('V001');
      expect(service.returns().map(r => r.id)).toEqual(['D002']);
    });

    it('removePurchaseWithSales apaga transitivamente compras, vendas e devoluções', () => {
      const service = setup(makeFakeDatabase({
        purchases: [makePurchase({ id: 'C001' }), makePurchase({ id: 'C002' })],
        sales: [
          makeSale({ id: 'V001', batchId: 'C001' }),
          makeSale({ id: 'V002', batchId: 'C002' }),
        ],
        returns: [
          makeReturn({ id: 'D001', saleId: 'V001' }),
          makeReturn({ id: 'D002', saleId: 'V002' }),
        ],
      }));
      service.removePurchaseWithSales('C001');
      expect(service.purchases().map(p => p.id)).toEqual(['C002']);
      expect(service.sales().map(s => s.id)).toEqual(['V002']);
      expect(service.returns().map(r => r.id)).toEqual(['D002']);
    });

    it('restoreSale devolve venda e devoluções numa única mutação (undo atômico)', () => {
      const service = setup(baseDb([makeReturn({ id: 'D001', saleId: 'V001', quantity: 3, arrivalDate: '2026-03-01' })]));
      const sale = service.findSale('V001')!;
      const rets = service.returnsForSale('V001');
      service.removeSale('V001');
      expect(service.returns()).toHaveLength(0);

      (setDoc as jest.Mock).mockClear();
      service.restoreSale(sale, rets);
      expect(service.sales().map(s => s.id)).toEqual(['V001']);
      expect(service.returns().map(r => r.id)).toEqual(['D001']);
      // Um único persist: o undo não pode gravar em duas etapas.
      expect(setDoc as jest.Mock).toHaveBeenCalledTimes(1);
    });
  });

  describe('migração de documento legado', () => {
    const migrate = (service: DataService, raw: unknown) =>
      (service as any).migrateDatabase(raw) as Database;

    it('documento sem a chave returns carrega com array vazio', () => {
      const service = setup();
      const migrated = migrate(service, { purchases: [], sales: [], settings: {} });
      expect(migrated.returns).toEqual([]);
    });

    it('documento sem returnWindowDays recebe o padrão de 30 dias', () => {
      const service = setup();
      expect(migrate(service, { settings: {} }).settings.returnWindowDays).toBe(30);
    });

    it('preserva um returnWindowDays já gravado', () => {
      const service = setup();
      expect(migrate(service, { settings: { returnWindowDays: 7 } }).settings.returnWindowDays).toBe(7);
    });

    it('preserva devoluções já gravadas', () => {
      const service = setup();
      const migrated = migrate(service, { returns: [makeReturn({ id: 'D007' })], settings: {} });
      expect(migrated.returns.map(r => r.id)).toEqual(['D007']);
    });

    it('createEmpty inclui returns vazio e a janela padrão', () => {
      const service = setup();
      const empty = (service as any).createEmpty() as Database;
      expect(empty.returns).toEqual([]);
      expect(empty.settings.returnWindowDays).toBe(30);
    });
  });

  describe('rollback otimista', () => {
    it('restaura o array returns quando a gravação falha', async () => {
      const service = setup(baseDb([makeReturn({ id: 'D001', saleId: 'V001' })]));
      (setDoc as jest.Mock).mockRejectedValueOnce(new Error('offline'));
      service.addReturn(makeReturn({ id: 'D002', saleId: 'V001' }));
      await Promise.resolve();
      await Promise.resolve();
      expect(service.returns().map(r => r.id)).toEqual(['D001']);
    });

    it('rollback também desfaz o status sincronizado da venda', async () => {
      const service = setup(baseDb());
      (setDoc as jest.Mock).mockRejectedValueOnce(new Error('offline'));
      service.addReturn(makeReturn({ id: 'D001', saleId: 'V001', quantity: 3, arrivalDate: '2026-03-01' }));
      await Promise.resolve();
      await Promise.resolve();
      expect(service.findSale('V001')!.status).toBe('Concluída');
      expect(service.returns()).toHaveLength(0);
    });
  });

  describe('reset', () => {
    it('zera returns e mantém a janela válida para o próximo save', async () => {
      const service = setup(baseDb([makeReturn({ id: 'D001' })]));
      await service.reset();
      expect(service.returns()).toEqual([]);
      // 0 travaria o validate() da tela de Configurações.
      expect(service.settings()!.returnWindowDays).toBe(30);
    });
  });
});
