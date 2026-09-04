/**
 * Tela de fluxo de caixa.
 *
 * O DataService é real: o recebível precisa desaparecer quando a venda deixa de
 * contar como receita, e isso só se prova passando pelo mesmo motor que o resto
 * do app usa. O que se testa aqui é sobretudo a mensagem certa no vazio — uma
 * tela em branco que não explica o motivo faz parecer que a integração falhou.
 */
jest.mock('@angular/fire/firestore', () => ({
  Firestore: class Firestore {},
  doc: jest.fn(),
  collection: jest.fn(),
  setDoc: jest.fn(),
  onSnapshot: jest.fn(),
  deleteField: jest.fn(),
}));

import { TestBed } from '@angular/core/testing';
import { signal, computed } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { Firestore } from '@angular/fire/firestore';
import { CashFlowComponent } from './cash-flow.component';
import { DataService } from '../../core/services/data.service';
import { AuthService } from '../../core/services/auth.service';
import { NotifyService } from '../../core/services/notify.service';
import { ConnectionService } from '../../core/services/connection.service';
import { MlIntegrationService } from '../../core/services/ml-integration.service';
import { PagamentoDoMl, Recebivel, ResumoDeCaixa } from '../../core/ml/payouts';
import { Database, Sale } from '../../core/models/models';
import { makeFakeDatabase } from '../../../testing/firebase-mocks';
import { makePurchase, makeSale } from '../../../testing/fixtures';

const fakeTranslate = { instant: (key: string) => key } as unknown as TranslateService;

function pagamento(over: Partial<PagamentoDoMl> = {}): PagamentoDoMl {
  return {
    orderId: '2000001',
    paymentId: '177011312292',
    // Bem no futuro: os testes não podem virar "atrasado" com o passar do tempo.
    liberaEm: '2099-01-15T12:00:00Z',
    aprovadoEm: '2026-08-20T12:00:00Z',
    situacaoMl: 'pending',
    bruto: 178,
    liquido: 149.52,
    ...over,
  };
}

function venda(over: Partial<Sale> = {}): Sale {
  return makeSale({
    id: 'V001',
    batchId: 'C001',
    product: 'Furadeira',
    saleDate: '2026-08-20',
    unitPrice: 300,
    mlOrderId: '2000001',
    source: 'mercadolivre',
    ...over,
  });
}

const base = (sales: Sale[] = [venda()]): Database =>
  makeFakeDatabase({
    purchases: [makePurchase({ id: 'C001', product: 'Furadeira', quantityPurchased: 20 })],
    sales,
  });

