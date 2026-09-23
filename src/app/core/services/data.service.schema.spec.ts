/**
 * Razão em subcoleções (schema 2).
 *
 * O documento único tem teto de 1 MiB no Firestore — uma parede real em torno
 * de 1.500 a 2.500 vendas — e TODA alteração regravava a base inteira: marcar
 * um DAS como pago reescrevia compras, vendas e devoluções.
 *
 * O que estes testes protegem é a travessia, não o destino:
 *   - base sem migrar continua funcionando exatamente como antes;
 *   - a gravação no schema 2 toca SÓ o que mudou (é isso que destrava a
 *     escrita do servidor no razão — ver A2);
 *   - a migração não apaga nada, e a marca do schema é o ÚLTIMO passo.
 *
 * Esse último ponto é o que separa "migração" de "perda de dado": se a marca
 * fosse primeiro, uma falha no meio da cópia deixaria o app lendo um razão pela
 * metade, com a base original ainda intacta e ignorada.
 */
const setDoc = jest.fn().mockResolvedValue(undefined);
const batchSet = jest.fn();
const batchDelete = jest.fn();
const batchCommit = jest.fn().mockResolvedValue(undefined);

jest.mock('@angular/fire/firestore', () => ({
  Firestore: class Firestore {},
  doc: jest.fn((_db: unknown, caminho: string) => ({ path: caminho })),
  collection: jest.fn((_db: unknown, caminho: string) => ({ path: caminho })),
  onSnapshot: jest.fn(),
  setDoc: (...a: unknown[]) => setDoc(...a),
  deleteField: jest.fn(() => ({ __delete: true })),
  writeBatch: jest.fn(() => ({ set: batchSet, delete: batchDelete, commit: batchCommit })),
}));

import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { Firestore } from '@angular/fire/firestore';
import { DataService } from './data.service';
import { AuthService } from './auth.service';
import { NotifyService } from './notify.service';
import { ConnectionService } from './connection.service';
import { SCHEMA_SUBCOLECOES, type Database } from '../models/models';
import { makeFakeDatabase } from '../../../testing/firebase-mocks';
import { makePurchase, makeSale } from '../../../testing/fixtures';

const fakeTranslate = { instant: (k: string) => k } as unknown as TranslateService;

function montar(db: Database) {
  TestBed.configureTestingModule({
    providers: [
      DataService,
      { provide: Firestore, useValue: {} },
      {
        provide: AuthService,
        useValue: {
          currentUser: signal({ uid: 'u1' }),
          refreshIdToken: jest.fn().mockResolvedValue(undefined),
        },
      },
      { provide: NotifyService, useValue: { success: jest.fn(), error: jest.fn(), warning: jest.fn(), info: jest.fn() } },
      {
        provide: ConnectionService,
        useValue: {
          reportSnapshot: jest.fn(), reportSnapshotError: jest.fn(),
          syncError: signal(null), clearSyncError: jest.fn(),
        },
      },
      { provide: TranslateService, useValue: fakeTranslate },
    ],
  });
  const s = TestBed.inject(DataService);
  (s as any).db.set(db);
  return s;
}

function base(over: Partial<Database> = {}): Database {
  const d = makeFakeDatabase() as Database;
  return {
    ...d,
    purchases: [makePurchase({ id: 'C001' }), makePurchase({ id: 'C002' })],
    sales: [makeSale({ id: 'V001', batchId: 'C001' })],
    returns: [],
    ...over,
  };
}

const comSchema = (n: number, over: Partial<Database> = {}): Database => {
  const d = base(over);
  return { ...d, metadata: { ...d.metadata, schema: n } };
};

/** Caminhos gravados no último `writeBatch`. */
const caminhosGravados = () => batchSet.mock.calls.map(c => (c[0] as { path: string }).path);
const caminhosApagados = () => batchDelete.mock.calls.map(c => (c[0] as { path: string }).path);

beforeEach(() => jest.clearAllMocks());
afterEach(() => TestBed.resetTestingModule());

describe('deteccao do formato', () => {
  it('sem marca, e o formato original', () => {
    const s = montar(base());
    expect(s.schema()).toBe(1);
    expect(s.emSubcolecoes()).toBe(false);
  });

  it('com marca 2, e subcolecoes', () => {
    const s = montar(comSchema(SCHEMA_SUBCOLECOES));
    expect(s.emSubcolecoes()).toBe(true);
  });
});

describe('base sem migrar continua como era', () => {
  it('grava a base inteira no documento unico', async () => {
    const s = montar(base());
    s.addPurchase(makePurchase({ id: 'C003' }));
    await Promise.resolve();

    expect(batchCommit).not.toHaveBeenCalled();
    const [, payload] = setDoc.mock.calls[0] as [unknown, Record<string, unknown>];
    expect(payload).toHaveProperty('purchases');
    expect(payload).toHaveProperty('sales');
    expect(payload).toHaveProperty('returns');
  });
});

