import { Injectable, computed, effect, inject, signal } from '@angular/core';
import {
  Firestore, collection, doc, onSnapshot, setDoc, deleteField, writeBatch,
} from '@angular/fire/firestore';
import type { Unsubscribe } from '@angular/fire/firestore';
import { TranslateService } from '@ngx-translate/core';
import { APP, DEFAULT_CATEGORY_COLOR } from '../constants/app.constants';
import {
  Purchase, Sale, Settings, Database, SaleChannel, SaleStatus, Return,
  SCHEMA_SUBCOLECOES,
} from '../models/models';
import { calculatePurchase, calculateKpis, calculateSale, computeReturn, nextId } from './calculations';
import { computeFiscalStatus } from '../fiscal/fiscal';
import { ItemDaCaixa, PlanoDeAplicacao, planejarAplicacao } from '../ml/inbox-apply';
import { adotarNumerosDoMl } from '../ml/reconcile';
import { DevolucaoDoMl, PlanoDeDevolucoes, planejarDevolucoes } from '../ml/returns-apply';
import { DEFAULT_FISCAL_CONFIG } from '../fiscal/fiscal-regimes';
import { FiscalConfig } from '../fiscal/fiscal.model';
import { AuthService } from './auth.service';
import { NotifyService } from './notify.service';
import { ConnectionService } from './connection.service';
import { firestoreErrorMessage } from './firestore-errors';
import { logError } from './logger';
import { comPrazo } from './com-prazo';

const RETRY_DELAYS_MS = [1000, 2000, 4000, 8000, 16000, 30000];

/** Prazo da renovação do token antes de assinar. Generoso: só existe para
    impedir espera infinita, não para apertar rede lenta. */
const TOKEN_REFRESH_TIMEOUT_MS = 10_000;

@Injectable({ providedIn: 'root' })
export class DataService {
  private readonly firestore = inject(Firestore);
  private readonly auth = inject(AuthService);
  private readonly notify = inject(NotifyService);
  private readonly connection = inject(ConnectionService);
  private readonly t = inject(TranslateService);

  private readonly db = signal<Database | null>(null);
  private _unsub?: Unsubscribe;
  private _unsubColecoes: Unsubscribe[] = [];
  private _retryTimer?: ReturnType<typeof setTimeout>;
  private _retryAttempt = 0;
  private _warnedFirstOffline = false;

  /**
   * Formato do armazenamento em uso. Ausente ⇒ 1 (documento único).
   *
   * É o que decide de onde os arrays vêm e para onde as gravações vão. A leitura
   * suporta os dois ao mesmo tempo de propósito: a migração é aditiva, e uma
   * base sem migrar precisa continuar funcionando sem nenhuma ação do dono.
   */
  readonly schema = computed(() => this.db()?.metadata?.schema ?? 1);
  readonly emSubcolecoes = computed(() => this.schema() >= SCHEMA_SUBCOLECOES);

  readonly loaded = computed(() => this.db() !== null);
  readonly purchases = computed(() => this.db()?.purchases ?? []);
  readonly sales = computed(() => this.db()?.sales ?? []);
  readonly returns = computed(() => this.db()?.returns ?? []);
  readonly settings = computed(() => this.db()?.settings ?? null);

  readonly computedPurchases = computed(() => {
    const cfg = this.settings();
    if (!cfg) return [];
    return this.purchases().map(c => calculatePurchase(c, this.sales(), cfg, this.returns()));
  });

  readonly computedSales = computed(() =>
    this.sales().map(v => calculateSale(v, this.purchases(), this.returns()))
  );

  readonly computedReturns = computed(() =>
    this.returns().map(r => computeReturn(r, this.sales(), this.purchases()))
  );

  readonly kpis = computed(() =>
    calculateKpis(this.computedPurchases(), this.computedSales())
  );

  /** Config do regime tributário, com fallback para o padrão (MEI). */
  readonly fiscalConfig = computed<FiscalConfig>(() => this.settings()?.fiscal ?? DEFAULT_FISCAL_CONFIG);

  /** Status fiscal do ano corrente — útil para banners/resumos fora da página fiscal. */
  readonly fiscalStatus = computed(() =>
    computeFiscalStatus(this.fiscalConfig(), this.computedSales(), new Date().getUTCFullYear())
  );

  /** Competências do DAS marcadas como pagas ('YYYY-MM'). */
  readonly dasPaidMonths = computed<string[]>(() => this.settings()?.dasPaidMonths ?? []);

