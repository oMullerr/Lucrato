/**
 * Interruptor do lançamento automático.
 *
 * A configuração `mlAutoApply` existia desde a integração — o serviço a
 * respeitava, o padrão era ligado — mas nenhuma tela permitia mexer. O
 * comportamento mais consequente do app (escrever no razão sozinho) era
 * invisível e inegociável.
 *
 * O que estes testes protegem não é o widget: é a FONTE ÚNICA. Antes havia duas
 * leituras da mesma configuração, uma na tela e outra no serviço; a que
 * discordasse discordaria em silêncio, e seria justamente a que decide se o app
 * escreve. Por isso os dois lados leem `DataService.mlAutoApply`, e há um teste
 * cravando que a ausência do campo significa LIGADO — bases criadas antes da
 * integração não têm a chave, e um `?? false` aqui desligaria a automação de
 * todo mundo sem uma linha de aviso.
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
import { computed, signal } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { Firestore } from '@angular/fire/firestore';
import { IntegrationsComponent } from './integrations.component';
import { DataService } from '../../core/services/data.service';
import { AuthService } from '../../core/services/auth.service';
import { NotifyService } from '../../core/services/notify.service';
import { ConnectionService } from '../../core/services/connection.service';
import { MlIntegrationService } from '../../core/services/ml-integration.service';
import { DialogService } from '../../shared/ui/dialog/dialog.service';
import { Database } from '../../core/models/models';
import { makeFakeDatabase } from '../../../testing/firebase-mocks';

const fakeTranslate = { instant: (key: string) => key } as unknown as TranslateService;

interface Montagem {
  component: IntegrationsComponent;
  data: DataService;
  notify: { success: jest.Mock; error: jest.Mock; warning: jest.Mock; info: jest.Mock };
}

function montar(settingsExtra: Record<string, unknown> = {}): Montagem {
  const db = makeFakeDatabase() as Database;
  db.settings = { ...db.settings, ...settingsExtra } as Database['settings'];

  const notify = { success: jest.fn(), error: jest.fn(), warning: jest.fn(), info: jest.fn() };

  TestBed.configureTestingModule({
    providers: [
      IntegrationsComponent,
      DataService,
      { provide: Firestore, useValue: {} },
      {
        provide: AuthService,
        useValue: {
          currentUser: signal({ uid: 'u1' }),
          refreshIdToken: jest.fn().mockResolvedValue(undefined),
        },
      },
      { provide: NotifyService, useValue: notify },
      {
        provide: ConnectionService,
        useValue: {
          reportSnapshot: jest.fn(),
          reportSnapshotError: jest.fn(),
          syncError: signal(null),
          clearSyncError: jest.fn(),
        },
      },
      { provide: TranslateService, useValue: fakeTranslate },
      { provide: DialogService, useValue: { open: jest.fn() } },
      {
        provide: MlIntegrationService,
        useValue: {
          state: computed(() => ({ connected: true, status: 'connected' })),
          loaded: computed(() => true),
          connected: computed(() => true),
          needsReconnect: computed(() => false),
          nickname: computed(() => 'loja-teste'),
          working: signal(false),
        },
      },
    ],
  });

  const data = TestBed.inject(DataService);
  (data as any).db.set(db);
  return { component: TestBed.inject(IntegrationsComponent), data, notify };
}

afterEach(() => TestBed.resetTestingModule());

describe('lançamento automático', () => {
  it('base sem a chave conta como LIGADO', () => {
    // Bases anteriores à integração não têm `mlAutoApply`. Tratá-las como
    // desligadas pararia a automação de quem nunca pediu para parar.
    const { data } = montar();
    expect(data.settings()?.mlAutoApply).toBeUndefined();
    expect(data.mlAutoApply()).toBe(true);
  });

  it('respeita o desligado explícito', () => {
    const { data } = montar({ mlAutoApply: false });
    expect(data.mlAutoApply()).toBe(false);
  });

  it('desligar grava e a tela passa a refletir na hora', async () => {
    const { component, data, notify } = montar();
    const gravar = jest
      .spyOn(data, 'setMlAutoApply')
      .mockImplementation(async (on: boolean) => {
        const atual = (data as any).db();
        (data as any).db.set({ ...atual, settings: { ...atual.settings, mlAutoApply: on } });
      });

    await (component as any).alternarAutoApply(false);

    expect(gravar).toHaveBeenCalledWith(false);
    expect(data.mlAutoApply()).toBe(false);
    expect(notify.success).toHaveBeenCalledWith('integrations.autoApplyOff');
  });

  it('ligar de volta avisa com a mensagem do outro estado', async () => {
    const { component, data, notify } = montar({ mlAutoApply: false });
    jest.spyOn(data, 'setMlAutoApply').mockResolvedValue(undefined);

    await (component as any).alternarAutoApply(true);

    expect(notify.success).toHaveBeenCalledWith('integrations.autoApplyOn');
  });

  it('falha ao gravar não anuncia sucesso', async () => {
    // O DataService já faz rollback e notifica o erro; a tela não pode
    // acrescentar um "pronto!" por cima de uma gravação que não aconteceu.
    const { component, data, notify } = montar();
    jest.spyOn(data, 'setMlAutoApply').mockRejectedValue(new Error('offline'));

    await (component as any).alternarAutoApply(false);

    expect(notify.success).not.toHaveBeenCalled();
    expect((component as any).salvandoAutoApply()).toBe(false);
  });

  it('não dispara duas gravações ao mesmo tempo', async () => {
    const { component, data } = montar();
    let liberar: () => void = () => {};
    const gravar = jest
      .spyOn(data, 'setMlAutoApply')
      .mockImplementation(() => new Promise<void>((r) => { liberar = r; }));

    const primeira = (component as any).alternarAutoApply(false);
    // Segunda chamada enquanto a primeira não voltou: precisa ser ignorada.
    await (component as any).alternarAutoApply(true);
    expect(gravar).toHaveBeenCalledTimes(1);

    liberar();
    await primeira;
  });
});
