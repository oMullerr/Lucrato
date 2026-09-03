import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { Firestore, collection, doc, onSnapshot } from '@angular/fire/firestore';
import type { Unsubscribe } from '@angular/fire/firestore';
import { Functions, httpsCallable } from '@angular/fire/functions';
import { AuthService } from './auth.service';
import { logError } from './logger';
import type { ItemDaCaixa } from '../ml/inbox-apply';
import type { DevolucaoDoMl } from '../ml/returns-apply';

/** Comissão de um tipo de anúncio, como o Mercado Livre informa. */
export interface ComissaoDoTipo {
  listingTypeId: string;
  /** Fração: 0.12 para 12%. */
  percentageFee: number;
  fixedFee: number;
  saleFeeAmount: number;
}

/** Resposta da consulta de mercado usada pela calculadora. */
export interface AnaliseDoMl {
  item?: {
    id: string;
    title: string;
    price: number;
    categoryId: string;
    listingTypeId: string;
    thumbnail: string;
    permalink: string;
    soldQuantity: number;
    availableQuantity: number;
    freeShipping: boolean;
    logisticType: string;
    catalogProductId: string | null;
  };
  comissoes: ComissaoDoTipo[];
  freteEstimado: number | null;
  concorrencia?: { status: string; priceToWin: number | null; precoAtual: number };
}

/** Anúncio sincronizado do Mercado Livre (`users/{uid}/mlItems`). */
export interface MlItem {
  id: string;
  title: string;
  sku: string | null;
  price: number;
  availableQuantity: number;
  soldQuantity: number;
  status: string;
  listingTypeId: string;
  permalink: string;
  thumbnail: string;
  logisticType: string;
  freeShipping: boolean;
}

