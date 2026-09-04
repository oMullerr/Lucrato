/**
 * Harness reutilizável para testar computed signals de componentes de feature
 * SEM renderizar template (jsdom não tem canvas para chart.js).
 *
 * - DataService é REAL: prova a cadeia completa db → computedPurchases/Sales → kpis → componente.
 * - O componente é instanciado via DI (TestBed.inject), nunca via createComponent.
 *   viewChild() devolve undefined e os effects de paginação/ordenacão viram no-ops.
 * - Cada spec ainda precisa declarar seu próprio bloco:
 *     jest.mock('@angular/fire/firestore', () => ({ Firestore: class {}, doc: jest.fn(), setDoc: jest.fn(), onSnapshot: jest.fn() }));
 *   (jest.mock é içado por arquivo; não funciona dentro deste helper.)
 */
import { Type, computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { TranslateService } from '@ngx-translate/core';
import { BreakpointObserver } from '@angular/cdk/layout';
import { Firestore } from '@angular/fire/firestore';
import { DataService } from '../app/core/services/data.service';
import { AuthService } from '../app/core/services/auth.service';
import { NotifyService } from '../app/core/services/notify.service';
import { ConnectionService } from '../app/core/services/connection.service';
import { ThemeService } from '../app/core/services/theme.service';
import { LanguageService } from '../app/core/services/language.service';
import { QuickActionsService } from '../app/core/services/quick-actions.service';
import { XlsxExportService } from '../app/core/services/xlsx-export.service';
import { DialogService } from '../app/shared/ui/dialog/dialog.service';
import { MlIntegrationService } from '../app/core/services/ml-integration.service';
import type { Database } from '../app/core/models/models';

export const MONTHS_FIXTURE = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/** instant() devolve a própria chave (testes independentes de tradução), exceto o array de meses. */
const fakeTranslate = {
  instant: (key: string) => (key === 'dashboard.months' ? MONTHS_FIXTURE : key),
} as unknown as TranslateService;

export interface ComponentHarness<T> {
  component: T;
  data: DataService;
  fakes: {
    notify: { success: jest.Mock; warning: jest.Mock; error: jest.Mock; info: jest.Mock };
    dialog: { open: jest.Mock };
    xlsx: { download: jest.Mock };
    quick: { markReceivedToday: jest.Mock };
  };
}

/** Monta o TestBed com DataService real + fakes, carrega o db e instancia o componente via DI. */
export function setupComponentHarness<T>(cmp: Type<T>, db: Database): ComponentHarness<T> {
  const fakeAuth = {
    currentUser: signal(undefined),
    refreshIdToken: jest.fn().mockResolvedValue(undefined),
  };
  const fakeNotify = { success: jest.fn(), warning: jest.fn(), error: jest.fn(), info: jest.fn() };
  const fakeConnection = {
    reportSnapshot: jest.fn(),
    reportSnapshotError: jest.fn(),
    syncError: signal<unknown>(null),
    clearSyncError: jest.fn(),
  };
  const fakeDialog = { open: jest.fn(() => ({ afterClosed: () => of(null) })) };
  const fakeXlsx = { download: jest.fn() };
  const fakeQuick = { markReceivedToday: jest.fn() };
  /**
   * Integração do Mercado Livre desligada por padrão.
   *
   * Entra como dublê e não como serviço real porque o real injeta `Functions`,
   * cujo SDK toca `fetch` no import — que o jsdom desta versão não expõe. Um
   * spec que precise da integração ligada sobrescreve este provider.
   */
  const fakeMl = {
    connected: computed(() => false),
    recebiveis: computed(() => null),
    recebiveisLoaded: computed(() => false),
    faturamento: computed(() => null),
    faturamentoLoaded: computed(() => false),
    working: signal(false),
  };

  TestBed.configureTestingModule({
    providers: [
      cmp,
      DataService,
      { provide: Firestore, useValue: {} },
      { provide: AuthService, useValue: fakeAuth },
      { provide: NotifyService, useValue: fakeNotify },
      { provide: ConnectionService, useValue: fakeConnection },
      { provide: TranslateService, useValue: fakeTranslate },
      { provide: ThemeService, useValue: { isDark: () => false } },
      { provide: LanguageService, useValue: { lang: signal('pt-BR'), current: () => 'pt-BR' } },
      { provide: DialogService, useValue: fakeDialog },
      { provide: BreakpointObserver, useValue: { observe: () => of({ matches: false, breakpoints: {} }), isMatched: () => false } },
      { provide: XlsxExportService, useValue: fakeXlsx },
      { provide: QuickActionsService, useValue: fakeQuick },
      { provide: MlIntegrationService, useValue: fakeMl },
    ],
  });

  const data = TestBed.inject(DataService);
  (data as any).db.set(db);
  const component = TestBed.inject(cmp);

  return {
    component,
    data,
    fakes: { notify: fakeNotify, dialog: fakeDialog, xlsx: fakeXlsx, quick: fakeQuick },
  };
}
