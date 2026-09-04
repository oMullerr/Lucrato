/**
 * Tela de faturamento: escolha do período, filtro e o confronto ligado ao razão.
 *
 * O MlIntegrationService entra como dublê (a fatura viria do Firestore), mas o
 * DataService é real: a comissão comparada aqui sai do mesmo motor de cálculo
 * que o painel usa. Se a tela discordasse de `calculateSale`, a conciliação
 * estaria conferindo contra um número que o app não mostra em lugar nenhum.
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
import { BillingComponent } from './billing.component';
import { DataService } from '../../core/services/data.service';
import { AuthService } from '../../core/services/auth.service';
import { NotifyService } from '../../core/services/notify.service';
import { ConnectionService } from '../../core/services/connection.service';
import { MlIntegrationService } from '../../core/services/ml-integration.service';
import {
  Confronto,
  ConfrontoDoPedido,
  PeriodoDeFaturamento,
  VERSAO_AGREGACAO,
} from '../../core/ml/billing';
import { Database } from '../../core/models/models';
import { makeFakeDatabase } from '../../../testing/firebase-mocks';
import { makePurchase, makeSale } from '../../../testing/fixtures';

const fakeTranslate = { instant: (key: string) => key } as unknown as TranslateService;

function periodo(over: Partial<PeriodoDeFaturamento> = {}): PeriodoDeFaturamento {
  return {
    key: '2026-09-01',
    dateFrom: '2026-08-19',
    dateTo: '2026-09-18',
    status: 'CLOSED',
    totalMl: 44,
    cobrado: { comissao: 24, frete: 20, outros: 0 },
    porRotulo: [
      { rotulo: 'Cargo por venda', subTipo: 'CV', balde: 'comissao', valor: 24, linhas: 1 },
      { rotulo: 'Cargo por Mercado Envios', subTipo: 'CXD', balde: 'frete', valor: 20, linhas: 1 },
    ],
    porPedido: [{ orderId: '2000001', comissao: 24, frete: 20, outros: 0 }],
    detalhes: 2,
    truncado: false,
    versao: VERSAO_AGREGACAO,
    ...over,
  };
}

function montar(db: Database, faturamento: PeriodoDeFaturamento[]) {
  const mlFake = {
    connected: computed(() => true),
    working: signal(false),
    faturamento: computed(() => faturamento),
    faturamentoLoaded: computed(() => true),
    syncBilling: jest.fn().mockResolvedValue({ total: faturamento.length, faltam: 0 }),
  };

  TestBed.configureTestingModule({
    providers: [
      BillingComponent,
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

  const component = TestBed.inject(BillingComponent) as unknown as {
    periodos: () => PeriodoDeFaturamento[];
    periodo: () => PeriodoDeFaturamento | null;
    confronto: () => Confronto | null;
    pedidos: () => ConfrontoDoPedido[];
    totalCobrado: () => number;
    naoExplicado: () => number;
    tomDaDiferenca: () => string;
    soDivergentes: { set: (v: boolean) => void };
    escolher: (key: string) => void;
    rotuloDoPeriodo: (p: PeriodoDeFaturamento) => string;
    sincronizar: () => Promise<void>;
  };
  return { component, mlFake };
}

/** Venda de 200 com 12% de comissão e 20 de frete: 24 + 20, igual à fatura. */
const baseDb = (): Database =>
  makeFakeDatabase({
    purchases: [makePurchase({ id: 'C001', product: 'Furadeira', quantityPurchased: 10 })],
    sales: [
      makeSale({
        id: 'V001',
        batchId: 'C001',
        product: 'Furadeira',
        saleDate: '2026-09-01',
        unitPrice: 200,
        feePercentage: 0.12,
        sellerShipping: 20,
        mlOrderId: '2000001',
        source: 'mercadolivre',
      }),
    ],
  });

describe('escolha do periodo', () => {
  it('abre no mais recente quando nada foi escolhido', () => {
    const { component } = montar(baseDb(), [
      periodo({ key: '2026-08-01' }),
      periodo({ key: '2026-09-01' }),
    ]);
    // A lista chega ordenada pelo serviço; a tela respeita a ordem recebida.
    expect(component.periodo()!.key).toBe('2026-08-01');
  });

  it('troca o periodo mostrado', () => {
    const { component } = montar(baseDb(), [
      periodo({ key: '2026-09-01' }),
      periodo({ key: '2026-08-01', porPedido: [] }),
    ]);
    component.escolher('2026-08-01');
    expect(component.periodo()!.key).toBe('2026-08-01');
    expect(component.confronto()!.pedidos).toHaveLength(0);
  });

  it('periodo que sumiu da lista cai no mais recente em vez de quebrar', () => {
    const { component } = montar(baseDb(), [periodo({ key: '2026-09-01' })]);
    component.escolher('2020-01-01');
    expect(component.periodo()!.key).toBe('2026-09-01');
  });
});