  /** Anos-base com DASN-SIMEI entregue. */
  readonly dasnDeclaredYears = computed<number[]>(() => this.settings()?.dasnDeclaredYears ?? []);

  /**
   * Lançamento automático das vendas do ML ligado? Ausente ⇒ ligado.
   *
   * Mesma leitura que o `MlAutoApplyService` faz para decidir se roda — uma
   * fonte só, para a tela nunca mostrar um estado que o serviço não respeita.
   */
  readonly mlAutoApply = computed(() => this.settings()?.mlAutoApply !== false);

  constructor() {
    effect(() => {
      const u = this.auth.currentUser();
      if (u) {
        this.startSync(u.uid).catch(err =>
          logError('[DataService] startSync falhou:', err),
        );
      } else if (u === null) {
        this.stopSync();
      }
    }, { allowSignalWrites: true });
  }

  private async startSync(uid: string): Promise<void> {
    this.cancelRetry();
    this.pararColecoes();
    await this.renovarTokenSemTravar();
    /* Só agora derruba a assinatura anterior. Derrubar ANTES do await deixava o
       app sem a antiga e sem a nova enquanto o await não voltasse. */
    this._unsub?.();
    const ref = doc(this.firestore, `users/${uid}/db/main`);
    this._unsub = onSnapshot(
      ref,
      { includeMetadataChanges: true },
      snap => {
        this.connection.reportSnapshot(snap.metadata);
        if (this.connection.syncError()) {
          this.connection.clearSyncError();
          this.notify.success(this.t.instant('notify.syncRestored'));
        }
        this._retryAttempt = 0;

        if (snap.exists()) {
          const vindo = this.migrateDatabase(snap.data());
          /* No schema 2 os arrays deste documento não valem mais — quem manda
             são as subcoleções. Preservar o que já chegou delas evita o
             piscar: sem isto, cada gravação de `settings` zeraria a tela até
             o snapshot das coleções voltar. */
          const atual = this.db();
          this.db.set(
            vindo.metadata.schema === SCHEMA_SUBCOLECOES && atual
              ? { ...vindo, purchases: atual.purchases, sales: atual.sales, returns: atual.returns }
              : vindo,
          );
          this.assinarColecoes(uid, vindo.metadata.schema === SCHEMA_SUBCOLECOES);
        } else if (snap.metadata.fromCache) {
          if (this.db() === null) {
            this.db.set(this.createEmpty());
            if (!this._warnedFirstOffline) {
              this._warnedFirstOffline = true;
              this.notify.warning(this.t.instant('notify.offlineData'));
            }
          }
        } else {
          const empty = this.createEmpty();
          this.db.set(empty);
          setDoc(ref, empty).catch(err => {
            logError('[Firestore] Falha ao criar documento inicial:', err);
            this.connection.reportSnapshotError(err);
            this.notify.warning(this.t.instant('notify.initialDbFailed'));
          });
        }
      },
      err => {
        logError('[Firestore] onSnapshot falhou:', err);
        this.connection.reportSnapshotError(err);
        this.notify.error(this.t.instant(firestoreErrorMessage(err)));
        this.scheduleRetry(uid);
      },
    );
  }

  /**
   * Renova o token antes de assinar, mas nunca às custas da assinatura.
   *
   * O refresh existe para o token trazer um `email_verified` fresco, de que as
   * rules dependem — é um empurrão, não um pré-requisito. Em 16/09/2026 ele
   * virou pré-requisito na prática: o App Check não entregava token (o CSP
   * bloqueava o reCAPTCHA), o `await` ficou pendurado para sempre e o
   * `onSnapshot` nunca chegou a ser registrado. Resultado: app em pé, zero
   * dado, nenhum retry e nenhum aviso, porque `logError` é mudo em produção.
   *
   * Assinar com um token velho é sempre melhor que não assinar: se as rules
   * recusarem, o callback de erro do `onSnapshot` dispara e o `scheduleRetry`
   * assume. Um await pendurado não tem plano B nenhum.
   */
  private async renovarTokenSemTravar(): Promise<void> {
    try {
      await comPrazo(this.auth.refreshIdToken(), TOKEN_REFRESH_TIMEOUT_MS);
    } catch (err) {
      logError('[DataService] renovação do token falhou ou estourou o prazo; assinando assim mesmo:', err);
    }
  }