describe('schema 2 grava so o que mudou', () => {
  it('um lote novo gera UMA escrita, nao a base inteira', async () => {
    const s = montar(comSchema(SCHEMA_SUBCOLECOES));
    await s.bulkImport([makePurchase({ id: 'C009' })], []);

    expect(caminhosGravados()).toEqual(['users/u1/purchases/C009']);
  });

  it('editar uma venda nao regrava as compras', async () => {
    const s = montar(comSchema(SCHEMA_SUBCOLECOES));
    s.updateSale('V001', { unitPrice: 999 });
    await Promise.resolve();

    expect(caminhosGravados()).toEqual(['users/u1/sales/V001']);
  });

  it('remover apaga o documento, em vez de reescrever a lista', async () => {
    const s = montar(comSchema(SCHEMA_SUBCOLECOES));
    s.removePurchase('C002');
    await Promise.resolve();

    expect(caminhosApagados()).toEqual(['users/u1/purchases/C002']);
    expect(caminhosGravados()).toEqual([]);
  });

  it('alteracao so de settings nao toca no razao', async () => {
    // Era o caso mais caro do formato antigo: marcar um DAS como pago
    // reescrevia compras, vendas e devolucoes inteiras.
    const s = montar(comSchema(SCHEMA_SUBCOLECOES));
    await s.setDasPaid('2026-03', true);

    expect(batchSet).not.toHaveBeenCalled();
    expect(batchDelete).not.toHaveBeenCalled();
  });

  it('a marca do schema vai junto de toda gravacao do razao', async () => {
    const s = montar(comSchema(SCHEMA_SUBCOLECOES));
    await s.bulkImport([makePurchase({ id: 'C009' })], []);

    const ultimo = setDoc.mock.calls[setDoc.mock.calls.length - 1];
    expect((ultimo[1] as any).metadata.schema).toBe(SCHEMA_SUBCOLECOES);
  });
});

describe('migracao', () => {
  it('copia tudo para as subcolecoes', async () => {
    const s = montar(base());
    const total = await s.migrarParaSubcolecoes();

    expect(total).toEqual({ purchases: 2, sales: 1, returns: 0 });
    expect(caminhosGravados()).toEqual([
      'users/u1/purchases/C001',
      'users/u1/purchases/C002',
      'users/u1/sales/V001',
    ]);
  });

  it('NAO apaga nada de db/main', async () => {
    // A base antiga fica como rede: se algo der errado, basta baixar o schema.
    const s = montar(base());
    await s.migrarParaSubcolecoes();

    for (const [, payload] of setDoc.mock.calls as [unknown, Record<string, unknown>][]) {
      expect(payload['purchases']).toBeUndefined();
      expect(payload['sales']).toBeUndefined();
      expect(payload['returns']).toBeUndefined();
    }
  });

  it('a marca do schema e o ULTIMO passo', async () => {
    /* Se fosse o primeiro, uma falha no meio da copia deixaria o app lendo um
       razao pela metade — com a base original intacta e ignorada. */
    const ordem: string[] = [];
    batchCommit.mockImplementation(async () => { ordem.push('copia'); });
    setDoc.mockImplementation(async (_ref: unknown, payload: any) => {
      if (payload?.metadata?.schema) ordem.push('marca');
    });

    await montar(base()).migrarParaSubcolecoes();

    expect(ordem[ordem.length - 1]).toBe('marca');
    expect(ordem.filter(o => o === 'copia').length).toBeGreaterThan(0);
  });

  it('rodar de novo numa base ja migrada nao faz nada', async () => {
    const s = montar(comSchema(SCHEMA_SUBCOLECOES));
    const total = await s.migrarParaSubcolecoes();

    expect(total).toEqual({ purchases: 0, sales: 0, returns: 0 });
    expect(batchCommit).not.toHaveBeenCalled();
  });
});

describe('limpeza do razao legado', () => {
  it('recusa antes da migracao — seria apagar a unica copia', async () => {
    await expect(montar(base()).limparRazaoLegado()).rejects.toThrow('migre-primeiro');
    expect(setDoc).not.toHaveBeenCalled();
  });

  it('depois da migracao, apaga so os arrays', async () => {
    const s = montar(comSchema(SCHEMA_SUBCOLECOES));
    await s.limparRazaoLegado();

    const [, payload] = setDoc.mock.calls[0] as [unknown, Record<string, unknown>];
    expect(Object.keys(payload).sort()).toEqual(['purchases', 'returns', 'sales']);
    expect(payload['settings']).toBeUndefined();
  });
});