function montar(db: Database, recebiveis: PagamentoDoMl[] | null, conectado = true) {
  const mlFake = {
    connected: computed(() => conectado),
    working: signal(false),
    recebiveis: computed(() => recebiveis),
    recebiveisLoaded: computed(() => recebiveis !== null),
    syncPayouts: jest.fn().mockResolvedValue(recebiveis?.length ?? 0),
  };

  TestBed.configureTestingModule({
    providers: [
      CashFlowComponent,
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

  const component = TestBed.inject(CashFlowComponent) as unknown as {
    recebiveis: () => Recebivel[];
    resumo: () => ResumoDeCaixa;
    visiveis: () => Recebivel[];
    semVinculo: () => number;
    maiorDia: () => number;
    largura: (v: number) => string;
    filtro: { set: (v: string) => void };
    ordem: { set: (v: { active: string; direction: string }) => void };
    nomeDoRecebivel: (r: Recebivel) => string;
    sincronizar: () => Promise<void>;
  };
  return { component, mlFake };
}

afterEach(() => TestBed.resetTestingModule());

describe('cruzamento com o razao', () => {
  it('mostra o recebivel da venda conciliada', () => {
    const { component } = montar(base(), [pagamento()]);
    expect(component.recebiveis()).toHaveLength(1);
    expect(component.resumo().retidoAgora).toBeCloseTo(149.52, 10);
  });

  it('pedido sem venda no razao continua contando', () => {
    // Foi o bug que a conferencia contra o app do Mercado Pago pegou: dois
    // pedidos sem venda casada faziam a tela mostrar um terco a menos.
    const manuais = [venda({ id: 'V001', mlOrderId: undefined, source: undefined })];
    const { component } = montar(base(manuais), [pagamento()]);

    expect(component.recebiveis()).toHaveLength(1);
    expect(component.resumo().retidoAgora).toBeCloseTo(149.52, 10);
    expect(component.resumo().naoConciliado).toEqual({ total: 149.52, pedidos: 1 });
  });

  it('o total e o liquido, nao o bruto', () => {
    // Se somasse o bruto, a tela prometeria R$ 178 e cairiam R$ 149,52.
    const { component } = montar(base(), [pagamento()]);
    expect(component.resumo().retidoAgora).not.toBeCloseTo(178, 10);
  });
});

describe('a tela vazia precisa dizer o porque', () => {
  it('conta as vendas do ML que ainda nao tem numero do pedido', () => {
    // É a explicação de um caixa vazio logo depois de conectar a conta.
    const manuais = [
      venda({ id: 'V001', mlOrderId: undefined, source: undefined }),
      venda({ id: 'V002', mlOrderId: undefined, source: undefined }),
    ];
    const { component } = montar(base(manuais), []);
    expect(component.recebiveis()).toHaveLength(0);
    expect(component.semVinculo()).toBe(2);
  });

  it('venda de outro canal nao conta como pendente de conciliacao', () => {
    const outro = [venda({ id: 'V001', channel: 'Shopee', mlOrderId: undefined })];
    const { component } = montar(base(outro), []);
    expect(component.semVinculo()).toBe(0);
  });

  it('com tudo conciliado, nao ha o que explicar', () => {
    const { component } = montar(base(), [pagamento()]);
    expect(component.semVinculo()).toBe(0);
  });
});

describe('filtro da lista', () => {
  const dois = () => [
    pagamento({ orderId: '2000001' }),
    pagamento({ orderId: '2000002', situacaoMl: 'released', liberaEm: '2026-08-25T12:00:00Z' }),
  ];
  const vendas = () => [
    venda({ id: 'V001', mlOrderId: '2000001' }),
    venda({ id: 'V002', mlOrderId: '2000002' }),
  ];

  it('comeca mostrando so o que falta cair', () => {
    // É a pergunta que traz a pessoa até esta tela.
    const { component } = montar(base(vendas()), dois());
    expect(component.visiveis()).toHaveLength(1);
    expect(component.visiveis()[0].situacao).toBe('retido');
  });

  it('todos mostra tambem o que ja caiu', () => {
    const { component } = montar(base(vendas()), dois());
    component.filtro.set('todos');
    expect(component.visiveis()).toHaveLength(2);
  });

  it('filtra por uma situacao especifica', () => {
    const { component } = montar(base(vendas()), dois());
    component.filtro.set('liberado');
    expect(component.visiveis().map(r => r.orderId)).toEqual(['2000002']);
  });
});

describe('barras da linha do tempo', () => {
  it('o maior dia ocupa a largura toda', () => {
    const { component } = montar(base(), [pagamento()]);
    expect(component.largura(component.maiorDia())).toBe('100%');
  });

  it('valor pequeno ainda aparece', () => {
    // Sem o mínimo, um dia de R$ 5 ao lado de um de R$ 5.000 sumiria da tela.
    const { component } = montar(base(), [pagamento()]);
    expect(component.largura(0.01)).toBe('2%');
  });

  it('sem dias futuros, a largura nao vira NaN', () => {
    const { component } = montar(base(), []);
    expect(component.largura(10)).toBe('0%');
  });
});

describe('sincronizacao', () => {
  it('chama o servidor', async () => {
    const { component, mlFake } = montar(base(), [pagamento()]);
    await component.sincronizar();
    expect(mlFake.syncPayouts).toHaveBeenCalled();
  });

  it('falha nao derruba a tela', async () => {
    const { component, mlFake } = montar(base(), [pagamento()]);
    mlFake.syncPayouts.mockRejectedValueOnce(new Error('offline'));
    await expect(component.sincronizar()).resolves.toBeUndefined();
    expect(component.recebiveis()).toHaveLength(1);
  });
});

describe('ordenacao da tabela', () => {
  /** Três recebíveis distinguíveis em todas as colunas ordenáveis. */
  const tres = () => [
    pagamento({ paymentId: 'P1', orderId: '', liberaEm: '2099-03-01T12:00:00Z', bruto: 50, liquido: 44 }),
    pagamento({ paymentId: 'P2', orderId: '2000001', liberaEm: '2099-01-15T12:00:00Z', bruto: 178, liquido: 149.52 }),
    pagamento({ paymentId: 'P3', orderId: '2000009', liberaEm: '2099-02-01T12:00:00Z', bruto: 900, liquido: null }),
  ];

  it('sem escolha, mantem o que cai primeiro no topo', () => {
    const { component } = montar(base(), tres());
    expect(component.visiveis().map(r => r.paymentId)).toEqual(['P2', 'P3', 'P1']);
  });

  it('ordena por valor bruto', () => {
    const { component } = montar(base(), tres());
    component.ordem.set({ active: 'bruto', direction: 'desc' });
    expect(component.visiveis().map(r => r.bruto)).toEqual([900, 178, 50]);
  });

  it('recebivel sem liquido informado vai para o fim nos dois sentidos', () => {
    // Ausência de dado não é um valor: no meio da lista, P3 leria como se
    // tivesse um líquido entre os outros dois.
    const { component } = montar(base(), tres());
    component.ordem.set({ active: 'liquido', direction: 'asc' });
    expect(component.visiveis().map(r => r.paymentId).at(-1)).toBe('P3');
    component.ordem.set({ active: 'liquido', direction: 'desc' });
    expect(component.visiveis().map(r => r.paymentId).at(-1)).toBe('P3');
  });

  it('ordena pelo instante, nao pelo dia', () => {
    // Dois recebíveis do mesmo dia têm ordem entre si; pelo dia empatariam e a
    // ordenação ficaria à mercê da ordem de chegada.
    const mesmoDia = [
      pagamento({ paymentId: 'tarde', orderId: '', liberaEm: '2099-01-15T20:00:00Z' }),
      pagamento({ paymentId: 'cedo', orderId: '', liberaEm: '2099-01-15T09:00:00Z' }),
    ];
    const { component } = montar(base(), mesmoDia);
    component.ordem.set({ active: 'liberaEm', direction: 'asc' });
    expect(component.visiveis().map(r => r.paymentId)).toEqual(['cedo', 'tarde']);
  });

  it('ordenar nao muda o filtro nem perde linhas', () => {
    const { component } = montar(base(), tres());
    component.ordem.set({ active: 'produto', direction: 'asc' });
    expect(component.visiveis()).toHaveLength(3);
  });
});

describe('nome da linha', () => {
  it('credito da conta e nomeado, nao fica em branco', () => {
    const { component } = montar(base(), [pagamento({ orderId: '' })]);
    expect(component.nomeDoRecebivel(component.visiveis()[0])).toBe('cashFlow.creditRow');
  });

  it('pedido sem venda no razao diz que falta conciliar', () => {
    const { component } = montar(base([]), [pagamento()]);
    expect(component.nomeDoRecebivel(component.visiveis()[0])).toBe('cashFlow.unlinkedRow');
  });

  it('pedido conciliado usa o nome do produto', () => {
    const { component } = montar(base(), [pagamento()]);
    expect(component.nomeDoRecebivel(component.visiveis()[0])).toBe('Furadeira');
  });
});