  /**
   * Assina as subcoleções do razão.
   *
   * Só depois de saber o schema: assinar antes gastaria três leituras por
   * sessão em toda base que ainda não migrou. Idempotente — o documento
   * principal chega várias vezes por sessão e não pode reassinar a cada vez.
   */
  private assinarColecoes(uid: string, ligado: boolean): void {
    if (!ligado || this._unsubColecoes.length > 0) return;

    const assinar = <T extends { id: string }>(
      nome: 'purchases' | 'sales' | 'returns',
    ) => onSnapshot(
      collection(this.firestore, `users/${uid}/${nome}`),
      snap => {
        const itens = snap.docs.map(d => d.data() as T);
        const atual = this.db();
        if (atual) this.db.set({ ...atual, [nome]: itens });
      },
      err => {
        logError(`[DataService] ${nome} falhou:`, err);
        this.connection.reportSnapshotError(err);
      },
    );

    this._unsubColecoes = [
      assinar<Purchase>('purchases'),
      assinar<Sale>('sales'),
      assinar<Return>('returns'),
    ];
  }

  private pararColecoes(): void {
    for (const u of this._unsubColecoes) u();
    this._unsubColecoes = [];
  }

  private scheduleRetry(uid: string): void {
    this.cancelRetry();
    const delay = RETRY_DELAYS_MS[Math.min(this._retryAttempt, RETRY_DELAYS_MS.length - 1)];
    this._retryAttempt += 1;
    this._retryTimer = setTimeout(() => {
      this._retryTimer = undefined;
      this.startSync(uid).catch(err => logError('[DataService] retry startSync falhou:', err));
    }, delay);
  }

  private cancelRetry(): void {
    if (this._retryTimer) {
      clearTimeout(this._retryTimer);
      this._retryTimer = undefined;
    }
  }

  private stopSync(): void {
    this.cancelRetry();
    this.pararColecoes();
    this._unsub?.();
    this._unsub = undefined;
    this._retryAttempt = 0;
    this._warnedFirstOffline = false;
    this.db.set(null);
  }

  private persist(prev?: Database): Promise<void> {
    const uid = this.auth.currentUser()?.uid;
    if (!uid) return Promise.resolve();
    const current = this.db();
    if (!current) return Promise.resolve();

    const gravar = this.emSubcolecoes()
      ? this.persistirEmSubcolecoes(uid, prev, current)
      : this.persistirNoDocumentoUnico(uid, current);

    return gravar.catch(err => {
      logError('[Firestore] Falha ao salvar:', err);
      this.notify.error(this.t.instant(firestoreErrorMessage(err)));
      throw err;
    });
  }

  /** Formato original: a base inteira volta ao documento a cada alteração. */
  private persistirNoDocumentoUnico(uid: string, atual: Database): Promise<void> {
    return setDoc(
      doc(this.firestore, `users/${uid}/db/main`),
      {
        purchases: JSON.parse(JSON.stringify(atual.purchases)),
        sales: JSON.parse(JSON.stringify(atual.sales)),
        returns: JSON.parse(JSON.stringify(atual.returns)),
        metadata: {
          versao: atual.metadata.versao,
          ultimaAtualizacao: new Date().toISOString(),
        },
      },
      { merge: true },
    );
  }

  /**
   * Schema 2: grava SÓ o que mudou.
   *
   * Antes, marcar um DAS como pago reescrevia as compras, as vendas e as
   * devoluções inteiras. Além do custo, era isso que impedia a Cloud Function
   * de escrever no razão: a próxima gravação do navegador apagaria o que ela
   * tivesse posto, em silêncio.
   *
   * Sem `prev` (chamada fora do fluxo de `update`), grava tudo — mais caro,
   * mas nunca errado.
   */
  private async persistirEmSubcolecoes(
    uid: string,
    prev: Database | undefined,
    atual: Database,
  ): Promise<void> {
    const ops: { ref: ReturnType<typeof doc>; dados?: unknown }[] = [];

    const diff = <T extends { id: string }>(nome: string, antes: readonly T[], depois: readonly T[]) => {
      const anteriores = new Map(antes.map(i => [i.id, JSON.stringify(i)]));
      const atuais = new Set(depois.map(i => i.id));
      for (const item of depois) {
        // `JSON.stringify` como comparação é barato e suficiente: os registros
        // são objetos planos, criados sempre pelo mesmo caminho.
        if (anteriores.get(item.id) === JSON.stringify(item)) continue;
        ops.push({
          ref: doc(this.firestore, `users/${uid}/${nome}/${item.id}`),
          dados: JSON.parse(JSON.stringify(item)),
        });
      }
      for (const id of anteriores.keys()) {
        if (!atuais.has(id)) ops.push({ ref: doc(this.firestore, `users/${uid}/${nome}/${id}`) });
      }
    };

    diff('purchases', prev?.purchases ?? [], atual.purchases);
    diff('sales', prev?.sales ?? [], atual.sales);
    diff('returns', prev?.returns ?? [], atual.returns);

    // O Firestore aceita 500 operações por lote; a importação em massa passa.
    for (let i = 0; i < ops.length; i += 400) {
      const lote = writeBatch(this.firestore);
      for (const op of ops.slice(i, i + 400)) {
        if (op.dados === undefined) lote.delete(op.ref);
        else lote.set(op.ref, op.dados as Record<string, unknown>);
      }
      await lote.commit();
    }

    await setDoc(
      doc(this.firestore, `users/${uid}/db/main`),
      {
        metadata: {
          versao: atual.metadata.versao,
          schema: SCHEMA_SUBCOLECOES,
          ultimaAtualizacao: new Date().toISOString(),
        },
      },
      { merge: true },
    );
  }