/** Vínculo confirmado entre um anúncio e um produto (`users/{uid}/mlLinks`). */
export interface MlLink {
  itemId: string;
  produto: string;
  productKey: string;
}

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
  private readonly _items = signal<MlItem[] | null>(null);
  private readonly _links = signal<MlLink[] | null>(null);
  private readonly _inbox = signal<ItemDaCaixa[] | null>(null);
  private readonly _devolucoes = signal<DevolucaoDoMl[] | null>(null);
  private _unsub?: Unsubscribe;
  private _unsubItems?: Unsubscribe;
  private _unsubLinks?: Unsubscribe;
  private _unsubInbox?: Unsubscribe;
  private _unsubDevolucoes?: Unsubscribe;

  /** `null` enquanto o documento ainda não chegou. */
  readonly state = this._state.asReadonly();
  readonly loaded = computed(() => this._state() !== null);
  readonly connected = computed(() => this._state()?.connected === true);
  readonly needsReconnect = computed(() => this._state()?.status === 'reconnect_required');
  readonly nickname = computed(() => this._state()?.nickname ?? '');

  /** Anúncios sincronizados, ordenados por título. `null` antes da primeira leitura. */
  readonly items = computed(() => this._items());
  readonly itemsLoaded = computed(() => this._items() !== null);

  /** Vínculo por id de anúncio, para a tela cruzar em O(1). */
  readonly linksByItem = computed(() => {
    const mapa = new Map<string, MlLink>();
    for (const l of this._links() ?? []) mapa.set(l.itemId, l);
    return mapa;
  });

  /** Caixa de entrada inteira. `null` antes da primeira leitura. */
  readonly inbox = computed(() => this._inbox());
  readonly inboxLoaded = computed(() => this._inbox() !== null);

  /** Só o que ainda espera decisão — é o que o app tenta aplicar. */
  readonly inboxPendentes = computed(() =>
    (this._inbox() ?? []).filter(i => i.estado === 'pendente'),
  );

  /** Devoluções trazidas do Mercado Livre, ainda não registradas. */
  readonly devolucoesPendentes = computed(() =>
    (this._devolucoes() ?? []).filter(d => d.estado === 'pendente'),
  );

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
    this.watchColecoes(uid);
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

  /** Coleções escritas pelo servidor: o app só lê (ver `firestore.rules`). */
  private watchColecoes(uid: string): void {
    this._unsubItems?.();
    this._unsubItems = onSnapshot(
      collection(this.firestore, `users/${uid}/mlItems`),
      snap => {
        const itens = snap.docs.map(d => d.data() as MlItem);
        itens.sort((a, b) => (a.title ?? '').localeCompare(b.title ?? '', 'pt-BR'));
        this._items.set(itens);
      },
      err => {
        logError('[MlIntegration] mlItems falhou:', err);
        this._items.set([]);
      },
    );

    this._unsubLinks?.();
    this._unsubLinks = onSnapshot(
      collection(this.firestore, `users/${uid}/mlLinks`),
      snap => this._links.set(snap.docs.map(d => d.data() as MlLink)),
      err => {
        logError('[MlIntegration] mlLinks falhou:', err);
        this._links.set([]);
      },
    );

    this._unsubInbox?.();
    this._unsubInbox = onSnapshot(
      collection(this.firestore, `users/${uid}/mlInbox`),
      snap => this._inbox.set(snap.docs.map(d => d.data() as ItemDaCaixa)),
      err => {
        logError('[MlIntegration] mlInbox falhou:', err);
        this._inbox.set([]);
      },
    );

    this._unsubDevolucoes?.();
    this._unsubDevolucoes = onSnapshot(
      collection(this.firestore, `users/${uid}/mlReturns`),
      snap => this._devolucoes.set(snap.docs.map(d => d.data() as DevolucaoDoMl)),
      err => {
        logError('[MlIntegration] mlReturns falhou:', err);
        this._devolucoes.set([]);
      },
    );
  }

  private stop(): void {
    this._unsub?.();
    this._unsubItems?.();
    this._unsubLinks?.();
    this._unsubInbox?.();
    this._unsubDevolucoes?.();
    this._unsub = undefined;
    this._unsubItems = undefined;
    this._unsubLinks = undefined;
    this._unsubInbox = undefined;
    this._unsubDevolucoes = undefined;
    this._state.set(null);
    this._items.set(null);
    this._links.set(null);
    this._inbox.set(null);
    this._devolucoes.set(null);
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

  /**
   * Puxa a lista de anúncios do Mercado Livre.
   *
   * Pode demorar em contas grandes: o servidor pagina com scroll e busca os
   * detalhes em blocos. Devolve quantos anúncios vieram.
   */
  async syncItems(): Promise<number> {
    if (this.working()) return 0;
    this.working.set(true);
    try {
      const chamar = httpsCallable<void, { total: number }>(this.functions, 'mlSyncItems');
      const { data } = await chamar();
      return data.total;
    } finally {
      this.working.set(false);
    }
  }

  /**
   * Confirma vínculos anúncio → produto. Produto vazio desfaz o vínculo.
   * A chave é normalizada no servidor, pelo mesmo módulo que a tela usa.
   */
  async setLinks(links: readonly { itemId: string; produto: string }[]): Promise<void> {
    if (links.length === 0) return;
    const chamar = httpsCallable<
      { links: readonly { itemId: string; produto: string }[] },
      { vinculados: number; desfeitos: number }
    >(this.functions, 'mlSetLinks');
    await chamar({ links });
  }

  /**
   * Importa o histórico que o Mercado Livre ainda entrega (até 12 meses).
   *
   * Tudo cai na caixa de entrada, nunca direto no razão: o que parece já ter
   * sido digitado à mão espera a sua decisão.
   */
  async backfill(meses = 12): Promise<number> {
    if (this.working()) return 0;
    this.working.set(true);
    try {
      const chamar = httpsCallable<{ meses: number }, { total: number }>(
        this.functions,
        'mlBackfill',
      );
      const { data } = await chamar({ meses });
      return data.total;
    } finally {
      this.working.set(false);
    }
  }

  /**
   * Avisa o servidor o que aconteceu com itens da caixa.
   *
   * O documento da caixa é só do servidor: assim o navegador não consegue
   * marcar como aplicado algo que nunca entrou no razão.
   */
  async markInbox(externalIds: readonly string[], estado: 'aplicado' | 'ignorado' | 'pendente'): Promise<void> {
    if (externalIds.length === 0) return;
    const chamar = httpsCallable<
      { externalIds: readonly string[]; estado: string },
      { total: number }
    >(this.functions, 'mlMarkInbox');
    await chamar({ externalIds, estado });
  }

  /**
   * Consulta o Mercado Livre para a calculadora: comissão real da categoria,
   * frete estimado e situação na disputa do catálogo.
   */
  async analisar(item: string): Promise<AnaliseDoMl> {
    const chamar = httpsCallable<{ item: string }, AnaliseDoMl>(this.functions, 'mlAnalyze');
    const { data } = await chamar({ item });
    return data;
  }

  /** Marca devoluções já registradas no razão. */
  async markReturns(claimIds: readonly string[], estado: 'aplicado' | 'ignorado'): Promise<void> {
    if (claimIds.length === 0) return;
    const chamar = httpsCallable<
      { claimIds: readonly string[]; estado: string },
      { total: number }
    >(this.functions, 'mlMarkReturns');
    await chamar({ claimIds, estado });
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
