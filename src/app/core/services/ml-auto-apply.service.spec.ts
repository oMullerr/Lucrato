jest.mock('./logger', () => ({ logError: jest.fn() }));

import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { MlAutoApplyService } from './ml-auto-apply.service';
import { MlIntegrationService } from './ml-integration.service';
import { DataService } from './data.service';
import { NotifyService } from './notify.service';
import { logError } from './logger';
import type { ItemDaCaixa, PlanoDeAplicacao } from '../ml/inbox-apply';
import type { DevolucaoDoMl, PlanoDeDevolucoes } from '../ml/returns-apply';
import type { Sale, Settings } from '../models/models';

const fakeTranslate = { instant: (key: string) => key } as unknown as TranslateService;

function makeItem(overrides: Partial<ItemDaCaixa> = {}): ItemDaCaixa {
  return {
    externalId: '2000000001:MLB1',
    mlOrderId: '2000000001',
    mlItemId: 'MLB1',
    produto: 'Produto',
    vinculado: true,
    quantitySold: 1,
    unitPrice: 200,
    saleDate: '2026-08-01',
    feePercentage: 0.12,
    shippingType: 'correios',
    sellerShipping: 0,
    discount: 0,
    status: 'Concluída',
    notes: '',
    estado: 'pendente',
    ...overrides,
  };
}

function makeDevolucao(overrides: Partial<DevolucaoDoMl> = {}): DevolucaoDoMl {
  return {
    claimId: '5108684499',
    externalIdVenda: '2000000001:MLB1',
    mlOrderId: '2000000001',
    mlItemId: 'MLB1',
    requestDate: '2026-08-10',
    returnShipping: 0,
    destination: 'Estoque',
    reason: 'Arrependimento',
    estado: 'pendente',
    ...overrides,
  };
}

function planoVazioDeVendas(): PlanoDeAplicacao {
  return { novas: [], atualizadas: [], aplicados: [], pendentes: [] };
}

/** O plano de uma devolução órfã: nada entra, nada é marcado, ela continua pendente. */
function planoOrfao(claimId = '5108684499'): PlanoDeDevolucoes {
  return { novas: [], atualizadas: [], aplicadas: [], pendentes: [{ claimId, motivo: 'sem_venda' }] };
}

interface Harness {
  service: MlAutoApplyService;
  aplicar: jest.SpyInstance;
  inbox: ReturnType<typeof signal<ItemDaCaixa[]>>;
  devolucoes: ReturnType<typeof signal<DevolucaoDoMl[]>>;
  fakeMl: { markInbox: jest.Mock; markReturns: jest.Mock };
  fakeData: { applyMlInbox: jest.Mock; applyMlReturns: jest.Mock };
  fakeNotify: { success: jest.Mock; info: jest.Mock; warning: jest.Mock; error: jest.Mock };
}

function setupHarness(opts: {
  inbox?: ItemDaCaixa[];
  devolucoes?: DevolucaoDoMl[];
  sales?: Sale[];
  planoDevolucoes?: PlanoDeDevolucoes;
  planoVendas?: PlanoDeAplicacao;
  mlAutoApply?: boolean;
} = {}): Harness {
  const inbox = signal<ItemDaCaixa[]>(opts.inbox ?? []);
  const devolucoes = signal<DevolucaoDoMl[]>(opts.devolucoes ?? []);
  const sales = signal<Sale[]>(opts.sales ?? []);
  const settings = signal<Partial<Settings>>({ mlAutoApply: opts.mlAutoApply ?? true });
  const loaded = signal(true);

  const fakeMl = {
    inboxPendentes: inbox,
    devolucoesPendentes: devolucoes,
    markInbox: jest.fn().mockResolvedValue(undefined),
    markReturns: jest.fn().mockResolvedValue(undefined),
  };
  const fakeData = {
    settings,
    loaded,
    sales,
    applyMlInbox: jest.fn().mockResolvedValue(opts.planoVendas ?? planoVazioDeVendas()),
    applyMlReturns: jest.fn().mockResolvedValue(opts.planoDevolucoes ?? planoOrfao()),
  };
  const fakeNotify = {
    success: jest.fn(), info: jest.fn(), warning: jest.fn(), error: jest.fn(),
  };

  TestBed.configureTestingModule({
    providers: [
      MlAutoApplyService,
      { provide: MlIntegrationService, useValue: fakeMl },
      { provide: DataService, useValue: fakeData },
      { provide: NotifyService, useValue: fakeNotify },
      { provide: TranslateService, useValue: fakeTranslate },
    ],
  });

  const service = TestBed.inject(MlAutoApplyService);
  // Espiado ANTES do primeiro flush: o effect nasce no construtor mas só roda ao flushar.
  const aplicar = jest.spyOn(service, 'aplicar');
  return { service, aplicar, inbox, devolucoes, fakeMl, fakeData, fakeNotify };
}