  async reset(): Promise<void> {
    const uid = this.auth.currentUser()?.uid;
    if (!uid) return;
    const prev = this.db();
    const zeroed: Database = {
      purchases: [],
      sales: [],
      returns: [],
      settings: {
        defaultMlFee: 0,
        yellowAlertDays: 0,
        redAlertDays: 0,
        minimumMargin: 0,
        lowStockAlert: 0,
        defaultShipping: 0,
        // Mantém o padrão em vez de zerar: validate() exige >= 1 e um 0 travaria
        // o próximo save da tela de Configurações.
        returnWindowDays: 30,
        defaultChannel: '' as SaleChannel,
        categories: [],
        categoryColors: {},
        suppliers: [],
        supplierColors: {},
        channels: [],
        channelColors: {},
      },
      metadata: { versao: APP.version, ultimaAtualizacao: new Date().toISOString() },
    };
    this.db.set(zeroed);
    try {
      await setDoc(doc(this.firestore, `users/${uid}/db/main`), zeroed);
    } catch (err) {
      logError('[Firestore] Falha ao zerar dados:', err);
      this.db.set(prev);
      this.notify.error(this.t.instant(firestoreErrorMessage(err)));
      throw err;
    }
  }

  nextPurchaseId(): string {
    return nextId(this.purchases().map(c => c.id), 'C');
  }

  findPurchase(id: string): Purchase | undefined {
    return this.purchases().find(c => c.id === id);
  }

  /** Cor (hex) de uma categoria/fornecedor/canal pelo nome; cai na cor padrão quando não há cor cadastrada. */
  entityColor(kind: 'category' | 'supplier' | 'channel', name: string): string {
    const s = this.settings();
    const map = kind === 'supplier' ? s?.supplierColors
              : kind === 'channel'  ? s?.channelColors
              :                       s?.categoryColors;
    return map?.[name] ?? DEFAULT_CATEGORY_COLOR;
  }

  /**
   * Persiste a config do regime tributário em `settings.fiscal` (merge aninhado, mesmo
   * padrão do SettingsComponent). Aplica update otimista e faz rollback em caso de falha.
   */
  async updateFiscalConfig(cfg: FiscalConfig): Promise<void> {
    const uid = this.auth.currentUser()?.uid;
    if (!uid) return;
    const current = this.db();
    if (current) {
      // Normaliza: omite a chave quando não há data (evita carregar `undefined` no signal).
      const localFiscal: FiscalConfig = cfg.regimeStartDate
        ? cfg
        : { regime: cfg.regime, activity: cfg.activity };
      this.db.set({ ...current, settings: { ...current.settings, fiscal: localFiscal } });
    }
    // Firestore rejeita `undefined`; ao limpar a data, removemos o campo com deleteField().
    const fiscalPayload = {
      regime: cfg.regime,
      activity: cfg.activity,
      regimeStartDate: cfg.regimeStartDate ? cfg.regimeStartDate : deleteField(),
    };
    try {
      await setDoc(
        doc(this.firestore, `users/${uid}/db/main`),
        { settings: { fiscal: fiscalPayload } },
        { merge: true },
      );
    } catch (err) {
      logError('[Firestore] Falha ao salvar config fiscal:', err);
      if (current) this.db.set(current);
      this.notify.error(this.t.instant(firestoreErrorMessage(err)));
      throw err;
    }
  }

