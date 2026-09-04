/**
 * Adoção em lote dos números do Mercado Livre.
 *
 * O ponto desta função é o custo da escrita: `persist()` regrava o documento
 * inteiro, então adotar 68 vendas uma a uma seriam 68 reescritas da base toda.
 * Por isso o teste mais importante aqui é o mais estranho de todos — contar
 * quantas vezes o Firestore foi chamado.
 */
jest.mock('@angular/fire/firestore', () => ({
  Firestore: class Firestore {},
  doc: jest.fn((..._args: unknown[]) => ({ __doc: true })),
  setDoc: jest.fn(() => Promise.resolve()),
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
import { Database, Sale } from '../models/models';
import { ItemDaCaixa } from '../ml/inbox-apply';
import { makeFakeDatabase, makeFakeUser } from '../../../testing/firebase-mocks';
import { makePurchase, makeSale } from '../../../testing/fixtures';

const fakeTranslate = { instant: (key: string) => key } as unknown as TranslateService;

function setup(db: Database): DataService {
  TestBed.configureTestingModule({
    providers: [
      DataService,
      { provide: Firestore, useValue: {} },
      {
        provide: AuthService,
        useValue: {
          currentUser: signal<ReturnType<typeof makeFakeUser> | null | undefined>(makeFakeUser()),
          refreshIdToken: jest.fn().mockResolvedValue(undefined),
        },
      },
      {
        provide: NotifyService,
        useValue: { success: jest.fn(), warning: jest.fn(), error: jest.fn(), info: jest.fn() },
      },
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
  (service as unknown as { db: { set: (d: Database) => void } }).db.set(db);
  return service;
}

/** Venda digitada à mão: taxa estimada, sem nenhum id do Mercado Livre. */
function manual(id: string, over: Partial<Sale> = {}): Sale {
  return makeSale({
    id,
    batchId: 'C001',
    product: 'Furadeira',
    saleDate: '2026-08-10',
    quantitySold: 1,
    unitPrice: 300,
    feePercentage: 0.16,
    sellerShipping: 30,
    notes: 'anotação minha',
    ...over,
  });
}

/** O mesmo pedido, do lado do Mercado Livre: números reais. */
function doMl(orderId: string, over: Partial<ItemDaCaixa> = {}): ItemDaCaixa {
  return {
    externalId: `${orderId}:MLB1:0`,
    mlOrderId: orderId,
    mlItemId: 'MLB1',
    produto: 'Furadeira',
    vinculado: true,
    quantitySold: 1,
    unitPrice: 300,
    saleDate: '2026-08-10',
    feePercentage: 0.1332,
    shippingType: 'correios',
    sellerShipping: 23.25,
    discount: 0,
    status: 'Concluída',
    notes: 'Mercado Livre · pedido ' + orderId,
    estado: 'pendente',
    ...over,
  };
}

const base = (): Database =>
  makeFakeDatabase({
    purchases: [makePurchase({ id: 'C001', product: 'Furadeira', quantityPurchased: 20 })],
    sales: [manual('V001'), manual('V002'), manual('V003')],
  });

afterEach(() => {
  TestBed.resetTestingModule();
  jest.clearAllMocks();
});

describe('adoção em lote', () => {
  it('grava UMA vez, não uma por venda', async () => {
    // É a razão de existir do método: 68 chamadas separadas seriam 68
    // reescritas do documento inteiro.
    const s = setup(base());
    await s.adotarNumerosDoMlEmLote([
      { saleId: 'V001', item: doMl('2000001') },
      { saleId: 'V002', item: doMl('2000002') },
      { saleId: 'V003', item: doMl('2000003') },
    ]);

    expect(setDoc).toHaveBeenCalledTimes(1);
  });

  it('corrige os números de todas as vendas do lote', async () => {
    const s = setup(base());
    await s.adotarNumerosDoMlEmLote([
      { saleId: 'V001', item: doMl('2000001') },
      { saleId: 'V002', item: doMl('2000002') },
    ]);

    const vendas = s.sales();
    expect(vendas[0].feePercentage).toBeCloseTo(0.1332, 10);
    expect(vendas[0].sellerShipping).toBeCloseTo(23.25, 10);
    expect(vendas[1].feePercentage).toBeCloseTo(0.1332, 10);
    // A que ficou de fora não é tocada.
    expect(vendas[2].feePercentage).toBeCloseTo(0.16, 10);
  });

  it('preserva id, lote e observações — só os números mudam', async () => {
    const s = setup(base());
    await s.adotarNumerosDoMlEmLote([{ saleId: 'V001', item: doMl('2000001') }]);

    const v = s.sales()[0];
    expect(v.id).toBe('V001');
    expect(v.batchId).toBe('C001');
    expect(v.notes).toContain('anotação minha');
  });

  it('a venda passa a carregar o pedido do ML, que é o que a fatura precisa', async () => {
    // Sem `mlOrderId` a conciliação com a fatura não consegue casar nada.
    const s = setup(base());
    await s.adotarNumerosDoMlEmLote([{ saleId: 'V001', item: doMl('2000001') }]);

    expect(s.sales()[0].mlOrderId).toBe('2000001');
    expect(s.sales()[0].externalId).toBe('2000001:MLB1:0');
  });

  it('devolve os externalId adotados, para avisar o servidor', async () => {
    const s = setup(base());
    const adotados = await s.adotarNumerosDoMlEmLote([
      { saleId: 'V001', item: doMl('2000001') },
      { saleId: 'V002', item: doMl('2000002') },
    ]);

    expect(adotados).toEqual(['2000001:MLB1:0', '2000002:MLB1:0']);
  });

  it('venda que não existe mais é pulada, sem derrubar o resto', async () => {
    const s = setup(base());
    const adotados = await s.adotarNumerosDoMlEmLote([
      { saleId: 'V001', item: doMl('2000001') },
      { saleId: 'V999', item: doMl('2000099') },
    ]);

    expect(adotados).toEqual(['2000001:MLB1:0']);
    expect(s.sales()).toHaveLength(3);
  });

  it('lote vazio não grava nada', async () => {
    const s = setup(base());
    await s.adotarNumerosDoMlEmLote([]);
    expect(setDoc).not.toHaveBeenCalled();
  });

  it('falha na gravação desfaz tudo — nunca metade adotada', async () => {
    // Meio lote adotado seria pior que nenhum: a tela mostraria uns pedidos
    // casados e outros não, sem nada explicando a diferença.
    const s = setup(base());
    (setDoc as jest.Mock).mockRejectedValueOnce(new Error('offline'));

    await expect(
      s.adotarNumerosDoMlEmLote([
        { saleId: 'V001', item: doMl('2000001') },
        { saleId: 'V002', item: doMl('2000002') },
      ]),
    ).rejects.toThrow();

    expect(s.sales()[0].feePercentage).toBeCloseTo(0.16, 10);
    expect(s.sales()[0].mlOrderId).toBeUndefined();
  });
});