/**
 * Roda o effect e drena as microtasks, N vezes.
 *
 * É assim que o loop aparece num teste: no navegador quem re-roda o effect é a
 * detecção de mudança, sem parar; aqui cada volta é explícita, então dá para
 * CONTAR as chamadas em vez de travar o runner esperando ele "parar".
 */
async function girar(voltas = 12): Promise<void> {
  for (let i = 0; i < voltas; i++) {
    TestBed.flushEffects();
    // Microtask, e não setTimeout: o flush precisa cair NO MEIO da rodada, como
    // a detecção de mudança faz no navegador. Drenando a fila inteira antes de
    // flushar, `rodando` já voltou a false e o sinal não tem mudança líquida —
    // o effect não re-roda e o loop some do teste sem ter sumido do app.
    await Promise.resolve();
    await Promise.resolve();
  }
}

describe('MlAutoApplyService', () => {
  beforeEach(() => jest.clearAllMocks());
  afterEach(() => TestBed.resetTestingModule());

  /*
   * A regressão de 03/09/2026 (ea1fe01), que travou a aba do dono em 18/09.
   *
   * O effect LÊ `rodando()` e toda rodada de `aplicar()` liga e desliga esse
   * sinal — ou seja, terminar já re-arma o effect. A única coisa que faz o loop
   * parar é o Set `tentados`; e as saídas de devolução nunca alimentavam ele.
   * Com uma devolução que não pode entrar (a venda não está no razão), o par
   * effect→aplicar→effect roda para sempre, em microtask fechada: 100% de CPU,
   * aba congelada, DevTools que não abre e reload que não resolve, porque o que
   * dispara está no Firestore, não no navegador.
   */
  describe('o loop infinito que congelava o app', () => {
    it('tenta a devolução órfã UMA vez, não a cada rodada', async () => {
      const { aplicar } = setupHarness({ devolucoes: [makeDevolucao()] });

      await girar();

      expect(aplicar).toHaveBeenCalledTimes(1);
    });

    it('não re-tenta quando a caixa de entrada é só duplicata', async () => {
      // Venda manual idêntica ao item: `classificarCaixa` dá "duplicada", então
      // nada é classificado como novo e caímos na segunda saída de `aplicar()`.
      const vendaManual: Sale = {
        id: 'V001', batchId: 'C001', product: 'Produto', quantitySold: 1, unitPrice: 200,
        saleDate: '2026-08-01', channel: 'Mercado Livre', feePercentage: 0.12,
        shippingType: 'correios', sellerShipping: 0, discount: 0, otherCosts: 0,
        status: 'Concluída',
      };
      const { aplicar } = setupHarness({
        inbox: [makeItem()],
        devolucoes: [makeDevolucao()],
        sales: [vendaManual],
      });

      await girar();

      expect(aplicar).toHaveBeenCalledTimes(1);
    });

    it('para de tentar mesmo quando markReturns falha', async () => {
      // Marcar no servidor é rede: se falhar, a devolução continua `pendente`.
      // Isso não pode virar loop — senão uma queda de rede congela o app.
      const harness = setupHarness({
        devolucoes: [makeDevolucao()],
        planoDevolucoes: {
          novas: [], atualizadas: [], aplicadas: ['5108684499'], pendentes: [],
        },
      });
      harness.fakeMl.markReturns.mockRejectedValue(new Error('rede fora'));

      await girar();

      expect(harness.aplicar).toHaveBeenCalledTimes(1);
    });
  });

  describe('o que deve continuar funcionando', () => {
    it('registra a devolução que cabe e marca no servidor', async () => {
      const harness = setupHarness({
        devolucoes: [makeDevolucao()],
        planoDevolucoes: {
          novas: [{ id: 'D001' } as never], atualizadas: [],
          aplicadas: ['5108684499'], pendentes: [],
        },
      });

      await girar();

      expect(harness.fakeData.applyMlReturns).toHaveBeenCalledTimes(1);
      expect(harness.fakeMl.markReturns).toHaveBeenCalledWith(['5108684499'], 'aplicado');
      expect(harness.fakeNotify.info).toHaveBeenCalled();
    });

    it('não roda quando o auto-aplicar está desligado', async () => {
      const { aplicar } = setupHarness({
        devolucoes: [makeDevolucao()],
        mlAutoApply: false,
      });

      await girar();

      expect(aplicar).not.toHaveBeenCalled();
    });

    it('devolução nova que chega depois é tentada', async () => {
      const harness = setupHarness({ devolucoes: [makeDevolucao()] });
      await girar();
      expect(harness.aplicar).toHaveBeenCalledTimes(1);

      harness.devolucoes.set([makeDevolucao(), makeDevolucao({ claimId: '9999' })]);
      await girar();

      expect(harness.aplicar).toHaveBeenCalledTimes(2);
    });

    /* O botão "Tentar aplicar agora" (ml-inbox.component.ts) esquece as
       tentativas e chama `aplicar()` direto — não espera o effect, que só
       reage a sinal. O que importa aqui é que essa volta manual não re-arma o
       loop: ela tenta de novo uma vez e para. */
    it('o botão "tentar agora" tenta de novo uma vez, e não volta a girar', async () => {
      const harness = setupHarness({ devolucoes: [makeDevolucao()] });
      await girar();
      expect(harness.aplicar).toHaveBeenCalledTimes(1);

      harness.service.esquecerTentativas();
      await harness.service.aplicar();
      await girar();

      expect(harness.aplicar).toHaveBeenCalledTimes(2);
    });
  });

  /*
   * A trava existe para o caso que não previmos.
   *
   * Mesma regra que a `comPrazo` já firmou para Promise, aplicada a effect:
   * estourar o limite é um resultado — dá para logar e seguir. Rodar para
   * sempre não é. Se um caminho futuro voltar a re-armar o effect sem registrar
   * nada, isto degrada em uma linha de log, não em aba congelada.
   */
  describe('trava de segurança', () => {
    it('desarma e loga quando as rodadas viram um loop', async () => {
      const harness = setupHarness({ devolucoes: [makeDevolucao()] });

      /* O perigo que a trava cobre: uma fonte que não para de produzir item
         novo que nunca entra. `tentados` não segura isso — cada claimId é
         realmente inédito —, e cada rodada re-arma o effect por sinal, de
         verdade. Sem a trava, gira até a aba morrer.
         `prototype` e não o spy, senão o teste chama a si mesmo. */
      const original = MlAutoApplyService.prototype.aplicar;
      let n = 0;
      harness.aplicar.mockImplementation(async () => {
        const total = await original.call(harness.service);
        harness.devolucoes.set([makeDevolucao({ claimId: `claim-${++n}` })]);
        return total;
      });

      await girar(80);

      // Parou sozinho, bem antes do fim, e deixou rastro.
      expect(harness.aplicar.mock.calls.length).toBeLessThan(40);
      expect(logError).toHaveBeenCalledWith(
        expect.stringContaining('[MlAutoApply]'),
        expect.anything(),
      );
    });
  });
});
