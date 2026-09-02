jest.mock('@angular/fire/firestore', () => ({
  Firestore: class Firestore {},
  doc: jest.fn(),
  setDoc: jest.fn(),
  onSnapshot: jest.fn(),
}));

import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { TranslateService } from '@ngx-translate/core';
import { Firestore } from '@angular/fire/firestore';
import { ReturnFormDialogComponent, ReturnDialogData } from './return-form.dialog';
import { DataService } from '../../core/services/data.service';
import { AuthService } from '../../core/services/auth.service';
import { NotifyService } from '../../core/services/notify.service';
import { ConnectionService } from '../../core/services/connection.service';
import { FROZEN_NOW } from '../../../testing/golden-dataset';
import { goldenReturnsDb } from '../../../testing/golden-returns';
import type { Database, Return } from '../../core/models/models';

const fakeTranslate = { instant: (k: string) => k } as unknown as TranslateService;

function build(data: ReturnDialogData, db: Database) {
  const close = jest.fn();
  TestBed.configureTestingModule({
    providers: [
      ReturnFormDialogComponent,
      DataService,
      { provide: Firestore, useValue: {} },
      { provide: AuthService, useValue: { currentUser: signal(undefined), refreshIdToken: jest.fn() } },
      { provide: NotifyService, useValue: { success: jest.fn(), warning: jest.fn(), error: jest.fn(), info: jest.fn() } },
      {
        provide: ConnectionService,
        useValue: {
          reportSnapshot: jest.fn(), reportSnapshotError: jest.fn(),
          syncError: signal<unknown>(null), clearSyncError: jest.fn(),
        },
      },
      { provide: TranslateService, useValue: fakeTranslate },
      { provide: DialogRef, useValue: { close } },
      { provide: DIALOG_DATA, useValue: data },
    ],
  });
  const service = TestBed.inject(DataService);
  (service as any).db.set(db);
  return { cmp: TestBed.inject(ReturnFormDialogComponent) as any, close, service };
}

