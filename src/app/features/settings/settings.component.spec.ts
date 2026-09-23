/**
 * Configurações: o recorte do que esta tela possui.
 *
 * O bug que estes testes fecham era silencioso e caro. `Settings` guarda campos
 * que OUTRAS telas escrevem — `mlAutoApply` (interruptor em Integrações),
 * `fiscal`, `dasPaidMonths`, `dasnDeclaredYears` (tela Fiscal) — e o diff do
 * salvamento percorria `Object.keys` do objeto inteiro. Com o formulário aberto
 * e o valor mudado em outra aba, salvar uma cor de categoria aqui devolvia o
 * valor velho por cima: o auto-aplicar religava sozinho, o DAS pago
 * desmarcava, e nada na tela dizia que isso tinha acontecido.
 *
 * Também sumiu daqui um `onSnapshot` próprio sobre `users/{uid}/db/main` — o
 * mesmo documento que o DataService já escutava a sessão inteira — com uma
 * segunda cópia da composição de defaults que já discordava da primeira.
 */
jest.mock('@angular/fire/firestore', () => ({
  Firestore: class Firestore {},
  doc: jest.fn(() => ({ __ref: true })),
  setDoc: jest.fn().mockResolvedValue(undefined),
  onSnapshot: jest.fn(),
  deleteField: jest.fn(),
}));

import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { Firestore, setDoc } from '@angular/fire/firestore';
import { SettingsComponent } from './settings.component';
import { DataService } from '../../core/services/data.service';
import { AuthService } from '../../core/services/auth.service';
import { ImportService } from '../../core/services/import.service';
import { NotifyService } from '../../core/services/notify.service';
import { DialogService } from '../../shared/ui/dialog/dialog.service';
import { DEFAULT_FISCAL_CONFIG } from '../../core/fiscal/fiscal-regimes';
import type { Settings } from '../../core/models/models';

const fakeTranslate = { instant: (k: string) => k } as unknown as TranslateService;

function settings(over: Partial<Settings> = {}): Settings {
  return {
    defaultMlFee: 0.12,
    yellowAlertDays: 25,
    redAlertDays: 30,
    minimumMargin: 0.1,
    lowStockAlert: 1,
    defaultShipping: 0,
    returnWindowDays: 30,
    defaultChannel: 'Mercado Livre',
    categories: ['Eletrônicos'],
    categoryColors: {},
    suppliers: ['Amazon BR'],
    supplierColors: {},
    channels: ['Mercado Livre'],
    channelColors: {},
    fiscal: DEFAULT_FISCAL_CONFIG,
    dasPaidMonths: ['2026-01'],
    dasnDeclaredYears: [2025],
    mlAutoApply: true,
    ...over,
  };
}

function montar(inicial: Settings) {
  const atual = signal<Settings | null>(inicial);
  const notify = { success: jest.fn(), error: jest.fn(), warning: jest.fn(), info: jest.fn() };

  TestBed.configureTestingModule({
    providers: [
      SettingsComponent,
      { provide: Firestore, useValue: {} },
      { provide: DataService, useValue: { settings: atual, purchases: () => [], sales: () => [], returns: () => [] } },
      { provide: AuthService, useValue: { currentUser: () => ({ uid: 'u1' }), storeName: () => 'Loja' } },
      { provide: ImportService, useValue: { downloadTemplate: jest.fn(), parseFile: jest.fn() } },
      { provide: NotifyService, useValue: notify },
      { provide: TranslateService, useValue: fakeTranslate },
      { provide: DialogService, useValue: { open: jest.fn() } },
    ],
  });

  const cmp = TestBed.inject(SettingsComponent) as any;
  /* O componente é instanciado por DI, sem fixture: os effects existem mas só
     rodam no flush. `sincronizar` deixa isso explícito em vez de espalhar
     `flushEffects` por dentro de cada asserção. */
  const sincronizar = () => TestBed.flushEffects();
  sincronizar();
  return { cmp, atual, notify, sincronizar };
}

/** O que foi de fato enviado ao Firestore na última gravação. */
function ultimoPayload(): Record<string, unknown> {
  const calls = (setDoc as jest.Mock).mock.calls;
  return (calls[calls.length - 1][1] as { settings: Record<string, unknown> }).settings;
}