describe('confronto na tela', () => {
  it('usa a comissao que o proprio app calcula', () => {
    const { component } = montar(baseDb(), [periodo()]);
    const c = component.confronto()!;
    expect(c.registradoComparavel).toBeCloseTo(44, 10);
    expect(c.diferenca).toBeCloseTo(0, 10);
  });

  it('sem divergencia o cartao fica verde', () => {
    const { component } = montar(baseDb(), [periodo()]);
    expect(component.tomDaDiferenca()).toBe('success');
  });

  it('cobranca a maior fica vermelha', () => {
    const { component } = montar(baseDb(), [
      periodo({ porPedido: [{ orderId: '2000001', comissao: 34, frete: 20, outros: 0 }] }),
    ]);
    expect(component.tomDaDiferenca()).toBe('danger');
  });

  it('cobranca a menor avisa, mas nao alarma', () => {
    const { component } = montar(baseDb(), [
      periodo({ porPedido: [{ orderId: '2000001', comissao: 14, frete: 20, outros: 0 }] }),
    ]);
    expect(component.tomDaDiferenca()).toBe('warning');
  });

  it('total do periodo soma os tres baldes', () => {
    const { component } = montar(baseDb(), [
      periodo({ cobrado: { comissao: 24, frete: 20, outros: 48.6 } }),
    ]);
    expect(component.totalCobrado()).toBeCloseTo(92.6, 10);
  });
});

describe('filtro de divergentes', () => {
  it('ligado, esconde o pedido que bate', () => {
    const { component } = montar(baseDb(), [periodo()]);
    expect(component.pedidos()).toHaveLength(0);
  });

  it('desligado, mostra todos os comparaveis', () => {
    const { component } = montar(baseDb(), [periodo()]);
    component.soDivergentes.set(false);
    expect(component.pedidos()).toHaveLength(1);
    expect(component.pedidos()[0].veredito).toBe('ok');
  });

  it('ligado, mantem o pedido divergente a vista', () => {
    const { component } = montar(baseDb(), [
      periodo({ porPedido: [{ orderId: '2000001', comissao: 34, frete: 20, outros: 0 }] }),
    ]);
    expect(component.pedidos()).toHaveLength(1);
    expect(component.pedidos()[0].diferenca).toBeCloseTo(10, 10);
  });
});

describe('total do Mercado Livre versus o que foi coletado', () => {
  it('quando fecham, nao ha nada a explicar', () => {
    const { component } = montar(baseDb(), [periodo()]);
    expect(component.naoExplicado()).toBeCloseTo(0, 10);
  });

  it('sobra do total do Mercado Livre nao fica escondida', () => {
    // A varredura pede só faturas; nota de crédito entra no total dele e não
    // no nosso. Dinheiro sem explicação precisa aparecer, não sumir.
    const { component } = montar(baseDb(), [periodo({ totalMl: 91.84 })]);
    expect(component.naoExplicado()).toBeCloseTo(47.84, 10);
  });
});

describe('sincronizacao', () => {
  it('chama o servidor e avisa', async () => {
    const { component, mlFake } = montar(baseDb(), [periodo()]);
    await component.sincronizar();
    expect(mlFake.syncBilling).toHaveBeenCalled();
  });

  it('varredura interrompida avisa em vez de fingir que terminou', async () => {
    const { component, mlFake } = montar(baseDb(), [periodo()]);
    const notify = TestBed.inject(NotifyService);
    mlFake.syncBilling.mockResolvedValueOnce({ total: 4, faltam: 3 });
    await component.sincronizar();
    expect(notify.warning).toHaveBeenCalled();
    expect(notify.success).not.toHaveBeenCalled();
  });

  it('falha do servidor nao derruba a tela', async () => {
    const { component, mlFake } = montar(baseDb(), [periodo()]);
    mlFake.syncBilling.mockRejectedValueOnce(new Error('offline'));
    await expect(component.sincronizar()).resolves.toBeUndefined();
    expect(component.periodo()).not.toBeNull();
  });
});