describe('ReturnFormDialogComponent', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(FROZEN_NOW); // 2026-06-15
  });
  afterEach(() => {
    jest.useRealTimers();
    TestBed.resetTestingModule();
  });

  describe('modelo inicial', () => {
    it('gera o próximo id, data de hoje e destino padrão', () => {
      const { cmp } = build({}, goldenReturnsDb({ returns: [] }));
      expect(cmp.model().id).toBe('D001');
      expect(cmp.model().requestDate).toBe('2026-06-15');
      expect(cmp.model().destination).toBe('Estoque');
      expect(cmp.model().arrivalDate).toBeUndefined();
      expect(cmp.isEdit()).toBe(false);
    });

    it('pré-seleciona e denormaliza a venda quando aberta pela tela de Vendas', () => {
      const { cmp } = build({ saleId: 'V002' }, goldenReturnsDb({ returns: [] }));
      expect(cmp.model().saleId).toBe('V002');
      expect(cmp.model().batchId).toBe('C001');
      expect(cmp.model().product).toBe('Fone BT');
      expect(cmp.model().channel).toBe('Shopee');
    });
  });

  describe('janela de devolução (returnWindowDays)', () => {
    const dbNoReturns = () => goldenReturnsDb({ returns: [] });

    it('com 30 dias, só ofereces vendas de 16/05 em diante', () => {
      const { cmp } = build({}, dbNoReturns());
      const ids = cmp.availableSales().map((s: any) => s.id).sort();
      // V002 20/05, V003 10/06, V005 12/06, V007 01/06 estão dentro.
      // V001 (10/02) e V006 (2025) ficam fora; V004 é Cancelada.
      expect(ids).toEqual(['V002', 'V003', 'V005', 'V007']);
    });

    it('encolhe a lista quando a janela cai para 5 dias', () => {
      const db = dbNoReturns();
      db.settings.returnWindowDays = 5;
      const { cmp } = build({}, db);
      const ids = cmp.availableSales().map((s: any) => s.id).sort();
      expect(ids).toEqual(['V003', 'V005']); // 10/06 e 12/06
    });

    it('aumenta a lista quando a janela cresce para 200 dias', () => {
      const db = dbNoReturns();
      db.settings.returnWindowDays = 200;
      const { cmp } = build({}, db);
      expect(cmp.availableSales().map((s: any) => s.id)).toContain('V001'); // 10/02
    });

    it('exclui vendas Canceladas e sem saldo devolvível', () => {
      const { cmp } = build({}, goldenReturnsDb());
      const ids = cmp.availableSales().map((s: any) => s.id);
      expect(ids).not.toContain('V004'); // Cancelada
      expect(ids).not.toContain('V003'); // 100% devolvida
    });

    it('na EDIÇÃO preserva a venda original mesmo fora da janela', () => {
      const db = goldenReturnsDb();
      const d003 = db.returns.find(r => r.id === 'D003')!; // venda V001 de fevereiro
      const { cmp } = build({ ret: d003 }, db);
      expect(cmp.isEdit()).toBe(true);
      expect(cmp.availableSales().map((s: any) => s.id)).toContain('V001');
    });
  });

  describe('quantidade devolvível', () => {
    it('máximo é a quantidade da venda menos o que já foi devolvido', () => {
      const { cmp } = build({ saleId: 'V002' }, goldenReturnsDb());
      // V002 vendeu 3; D001 (finalizada) e D004 (solicitada) já consomem 2.
      expect(cmp.maxQuantity()).toBe(1);
    });

    it('conta também as devoluções ainda Solicitadas', () => {
      const db = goldenReturnsDb();
      db.returns = db.returns.filter(r => r.id !== 'D001'); // sobra só a solicitada
      const { cmp } = build({ saleId: 'V002' }, db);
      expect(cmp.maxQuantity()).toBe(2);
    });

    it('na edição, a própria devolução não conta contra si mesma', () => {
      const db = goldenReturnsDb();
      const d001 = db.returns.find(r => r.id === 'D001')!;
      const { cmp } = build({ ret: d001 }, db);
      expect(cmp.maxQuantity()).toBe(2); // 3 − 1 (a solicitada D004)
    });

    it('sinaliza excesso e invalida o formulário', () => {
      const { cmp } = build({ saleId: 'V002' }, goldenReturnsDb());
      cmp.onQuantityChange(5);
      expect(cmp.exceedsQuantity()).toBe(true);
      expect(cmp.isValid()).toBe(false);
    });
  });

  describe('valor ressarcido', () => {
    it('fica oculto no destino Estoque', () => {
      const { cmp } = build({ saleId: 'V002' }, goldenReturnsDb({ returns: [] }));
      expect(cmp.showRefund()).toBe(false);
    });

    it('pré-preenche com quantidade × preço ao escolher Ressarcido', () => {
      const { cmp } = build({ saleId: 'V002' }, goldenReturnsDb({ returns: [] }));
      cmp.onDestinationChange('Ressarcido');
      expect(cmp.showRefund()).toBe(true);
      expect(cmp.model().refundedAmount).toBe(90); // 1 × 90
      cmp.onQuantityChange(2);
      expect(cmp.model().refundedAmount).toBe(180);
    });

    it('NÃO sobrescreve um valor digitado pelo usuário', () => {
      const { cmp } = build({ saleId: 'V002' }, goldenReturnsDb({ returns: [] }));
      cmp.onDestinationChange('Ressarcido');
      cmp.onRefundChange(45);
      cmp.onQuantityChange(2);
      expect(cmp.model().refundedAmount).toBe(45);
      cmp.onDestinationChange('Fornecedor');
      expect(cmp.model().refundedAmount).toBe(45);
    });

    it('não sugere valor nos destinos Perda e Fornecedor', () => {
      const { cmp } = build({ saleId: 'V002' }, goldenReturnsDb({ returns: [] }));
      cmp.onDestinationChange('Perda');
      expect(cmp.model().refundedAmount).toBeUndefined();
    });
  });

  describe('validação', () => {
    function valid() {
      const { cmp, close } = build({ saleId: 'V002' }, goldenReturnsDb({ returns: [] }));
      return { cmp, close };
    }

    it('aceita uma devolução mínima válida', () => {
      const { cmp } = valid();
      expect(cmp.isValid()).toBe(true);
    });

    it('rejeita sem venda selecionada', () => {
      const { cmp } = build({}, goldenReturnsDb({ returns: [] }));
      expect(cmp.isValid()).toBe(false);
    });

    it('rejeita chegada anterior à solicitação', () => {
      const { cmp } = valid();
      cmp.setRequestDate(new Date(2026, 5, 10));
      cmp.setArrivalDate(new Date(2026, 5, 5));
      expect(cmp.arrivalBeforeRequest()).toBe(true);
      expect(cmp.isValid()).toBe(false);
    });

    it('rejeita chegada no futuro', () => {
      const { cmp } = valid();
      cmp.setArrivalDate(new Date(2026, 6, 20));
      expect(cmp.arrivalInFuture()).toBe(true);
      expect(cmp.isValid()).toBe(false);
    });

    it('rejeita solicitação anterior à venda', () => {
      const { cmp } = valid();
      cmp.setRequestDate(new Date(2026, 0, 1)); // antes de V002 (20/05)
      expect(cmp.requestBeforeSale()).toBe(true);
      expect(cmp.isValid()).toBe(false);
    });

    it('aceita chegada igual à solicitação', () => {
      const { cmp } = valid();
      cmp.setRequestDate(new Date(2026, 5, 10));
      cmp.setArrivalDate(new Date(2026, 5, 10));
      expect(cmp.isValid()).toBe(true);
    });
  });

  describe('preview do impacto', () => {
    it('finalizada mostra lucro antes/depois e o valor perdido', () => {
      const { cmp } = build({ saleId: 'V002' }, goldenReturnsDb({ returns: [] }));
      cmp.onQuantityChange(1);
      cmp.setNum('returnShipping', 12);
      cmp.setArrivalDate(new Date(2026, 5, 2));
      const p = cmp.preview();
      expect(p.before.netProfit).toBeCloseTo(80.6, 10);
      expect(p.after.netProfit).toBeCloseTo(40.4 + 4 / 3, 10);
      expect(p.loss).toBeCloseTo(38.2 + 2 / 3, 10);
      expect(p.stockBack).toBe(true);
    });

    it('solicitada não muda nada e expõe só o valor em risco', () => {
      const { cmp } = build({ saleId: 'V002' }, goldenReturnsDb({ returns: [] }));
      cmp.setNum('returnShipping', 30);
      const p = cmp.preview();
      expect(p.loss).toBe(0);
      expect(p.after.netProfit).toBeCloseTo(p.before.netProfit, 10);
      expect(p.atRisk).toBe(90);
      expect(cmp.isFinalized()).toBe(false);
    });

    it('ressarcimento integral deixa o vendedor à frente pela taxa estornada', () => {
      const { cmp } = build({ saleId: 'V002' }, goldenReturnsDb({ returns: [] }));
      cmp.setRequestDate(new Date(2026, 4, 25));
      cmp.onDestinationChange('Ressarcido'); // pré-preenche 90
      cmp.setArrivalDate(new Date(2026, 5, 2));
      const p = cmp.preview();
      // Perde 90 de receita e recupera 90, mas a taxa de 10,80 também é estornada;
      // só 2/3 disso escapa pelo Flex e outros custos que somem junto. O custo da
      // unidade continua cobrado nos dois cenários e cancela na diferença.
      expect(p.loss).toBeCloseTo(-(10.8 - 2 / 3), 10);
      expect(p.after.netProfit).toBeGreaterThan(p.before.netProfit);
      expect(p.stockBack).toBe(false);
      expect(cmp.lossClass()).toBe('text-success');
    });

    it('com ressarcimento integral, o frete da devolução supera a taxa estornada', () => {
      const { cmp } = build({ saleId: 'V002' }, goldenReturnsDb({ returns: [] }));
      cmp.setRequestDate(new Date(2026, 4, 25));
      cmp.onDestinationChange('Ressarcido');
      cmp.setNum('returnShipping', 18);
      cmp.setArrivalDate(new Date(2026, 5, 2));
      expect(cmp.preview().loss).toBeCloseTo(18 - (10.8 - 2 / 3), 10);
      expect(cmp.lossClass()).toBe('text-danger');
    });

    it('destino Estoque sinaliza retorno da unidade ao lote', () => {
      const { cmp } = build({ saleId: 'V002' }, goldenReturnsDb({ returns: [] }));
      cmp.setArrivalDate(new Date(2026, 5, 2));
      expect(cmp.preview().stockBack).toBe(true);
      cmp.onDestinationChange('Perda');
      expect(cmp.preview().stockBack).toBe(false);
    });
  });

  describe('save()', () => {
    it('remove campos vazios para não gravar undefined no Firestore', () => {
      const { cmp, close } = build({ saleId: 'V002' }, goldenReturnsDb({ returns: [] }));
      cmp.save();
      const saved = close.mock.calls[0][0] as Return;
      expect('arrivalDate' in saved).toBe(false);
      expect('refundedAmount' in saved).toBe(false);
      expect('customerReason' in saved).toBe(false);
      expect('resolution' in saved).toBe(false);
      expect('notes' in saved).toBe(false);
      expect(JSON.stringify(saved)).not.toContain('undefined');
    });

    it('preserva os campos preenchidos', () => {
      const { cmp, close } = build({ saleId: 'V002' }, goldenReturnsDb({ returns: [] }));
      cmp.onDestinationChange('Fornecedor');
      cmp.onRefundChange(40);
      cmp.setRequestDate(new Date(2026, 4, 25));
      cmp.setArrivalDate(new Date(2026, 5, 2));
      cmp.set('customerReason', 'Chegou riscado');
      cmp.set('resolution', 'Reembolso total');
      cmp.save();
      const saved = close.mock.calls[0][0] as Return;
      expect(saved).toMatchObject({
        saleId: 'V002', batchId: 'C001', product: 'Fone BT', channel: 'Shopee',
        destination: 'Fornecedor', refundedAmount: 40,
        requestDate: '2026-05-25', arrivalDate: '2026-06-02',
        customerReason: 'Chegou riscado', resolution: 'Reembolso total',
      });
    });

    it('não fecha quando o formulário é inválido', () => {
      const { cmp, close } = build({}, goldenReturnsDb({ returns: [] }));
      cmp.save();
      expect(close).not.toHaveBeenCalled();
    });

    it('descarta o valor ressarcido se o destino voltar para Estoque', () => {
      const { cmp, close } = build({ saleId: 'V002' }, goldenReturnsDb({ returns: [] }));
      cmp.onDestinationChange('Ressarcido');
      cmp.onDestinationChange('Estoque');
      cmp.save();
      expect('refundedAmount' in (close.mock.calls[0][0] as Return)).toBe(false);
    });
  });
});

describe('ReturnFormDialogComponent — fuso na data padrão', () => {
  const originalTz = process.env['TZ'];
  beforeAll(() => { process.env['TZ'] = 'America/Sao_Paulo'; });
  afterAll(() => { process.env['TZ'] = originalTz; });
  beforeEach(() => { jest.useFakeTimers(); });
  afterEach(() => { jest.useRealTimers(); TestBed.resetTestingModule(); });

  it('às 21h30 BRT usa a data local (hoje), não a data UTC de amanhã', () => {
    const noite = new Date('2026-07-07T00:30:00Z'); // 06/07 21:30 em São Paulo
    expect(noite.getTimezoneOffset()).toBe(180);
    jest.setSystemTime(noite);
    const { cmp } = build({}, goldenReturnsDb({ returns: [] }));
    expect(cmp.model().requestDate).toBe('2026-07-06');
  });
});