beforeEach(() => jest.clearAllMocks());
afterEach(() => TestBed.resetTestingModule());

describe('o formulário só grava o que é dele', () => {
  it('não devolve mlAutoApply ao servidor', async () => {
    // O cenário real: o dono desliga o auto-aplicar em Integrações e depois
    // salva uma cor aqui. O valor velho não pode voltar junto.
    const { cmp } = montar(settings({ mlAutoApply: true }));
    cmp.updateField('categories', ['Eletrônicos', 'Ferramentas']);

    await cmp.save();

    const enviado = ultimoPayload();
    expect(enviado['categories']).toEqual(['Eletrônicos', 'Ferramentas']);
    expect(enviado).not.toHaveProperty('mlAutoApply');
  });

  it('não devolve a configuração fiscal nem o DAS pago', async () => {
    const { cmp } = montar(settings());
    cmp.updateField('defaultShipping', 15);

    await cmp.save();

    const enviado = ultimoPayload();
    expect(enviado).not.toHaveProperty('fiscal');
    expect(enviado).not.toHaveProperty('dasPaidMonths');
    expect(enviado).not.toHaveProperty('dasnDeclaredYears');
  });

  it('grava só os campos que mudaram', async () => {
    const { cmp } = montar(settings());
    cmp.updateField('lowStockAlert', 3);

    await cmp.save();

    expect(Object.keys(ultimoPayload())).toEqual(['lowStockAlert']);
  });

  it('nada mudou: não grava', async () => {
    const { cmp, notify } = montar(settings());
    await cmp.save();
    expect(setDoc).not.toHaveBeenCalled();
    expect(notify.info).toHaveBeenCalledWith('settings.nothingToSave');
  });
});

describe('sincronia com o que está gravado', () => {
  it('mudança vinda de fora entra no formulário quando não há edição pendente', () => {
    const { cmp, atual, sincronizar } = montar(settings({ defaultShipping: 0 }));
    atual.set(settings({ defaultShipping: 22 }));
    sincronizar();
    expect(cmp.form().defaultShipping).toBe(22);
  });

  it('mudança vinda de fora NÃO atropela o que está sendo editado', () => {
    const { cmp, atual, sincronizar } = montar(settings({ defaultShipping: 0 }));
    cmp.updateField('defaultShipping', 99);
    atual.set(settings({ defaultShipping: 22 }));
    sincronizar();
    expect(cmp.form().defaultShipping).toBe(99);
  });

  it('campo de outra tela mudando não marca o formulário como alterado', () => {
    // Antes, `hasChanges` comparava o objeto inteiro: um toggle em Integrações
    // acendia o botão "Salvar" aqui, sem nada ter sido editado nesta tela.
    const { cmp, atual, sincronizar } = montar(settings({ mlAutoApply: true }));
    expect(cmp.hasChanges()).toBe(false);
    atual.set(settings({ mlAutoApply: false }));
    sincronizar();
    expect(cmp.hasChanges()).toBe(false);
  });

  it('descartar volta ao que está gravado', () => {
    const { cmp } = montar(settings({ defaultShipping: 7 }));
    cmp.updateField('defaultShipping', 99);
    expect(cmp.hasChanges()).toBe(true);
    cmp.discard();
    expect(cmp.form().defaultShipping).toBe(7);
    expect(cmp.hasChanges()).toBe(false);
  });
});

describe('validação antes de gravar', () => {
  it('taxa fora de 0–1 não passa', async () => {
    const { cmp, notify } = montar(settings());
    cmp.updateField('defaultMlFee', 1.5);
    await cmp.save();
    expect(setDoc).not.toHaveBeenCalled();
    expect(notify.error).toHaveBeenCalledWith('settings.valFee');
  });

  it('alerta vermelho antes do amarelo não passa', async () => {
    const { cmp, notify } = montar(settings());
    cmp.updateField('redAlertDays', 10);
    await cmp.save();
    expect(setDoc).not.toHaveBeenCalled();
    expect(notify.error).toHaveBeenCalledWith('settings.valRedGteYellow');
  });
});