  /** Merge otimista de campos simples de `settings` (arrays/valores), com rollback em falha. */
  private async mergeSettings(patch: Partial<Settings>): Promise<void> {
    const uid = this.auth.currentUser()?.uid;
    if (!uid) return;
    const current = this.db();
    if (current) {
      this.db.set({ ...current, settings: { ...current.settings, ...patch } });
    }
    try {
      await setDoc(doc(this.firestore, `users/${uid}/db/main`), { settings: patch }, { merge: true });
    } catch (err) {
      logError('[Firestore] Falha ao salvar settings:', err);
      if (current) this.db.set(current);
      this.notify.error(this.t.instant(firestoreErrorMessage(err)));
      throw err;
    }
  }

  /** Marca/desmarca o DAS de uma competência ('YYYY-MM') como pago. */
  async setDasPaid(periodKey: string, paid: boolean): Promise<void> {
    const set = new Set(this.dasPaidMonths());
    if (paid) set.add(periodKey); else set.delete(periodKey);
    await this.mergeSettings({ dasPaidMonths: [...set].sort() });
  }

  /** Marca/desmarca a DASN-SIMEI de um ano-base como entregue. */
  async setDasnDeclared(baseYear: number, declared: boolean): Promise<void> {
    const set = new Set(this.dasnDeclaredYears());
    if (declared) set.add(baseYear); else set.delete(baseYear);
    await this.mergeSettings({ dasnDeclaredYears: [...set].sort((a, b) => a - b) });
  }

  /**
   * Liga ou desliga o lançamento automático das vendas do Mercado Livre.
   *
   * A configuração existia desde a integração, com o serviço respeitando-a e o
   * padrão em `true` — mas nenhuma tela permitia mexer. O comportamento mais
   * consequente do app (escrever no razão sozinho) era invisível e inegociável.
   */
  async setMlAutoApply(on: boolean): Promise<void> {
    await this.mergeSettings({ mlAutoApply: on });
  }

  /**
   * Devolve `id` se estiver livre, ou o próximo número livre do espaço.
   *
   * O número é escolhido quando o formulário ABRE, não quando você salva. Entre
   * uma coisa e outra passam minutos, e desde que a Cloud Function lança no
   * razão sozinha existe um segundo escritor: se ela gravar V102 enquanto o seu
   * formulário está aberto com V102, salvar sobrescreveria a venda dela — sem
   * erro, sem aviso, sem linha na tela. O mesmo valia para duas abas suas.
   *
   * Aqui a verificação é contra o retrato VIVO da base, dentro da mutação, a
   * milissegundos da gravação. Do outro lado o servidor usa `create`, que falha
   * se o documento já existe — nenhum dos dois consegue apagar o outro.
   */
  private idLivre<T extends { id: string }>(
    existentes: readonly T[],
    id: string,
    prefixo: string,
  ): string {
    return existentes.some(i => i.id === id)
      ? nextId(existentes.map(i => i.id), prefixo)
      : id;
  }

  addPurchase(purchase: Purchase): void {
    this.update(d => {
      d.purchases.push({ ...purchase, id: this.idLivre(d.purchases, purchase.id, 'C') });
    });
  }

  updatePurchase(id: string, data: Partial<Purchase>): void {
    this.update(d => {
      const idx = d.purchases.findIndex(c => c.id === id);
      if (idx !== -1) d.purchases[idx] = { ...d.purchases[idx]!, ...data };
    });
  }

  removePurchase(id: string): void {
    this.update(d => { d.purchases = d.purchases.filter(c => c.id !== id); });
  }

  removePurchaseWithSales(purchaseId: string): void {
    this.update(d => {
      // Coleta os ids ANTES de filtrar — as devoluções apontam para a venda,
      // não para o lote, então sem isso elas virariam órfãs permanentes.
      const removedSaleIds = new Set(
        d.sales.filter(v => v.batchId === purchaseId).map(v => v.id),
      );
      d.purchases = d.purchases.filter(c => c.id !== purchaseId);
      d.sales     = d.sales.filter(v => v.batchId !== purchaseId);
      d.returns   = d.returns.filter(r => !removedSaleIds.has(r.saleId));
    });
  }

  nextSaleId(): string {
    return nextId(this.sales().map(v => v.id), 'V');
  }

  findSale(id: string): Sale | undefined {
    return this.sales().find(v => v.id === id);
  }

  addSale(sale: Sale): void {
    this.update(d => { d.sales.push({ ...sale, id: this.idLivre(d.sales, sale.id, 'V') }); });
  }

  updateSale(id: string, data: Partial<Sale>): void {
    this.update(d => {
      const idx = d.sales.findIndex(v => v.id === id);
      if (idx !== -1) d.sales[idx] = { ...d.sales[idx]!, ...data };
    });
  }

  removeSale(id: string): void {
    this.update(d => {
      d.sales = d.sales.filter(v => v.id !== id);
      d.returns = d.returns.filter(r => r.saleId !== id);
    });
  }

