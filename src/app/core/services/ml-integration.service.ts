import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { Firestore, doc, onSnapshot } from '@angular/fire/firestore';
import type { Unsubscribe } from '@angular/fire/firestore';
import { Functions, httpsCallable } from '@angular/fire/functions';
import { AuthService } from './auth.service';
import { logError } from './logger';

/** Estado da conexão, espelhado pelo servidor em `users/{uid}/db/ml`. */
export type MlStatus = 'disconnected' | 'connected' | 'reconnect_required';

export interface MlIntegrationState {
  connected: boolean;
  status: MlStatus;
  /** Apelido da conta no Mercado Livre, para você saber qual está ligada. */
  nickname: string | null;
  mlUserId: number | null;
  connectedAt: Date | null;
  lastSyncAt: Date | null;
  lastError: string | null;
}

const DESCONECTADO: MlIntegrationState = {
  connected: false,
  status: 'disconnected',
  nickname: null,
  mlUserId: null,
  connectedAt: null,
  lastSyncAt: null,
  lastError: null,
};

/** Firestore devolve Timestamp; o resto do app trabalha com Date. */
function toDate(valor: unknown): Date | null {
  if (!valor) return null;
  if (valor instanceof Date) return valor;
  const ts = valor as { toDate?: () => Date };
  return typeof ts.toDate === 'function' ? ts.toDate() : null;
}

/**
 * Integração com o Mercado Livre, lado do app.
 *
 * O documento `db/ml` é somente leitura para o navegador (ver `firestore.rules`):
 * quem escreve é o servidor. Conectar e desconectar passam por callables, e os
 * tokens nunca chegam aqui — ficam em `users/{uid}/secret/ml`, inacessível ao
 * cliente.
 */
@Injectable({ providedIn: 'root' })
export class MlIntegrationService {
  private readonly firestore = inject(Firestore);
  private readonly functions = inject(Functions);
  private readonly auth = inject(AuthService);

  private readonly _state = signal<MlIntegrationState | null>(null);
  private _unsub?: Unsubscribe;

  /** `null` enquanto o documento ainda não chegou. */
  readonly state = this._state.asReadonly();
  readonly loaded = computed(() => this._state() !== null);
  readonly connected = computed(() => this._state()?.connected === true);
  readonly needsReconnect = computed(() => this._state()?.status === 'reconnect_required');
  readonly nickname = computed(() => this._state()?.nickname ?? '');

  /** Em andamento: trava o botão e evita disparar dois fluxos ao mesmo tempo. */
  readonly working = signal(false);

  constructor() {
    effect(() => {
      const u = this.auth.currentUser();
      if (u?.uid) {
        this.watch(u.uid);
      } else if (u === null) {
        this.stop();
      }
    }, { allowSignalWrites: true });
  }

  private watch(uid: string): void {
    this._unsub?.();
    this._unsub = onSnapshot(
      doc(this.firestore, `users/${uid}/db/ml`),
      snap => {
        if (!snap.exists()) {
          this._state.set(DESCONECTADO);
          return;
        }
        const d = snap.data();
        this._state.set({
          connected: d['connected'] === true,
          status: (d['status'] as MlStatus) ?? 'disconnected',
          nickname: (d['nickname'] as string) ?? null,
          mlUserId: (d['mlUserId'] as number) ?? null,
          connectedAt: toDate(d['connectedAt']),
          lastSyncAt: toDate(d['lastSyncAt']),
          lastError: (d['lastError'] as string) ?? null,
        });
      },
      err => {
        logError('[MlIntegration] onSnapshot falhou:', err);
        this._state.set(DESCONECTADO);
      },
    );
  }

  private stop(): void {
    this._unsub?.();
    this._unsub = undefined;
    this._state.set(null);
  }

  /**
   * Leva o vendedor para a tela de autorização do Mercado Livre.
   *
   * O `returnTo` é validado no servidor contra uma lista de destinos — não dá
   * para transformar o callback em redirecionador aberto.
   */
  async connect(): Promise<void> {
    if (this.working()) return;
    this.working.set(true);
    try {
      const chamar = httpsCallable<{ returnTo: string }, { url: string }>(
        this.functions,
        'mlAuthUrl',
      );
      const { data } = await chamar({ returnTo: window.location.href });
      window.location.assign(data.url);
    } catch (err) {
      this.working.set(false);
      throw err;
    }
  }

  /** Apaga tokens e índice no servidor. Não mexe em nada já importado. */
  async disconnect(): Promise<void> {
    if (this.working()) return;
    this.working.set(true);
    try {
      await httpsCallable<void, { ok: true }>(this.functions, 'mlDisconnect')();
    } finally {
      this.working.set(false);
    }
  }
}
