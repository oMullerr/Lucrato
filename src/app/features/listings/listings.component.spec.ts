/**
 * Tela de anúncios: sugestão de vínculo, o que está pendente de salvar e o
 * alerta de estoque divergente.
 *
 * O MlIntegrationService entra como dublê (os anúncios viriam do Firestore),
 * mas o DataService é real: o estoque comparado aqui é o mesmo que o app
 * calcula em Estoque.
 */
jest.mock('@angular/fire/firestore', () => ({
  Firestore: class Firestore {},
  doc: jest.fn(),
  collection: jest.fn(),
  setDoc: jest.fn(),
  onSnapshot: jest.fn(),
  deleteField: jest.fn(),
}));
// O SDK real de functions puxa `fetch`, que o jsdom desta versão não expõe.
jest.mock('@angular/fire/functions', () => ({
  Functions: class Functions {},
  httpsCallable: jest.fn(),
}));

import { TestBed } from '@angular/core/testing';
import { signal, computed } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { Firestore } from '@angular/fire/firestore';
import { ListingsComponent } from './listings.component';
import { DataService } from '../../core/services/data.service';
import { AuthService } from '../../core/services/auth.service';
import { NotifyService } from '../../core/services/notify.service';
import { ConnectionService } from '../../core/services/connection.service';
import { MlIntegrationService, MlItem, MlLink } from '../../core/services/ml-integration.service';
import { Database } from '../../core/models/models';
import { makeFakeDatabase } from '../../../testing/firebase-mocks';
import { makePurchase, makeSale } from '../../../testing/fixtures';

const fakeTranslate = { instant: (key: string) => key } as unknown as TranslateService;

function anuncio(over: Partial<MlItem> = {}): MlItem {
  return {
    id: 'MLB1',
    title: 'Fone Bluetooth JBL Tune 510',
    sku: null,
    price: 199,
    availableQuantity: 5,
    soldQuantity: 0,
    status: 'active',
    listingTypeId: 'gold_special',
    permalink: 'https://ml/MLB1',
    thumbnail: '',
    logisticType: 'drop_off',
    freeShipping: true,
    ...over,
  };
}