  /**
   * Restaura uma venda junto com as devoluções que a cascata apagou.
   * Numa única mutação para que o undo seja atômico (um persist, um rollback).
   */
  restoreSale(sale: Sale, returns: Return[] = []): void {
    this.update(d => {
      d.sales.push({ ...sale });
      if (returns.length) d.returns.push(...returns.map(r => ({ ...r })));
      this.syncSaleStatus(d, sale.id);
    });
  }

  async bulkImport(purchases: Purchase[], sales: Sale[]): Promise<void> {
    if (purchases.length === 0 && sales.length === 0) return;
    await this.update(d => {
      if (purchases.length) d.purchases.push(...purchases);
      if (sales.length) d.sales.push(...sales);
    });
  }

  /* ─────────────────────────── Devoluções ─────────────────────────── */

  nextReturnId(): string {
    return nextId(this.returns().map(r => r.id), 'D');
  }

  findReturn(id: string): Return | undefined {
    return this.returns().find(r => r.id === id);
  }

  /** Devoluções ligadas a uma venda (todos os status). */
  returnsForSale(saleId: string): Return[] {
    return this.returns().filter(r => r.saleId === saleId);
  }

  addReturn(ret: Return): void {
    this.update(d => {
      d.returns.push({ ...ret, id: this.idLivre(d.returns, ret.id, 'D') });
      this.syncSaleStatus(d, ret.saleId);
    });
  }

  updateReturn(id: string, data: Partial<Return>): void {
    this.update(d => {
      const idx = d.returns.findIndex(r => r.id === id);
      if (idx === -1) return;
      const previousSaleId = d.returns[idx]!.saleId;
      d.returns[idx] = { ...d.returns[idx]!, ...data };
      this.syncSaleStatus(d, previousSaleId);
      // Se a devolução foi remanejada para outra venda, as duas precisam ressincronizar.
      if (d.returns[idx]!.saleId !== previousSaleId) {
        this.syncSaleStatus(d, d.returns[idx]!.saleId);
      }
    });
  }

  removeReturn(id: string): void {
    this.update(d => {
      const gone = d.returns.find(r => r.id === id);
      if (!gone) return;
      d.returns = d.returns.filter(r => r.id !== id);
      this.syncSaleStatus(d, gone.saleId);
    });
  }

  /**
   * Mantém `Sale.status` coerente com as devoluções finalizadas.
   * Alterna APENAS o par Concluída ↔ Devolvida — 'Cancelada' e 'Em disputa' são
   * escolhas do usuário e nunca podem ser sobrescritas.
   *
   * Este campo é conveniência de exibição/ordenação: nenhum cálculo de dinheiro
   * depende dele (countsAsRevenue lê o array de devoluções e a UI renderiza
   * ComputedSale.effectiveStatus), então uma escrita perdida deixa no máximo um
   * badge desatualizado, jamais um número errado.
   */
  private syncSaleStatus(d: Database, saleId: string): void {
    const sale = d.sales.find(v => v.id === saleId);
    if (!sale) return;
    if (sale.status === 'Cancelada' || sale.status === 'Em disputa') return;
    const returned = d.returns.reduce(
      (sum, r) => (r.saleId === saleId && r.arrivalDate ? sum + r.quantity : sum),
      0,
    );
    const next: SaleStatus =
      returned > 0 && returned >= sale.quantitySold ? 'Devolvida' : 'Concluída';
    if (sale.status !== next) sale.status = next;
  }

  private update(mutator: (db: Database) => void): Promise<void> {
    const current = this.db();
    if (!current) return Promise.resolve();
    const prev = current;
    const next: Database = JSON.parse(JSON.stringify(current));
    mutator(next);
    this.db.set(next);
    // `prev` vai adiante: no schema 2 é ele que diz o que de fato mudou.
    return this.persist(prev).catch(err => {
      this.db.set(prev);
      throw err;
    });
  }

  /**
   * Aplica no razão o que veio do Mercado Livre.
   *
   * A decisão (lote por FIFO, divisão entre lotes, idempotência) fica no módulo
   * puro `core/ml/inbox-apply`; aqui só se grava, pelo mesmo caminho de escrita
   * das vendas digitadas à mão. Devolve o plano para quem chamou avisar o
   * servidor do que foi aplicado.
   */
  async applyMlInbox(itens: readonly ItemDaCaixa[]): Promise<PlanoDeAplicacao> {
    const plano = planejarAplicacao(itens, this.computedPurchases(), this.sales());
    if (plano.novas.length === 0 && plano.atualizadas.length === 0) return plano;

    await this.update(d => {
      for (const venda of plano.novas) d.sales.push(venda);
      for (const atualizada of plano.atualizadas) {
        const i = d.sales.findIndex(v => v.id === atualizada.id);
        if (i >= 0) d.sales[i] = atualizada;
      }
    });

    return plano;
  }

