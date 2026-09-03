/**
 * Estado da integração com o Mercado Livre no lado do app.
 *
 * O que importa provar aqui: o documento público `db/ml` é traduzido fielmente
 * para o estado da tela, inclusive quando falta campo ou quando o Firestore
 * devolve Timestamp em vez de Date.
 */
jest.mock('@angular/fire/firestore', () => ({
  Firestore: class Firestore {},
  doc: jest.fn((..._args: unknown[]) => ({ __doc: true, path: _args.slice(1).join('/') })),
  collection: jest.fn((..._args: unknown[]) => ({ __col: true, path: _args.slice(1).join('/') })),
  onSnapshot: jest.fn(),
}));
jest.mock('@angular/fire/functions', () => ({
  Functions: class Functions {},
  httpsCallable: jest.fn(),
}));

import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { Firestore, onSnapshot } from '@angular/fire/firestore';
import { Functions, httpsCallable } from '@angular/fire/functions';
import { MlIntegrationService } from './ml-integration.service';
import { AuthService } from './auth.service';
import { makeFakeUser } from '../../../testing/firebase-mocks';

type SnapHandler = (snap: unknown) => void;

/** Guarda o callback do onSnapshot para o teste empurrar documentos. */
let emitir: SnapHandler;

function snapshotDe(data: Record<string, unknown> | null): unknown {
  return { exists: () => data !== null, data: () => data };
}

function setup(): MlIntegrationService {
  // Três listeners são abertos: db/ml (documento) e as coleções mlItems/mlLinks.
  // Só o do documento interessa aqui; os outros recebem um snapshot vazio.
  (onSnapshot as unknown as jest.Mock).mockImplementation((ref: { __col?: boolean }, next: SnapHandler) => {
    if (ref?.__col) {
      next({ docs: [] });
      return () => undefined;
    }
    emitir = next;
    return () => undefined;
  });
  const fakeAuth = {
    currentUser: signal<ReturnType<typeof makeFakeUser> | null | undefined>(makeFakeUser()),
    refreshIdToken: jest.fn().mockResolvedValue(undefined),
  };
  TestBed.configureTestingModule({
    providers: [
      MlIntegrationService,
      { provide: Firestore, useValue: {} },
      { provide: Functions, useValue: {} },
      { provide: AuthService, useValue: fakeAuth },
    ],
  });
  const service = TestBed.inject(MlIntegrationService);
  TestBed.flushEffects();
  return service;
}

afterEach(() => {
  jest.clearAllMocks();
  TestBed.resetTestingModule();
});

describe('leitura do estado', () => {
  it('sem documento, fica desconectado', () => {
    const s = setup();
    emitir(snapshotDe(null));
    expect(s.connected()).toBe(false);
    expect(s.state()?.status).toBe('disconnected');
  });

  it('conta conectada expoe apelido e data', () => {
    const s = setup();
    emitir(
      snapshotDe({
        connected: true,
        status: 'connected',
        nickname: 'MMSTORE',
        mlUserId: 123456,
        connectedAt: { toDate: () => new Date('2026-09-03T12:00:00Z') },
      }),
    );
    expect(s.connected()).toBe(true);
    expect(s.nickname()).toBe('MMSTORE');
    expect(s.state()?.mlUserId).toBe(123456);
    expect(s.state()?.connectedAt).toEqual(new Date('2026-09-03T12:00:00Z'));
  });

  it('converte Timestamp do Firestore em Date', () => {
    const s = setup();
    emitir(
      snapshotDe({
        connected: true,
        status: 'connected',
        lastSyncAt: { toDate: () => new Date('2026-09-01T10:30:00Z') },
      }),
    );
    expect(s.state()?.lastSyncAt).toBeInstanceOf(Date);
  });

  it('tolera documento sem os campos opcionais', () => {
    const s = setup();
    emitir(snapshotDe({ connected: true, status: 'connected' }));
    expect(s.state()?.nickname).toBeNull();
    expect(s.state()?.connectedAt).toBeNull();
    expect(s.state()?.lastSyncAt).toBeNull();
  });

  it('reconhece quando precisa reconectar', () => {
    const s = setup();
    emitir(
      snapshotDe({
        connected: false,
        status: 'reconnect_required',
        lastError: 'refresh_falhou:invalid_grant',
      }),
    );
    expect(s.needsReconnect()).toBe(true);
    expect(s.connected()).toBe(false);
  });

  it('loaded so fica verdadeiro depois do primeiro documento', () => {
    const s = setup();
    expect(s.loaded()).toBe(false);
    emitir(snapshotDe(null));
    expect(s.loaded()).toBe(true);
  });
});

describe('conectar e desconectar', () => {
  it('manda a URL atual como retorno e navega para o Mercado Livre', async () => {
    const s = setup();
    const chamada = jest
      .fn()
      .mockResolvedValue({ data: { url: 'https://auth.mercadolivre.com.br/authorization?x=1' } });
    (httpsCallable as unknown as jest.Mock).mockReturnValue(chamada);
    const assign = jest.fn();
    Object.defineProperty(window, 'location', {
      value: { href: 'https://lucrato-teste.vercel.app/integracoes', assign },
      writable: true,
    });

    await s.connect();

    expect(chamada).toHaveBeenCalledWith({
      returnTo: 'https://lucrato-teste.vercel.app/integracoes',
    });
    expect(assign).toHaveBeenCalledWith('https://auth.mercadolivre.com.br/authorization?x=1');
  });

  it('nao dispara dois fluxos ao mesmo tempo', async () => {
    const s = setup();
    const chamada = jest.fn().mockResolvedValue({ data: { url: 'https://exemplo/autorizar' } });
    (httpsCallable as unknown as jest.Mock).mockReturnValue(chamada);

    await s.connect();
    await s.connect();

    expect(chamada).toHaveBeenCalledTimes(1);
  });

  it('libera o botao quando a chamada falha', async () => {
    const s = setup();
    (httpsCallable as unknown as jest.Mock).mockReturnValue(
      jest.fn().mockRejectedValue(new Error('sem rede')),
    );

    await expect(s.connect()).rejects.toThrow('sem rede');
    expect(s.working()).toBe(false);
  });

  it('desconectar chama a callable e libera o botao', async () => {
    const s = setup();
    const chamada = jest.fn().mockResolvedValue({ data: { ok: true } });
    (httpsCallable as unknown as jest.Mock).mockReturnValue(chamada);

    await s.disconnect();

    expect(httpsCallable).toHaveBeenCalledWith(expect.anything(), 'mlDisconnect');
    expect(chamada).toHaveBeenCalled();
    expect(s.working()).toBe(false);
  });
});