function montar(db: Database, itens: MlItem[], vinculos: MlLink[] = []) {
  const mlFake = {
    connected: computed(() => true),
    working: signal(false),
    items: computed(() => itens),
    itemsLoaded: computed(() => true),
    linksByItem: computed(() => new Map(vinculos.map(v => [v.itemId, v]))),
    syncItems: jest.fn().mockResolvedValue(itens.length),
    setLinks: jest.fn().mockResolvedValue(undefined),
  };

  TestBed.configureTestingModule({
    providers: [
      ListingsComponent,
      DataService,
      { provide: MlIntegrationService, useValue: mlFake },
      { provide: Firestore, useValue: {} },
      {
        provide: AuthService,
        useValue: { currentUser: signal(undefined), refreshIdToken: jest.fn() },
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

  const data = TestBed.inject(DataService);
  (data as unknown as { db: { set: (d: Database) => void } }).db.set(db);
  const component = TestBed.inject(ListingsComponent) as unknown as {
    linhas: () => { item: MlItem; escolha: string; salvo: string; sugestao: string | null; estoqueLucrato: number | null }[];
    pendentes: () => unknown[];
    semVinculo: () => number;
    nomesDeProdutos: () => string[];
    divergente: (l: { item: MlItem; escolha: string; estoqueLucrato: number | null }) => boolean;
    escolher: (id: string, produto: string) => void;
    salvar: () => Promise<void>;
  };
  return { component, mlFake };
}

const baseDb = (): Database =>
  makeFakeDatabase({
    purchases: [
      makePurchase({ id: 'C001', product: 'Fone Bluetooth JBL Tune 510', quantityPurchased: 10, sku: 'JBL-510' }),
      makePurchase({ id: 'C002', product: 'Cadeira Gamer Preta', quantityPurchased: 3 }),
    ],
    sales: [],
    returns: [],
  });

afterEach(() => {
  jest.clearAllMocks();
  TestBed.resetTestingModule();
});

describe('sugestao de vinculo', () => {
  it('sugere pelo titulo quando o anuncio nao tem SKU', () => {
    const { component } = montar(baseDb(), [anuncio()]);
    const l = component.linhas()[0];
    expect(l.escolha).toBe('Fone Bluetooth JBL Tune 510');
    expect(l.sugestao).toBe('titulo');
  });

  it('sugere pelo SKU mesmo com titulo diferente', () => {
    const { component } = montar(baseDb(), [anuncio({ title: 'Promo headset sem fio', sku: 'JBL-510' })]);
    expect(component.linhas()[0].sugestao).toBe('sku');
    expect(component.linhas()[0].escolha).toBe('Fone Bluetooth JBL Tune 510');
  });

  it('nao sugere nada quando nenhum produto se parece', () => {
    const { component } = montar(baseDb(), [anuncio({ title: 'Pneu aro 15' })]);
    expect(component.linhas()[0].escolha).toBe('');
    expect(component.semVinculo()).toBe(1);
  });

  it('vinculo salvo tem prioridade sobre a sugestao', () => {
    const { component } = montar(
      baseDb(),
      [anuncio()],
      [{ itemId: 'MLB1', produto: 'Cadeira Gamer Preta', productKey: 'cadeira gamer preta' }],
    );
    const l = component.linhas()[0];
    expect(l.escolha).toBe('Cadeira Gamer Preta');
    expect(l.sugestao).toBeNull();
  });
});

describe('pendencias de gravacao', () => {
  it('sugestao ainda nao salva conta como pendente', () => {
    const { component } = montar(baseDb(), [anuncio()]);
    expect(component.pendentes()).toHaveLength(1);
  });

  it('vinculo ja salvo nao aparece como pendente', () => {
    const { component } = montar(
      baseDb(),
      [anuncio()],
      [{ itemId: 'MLB1', produto: 'Fone Bluetooth JBL Tune 510', productKey: 'fone bluetooth jbl tune 510' }],
    );
    expect(component.pendentes()).toHaveLength(0);
  });

  it('escolha do usuario sobrepoe tudo', () => {
    const { component } = montar(baseDb(), [anuncio()]);
    component.escolher('MLB1', 'Cadeira Gamer Preta');
    expect(component.linhas()[0].escolha).toBe('Cadeira Gamer Preta');
    expect(component.pendentes()).toHaveLength(1);
  });

  it('desfazer vinculo salvo tambem e pendencia', async () => {
    const { component, mlFake } = montar(
      baseDb(),
      [anuncio()],
      [{ itemId: 'MLB1', produto: 'Fone Bluetooth JBL Tune 510', productKey: 'fone bluetooth jbl tune 510' }],
    );
    component.escolher('MLB1', '');
    expect(component.pendentes()).toHaveLength(1);

    await component.salvar();
    expect(mlFake.setLinks).toHaveBeenCalledWith([{ itemId: 'MLB1', produto: '' }]);
  });

  it('salvar envia so o que mudou', async () => {
    const { component, mlFake } = montar(baseDb(), [anuncio(), anuncio({ id: 'MLB2', title: 'Pneu aro 15' })]);
    await component.salvar();
    expect(mlFake.setLinks).toHaveBeenCalledWith([
      { itemId: 'MLB1', produto: 'Fone Bluetooth JBL Tune 510' },
    ]);
  });
});

describe('estoque divergente', () => {
  it('acusa quando o Mercado Livre discorda do Lucrato', () => {
    const { component } = montar(baseDb(), [anuncio({ availableQuantity: 5 })]);
    const l = component.linhas()[0];
    expect(l.estoqueLucrato).toBe(10);
    expect(component.divergente(l)).toBe(true);
  });

  it('nao acusa quando bate', () => {
    const { component } = montar(baseDb(), [anuncio({ availableQuantity: 10 })]);
    expect(component.divergente(component.linhas()[0])).toBe(false);
  });

  it('desconta o que ja foi vendido no Lucrato', () => {
    const db = makeFakeDatabase({
      purchases: [makePurchase({ id: 'C001', product: 'Fone Bluetooth JBL Tune 510', quantityPurchased: 10 })],
      sales: [makeSale({ id: 'V001', batchId: 'C001', quantitySold: 4 })],
      returns: [],
    });
    const { component } = montar(db, [anuncio({ availableQuantity: 6 })]);
    expect(component.linhas()[0].estoqueLucrato).toBe(6);
    expect(component.divergente(component.linhas()[0])).toBe(false);
  });

  it('sem vinculo nao ha divergencia a mostrar', () => {
    const { component } = montar(baseDb(), [anuncio({ title: 'Pneu aro 15' })]);
    const l = component.linhas()[0];
    expect(l.estoqueLucrato).toBeNull();
    expect(component.divergente(l)).toBe(false);
  });
});

describe('lista de produtos', () => {
  it('traz nomes distintos em ordem alfabetica', () => {
    const db = makeFakeDatabase({
      purchases: [
        makePurchase({ id: 'C001', product: 'Fone Bluetooth JBL Tune 510' }),
        makePurchase({ id: 'C002', product: 'Cadeira Gamer Preta' }),
        makePurchase({ id: 'C003', product: 'fone bluetooth jbl tune 510' }),
      ],
      sales: [],
      returns: [],
    });
    const { component } = montar(db, []);
    expect(component.nomesDeProdutos()).toEqual(['Cadeira Gamer Preta', 'Fone Bluetooth JBL Tune 510']);
  });
});