  /**
   * Substitui os números de uma venda digitada à mão pelos que vieram do
   * Mercado Livre, na conciliação do histórico.
   *
   * Preserva id, lote, produto e observações; corrige comissão, frete,
   * desconto, estorno e situação. Depois disso a venda carrega o `externalId`,
   * então não volta a ser apontada como duplicata.
   */
  async adotarNumerosDoMl(saleId: string, item: ItemDaCaixa): Promise<void> {
    const atual = this.findSale(saleId);
    if (!atual) return;
    const corrigida = adotarNumerosDoMl(atual, item);

    await this.update(d => {
      const i = d.sales.findIndex(v => v.id === saleId);
      if (i >= 0) d.sales[i] = corrigida;
    });
  }

  /**
   * O mesmo, para várias vendas de uma vez.
   *
   * Existe por causa do custo da escrita: `persist()` regrava o documento
   * inteiro, então adotar 68 vendas uma a uma seriam 68 reescritas da base
   * completa — e 68 janelas em que uma falha no meio deixaria metade adotada.
   * Aqui é uma gravação só: ou entra tudo, ou nada muda.
   *
   * Devolve os `externalId` efetivamente adotados, para quem chamou avisar o
   * servidor. Item cuja venda sumiu no meio do caminho é simplesmente pulado.
   */
  async adotarNumerosDoMlEmLote(
    pares: readonly { saleId: string; item: ItemDaCaixa }[],
  ): Promise<string[]> {
    const alvos = pares.filter(p => this.findSale(p.saleId));
    if (alvos.length === 0) return [];

    await this.update(d => {
      for (const { saleId, item } of alvos) {
        const i = d.sales.findIndex(v => v.id === saleId);
        if (i >= 0) d.sales[i] = adotarNumerosDoMl(d.sales[i], item);
      }
    });

    return alvos.map(p => p.item.externalId);
  }

  /**
   * Registra no razão as devoluções vindas do Mercado Livre.
   *
   * A decisão fica no módulo puro `core/ml/returns-apply`; aqui só se grava.
   * Devolução sem venda correspondente não é criada — espera a venda entrar.
   */
  async applyMlReturns(itens: readonly DevolucaoDoMl[]): Promise<PlanoDeDevolucoes> {
    const plano = planejarDevolucoes(itens, this.sales(), this.returns());
    if (plano.novas.length === 0 && plano.atualizadas.length === 0) return plano;

    await this.update(dbAtual => {
      for (const nova of plano.novas) {
        dbAtual.returns.push(nova);
        this.syncSaleStatus(dbAtual, nova.saleId);
      }
      for (const atualizada of plano.atualizadas) {
        const i = dbAtual.returns.findIndex(r => r.id === atualizada.id);
        if (i >= 0) dbAtual.returns[i] = atualizada;
        this.syncSaleStatus(dbAtual, atualizada.saleId);
      }
    });

    return plano;
  }

  /**
   * Move o razão do documento único para as subcoleções.
   *
   * ADITIVA E REVERSÍVEL, de propósito: copia tudo para as subcoleções, marca
   * `metadata.schema = 2` e **não apaga nada** de `db/main`. Os arrays antigos
   * ficam lá, intactos, como rede — se algo der errado, basta baixar o schema
   * de volta para 1 e a base original está inteira. A limpeza é um passo
   * separado, explícito, depois de você conferir os números.
   *
   * Rodar de novo numa base já migrada não faz nada.
   */
  async migrarParaSubcolecoes(): Promise<{ purchases: number; sales: number; returns: number }> {
    const uid = this.auth.currentUser()?.uid;
    const atual = this.db();
    if (!uid || !atual) throw new Error('sem-sessao');
    if (this.emSubcolecoes()) return { purchases: 0, sales: 0, returns: 0 };

    const tudo: { nome: string; itens: readonly { id: string }[] }[] = [
      { nome: 'purchases', itens: atual.purchases },
      { nome: 'sales', itens: atual.sales },
      { nome: 'returns', itens: atual.returns },
    ];

    for (const { nome, itens } of tudo) {
      for (let i = 0; i < itens.length; i += 400) {
        const lote = writeBatch(this.firestore);
        for (const item of itens.slice(i, i + 400)) {
          lote.set(
            doc(this.firestore, `users/${uid}/${nome}/${item.id}`),
            JSON.parse(JSON.stringify(item)),
          );
        }
        await lote.commit();
      }
    }

    /* A marca do schema vai POR ÚLTIMO. Antes dela, uma falha no meio da cópia
       deixa subcoleções parciais que ninguém lê — o app continua na base
       antiga e a próxima tentativa regrava por cima. Marcar primeiro
       inverteria isso: o app passaria a ler um razão pela metade. */
    await setDoc(
      doc(this.firestore, `users/${uid}/db/main`),
      { metadata: { ...atual.metadata, schema: SCHEMA_SUBCOLECOES } },
      { merge: true },
    );

    return {
      purchases: atual.purchases.length,
      sales: atual.sales.length,
      returns: atual.returns.length,
    };
  }

  /**
   * Apaga os arrays legados de `db/main`, depois da migração conferida.
   *
   * Separado da migração de propósito: é o único passo destrutivo, e só faz
   * sentido quando os números já foram olhados na tela. Recusa se o schema
   * ainda não for 2 — apagar antes seria apagar a única cópia.
   */
  async limparRazaoLegado(): Promise<void> {
    const uid = this.auth.currentUser()?.uid;
    if (!uid) throw new Error('sem-sessao');
    if (!this.emSubcolecoes()) throw new Error('migre-primeiro');

    await setDoc(
      doc(this.firestore, `users/${uid}/db/main`),
      { purchases: deleteField(), sales: deleteField(), returns: deleteField() },
      { merge: true },
    );
  }

  private migrateDatabase(data: any): Database {
    const defaults = this.defaultSettings();
    const cfg = data.settings ?? {};
    const mergedSettings: Settings = {
      defaultMlFee: cfg.defaultMlFee ?? defaults.defaultMlFee,
      yellowAlertDays: cfg.yellowAlertDays ?? defaults.yellowAlertDays,
      redAlertDays: cfg.redAlertDays ?? defaults.redAlertDays,
      minimumMargin: cfg.minimumMargin ?? defaults.minimumMargin,
      lowStockAlert: cfg.lowStockAlert ?? defaults.lowStockAlert,
      defaultShipping: cfg.defaultShipping ?? defaults.defaultShipping,
      returnWindowDays: cfg.returnWindowDays ?? defaults.returnWindowDays,
      defaultChannel: cfg.defaultChannel ?? defaults.defaultChannel,
      categories: cfg.categories ?? defaults.categories,
      categoryColors: cfg.categoryColors ?? defaults.categoryColors,
      suppliers: cfg.suppliers ?? defaults.suppliers,
      supplierColors: cfg.supplierColors ?? defaults.supplierColors,
      channels: cfg.channels ?? defaults.channels,
      channelColors: cfg.channelColors ?? defaults.channelColors,
      fiscal: cfg.fiscal ?? defaults.fiscal,
      dasPaidMonths: cfg.dasPaidMonths ?? defaults.dasPaidMonths,
      dasnDeclaredYears: cfg.dasnDeclaredYears ?? defaults.dasnDeclaredYears,
      mlAutoApply: cfg.mlAutoApply ?? defaults.mlAutoApply,
    };

    return {
      purchases: data.purchases ?? [],
      sales: data.sales ?? [],
      returns: data.returns ?? [],
      settings: mergedSettings,
      metadata: data.metadata ?? { versao: APP.version, ultimaAtualizacao: new Date().toISOString() },
    };
  }

  private defaultSettings(): Settings {
    return {
      defaultMlFee: 0.12,
      yellowAlertDays: 25,
      redAlertDays: 30,
      minimumMargin: 0.10,
      lowStockAlert: 1,
      defaultShipping: 0,
      returnWindowDays: 30,
      defaultChannel: 'Mercado Livre',
      categories: ['Eletrônicos', 'Outros'],
      categoryColors: {},
      suppliers: ['Amazon BR', 'Outro'],
      supplierColors: {},
      channels: ['Mercado Livre', 'Outro'],
      channelColors: {},
      fiscal: DEFAULT_FISCAL_CONFIG,
      dasPaidMonths: [],
      dasnDeclaredYears: [],
      mlAutoApply: true,
    };
  }

  private createEmpty(): Database {
    return {
      purchases: [],
      sales: [],
      returns: [],
      settings: this.defaultSettings(),
      metadata: { versao: APP.version, ultimaAtualizacao: new Date().toISOString() },
    };
  }
}
