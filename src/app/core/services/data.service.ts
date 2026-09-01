import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { Firestore, doc, onSnapshot, setDoc, deleteField } from '@angular/fire/firestore';
import type { Unsubscribe } from '@angular/fire/firestore';
import { TranslateService } from '@ngx-translate/core';
import { APP, DEFAULT_CATEGORY_COLOR } from '../constants/app.constants';
import {
  Purchase, Sale, Settings, Database, SaleChannel, SaleStatus, Return
} from '../models/models';
import { calculatePurchase, calculateKpis, calculateSale, computeReturn, nextId } from './calculations';
import { computeFiscalStatus } from '../fiscal/fiscal';
import { DEFAULT_FISCAL_CONFIG } from '../fiscal/fiscal-regimes';
import { FiscalConfig } from '../fiscal/fiscal.model';
import { AuthService } from './auth.service';
import { NotifyService } from './notify.service';
import { ConnectionService } from './connection.service';
import { firestoreErrorMessage } from './firestore-errors';
import { logError } from './logger';

const RETRY_DELAYS_MS = [1000, 2000, 4000, 8000, 16000, 30000];

@Injectable({ providedIn: 'root' })
export class DataService {
  private readonly firestore = inject(Firestore);
  private readonly auth = inject(AuthService);
  private readonly notify = inject(NotifyService);
  private readonly connection = inject(ConnectionService);
  private readonly t = inject(TranslateService);

  private readonly db = signal<Database | null>(null);
  private _unsub?: Unsubscribe;
  private _retryTimer?: ReturnType<typeof setTimeout>;
  private _retryAttempt = 0;
  private _warnedFirstOffline = false;

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
    this._unsub?.();
    await this.auth.refreshIdToken();
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
          this.db.set(this.migrateDatabase(snap.data()));
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
    this._unsub?.();
    this._unsub = undefined;
    this._retryAttempt = 0;
    this._warnedFirstOffline = false;
    this.db.set(null);
  }

  private persist(): Promise<void> {
    const uid = this.auth.currentUser()?.uid;
    if (!uid) return Promise.resolve();
    const current = this.db();
    if (!current) return Promise.resolve();
    const payload = {
      purchases: JSON.parse(JSON.stringify(current.purchases)),
      sales: JSON.parse(JSON.stringify(current.sales)),
      returns: JSON.parse(JSON.stringify(current.returns)),
      metadata: {
        versao: current.metadata.versao,
        ultimaAtualizacao: new Date().toISOString(),
      },
    };
    return setDoc(doc(this.firestore, `users/${uid}/db/main`), payload, { merge: true })
      .catch(err => {
        logError('[Firestore] Falha ao salvar:', err);
        this.notify.error(this.t.instant(firestoreErrorMessage(err)));
        throw err;
      });
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

  addPurchase(purchase: Purchase): void {
    this.update(d => { d.purchases.push({ ...purchase }); });
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
    this.update(d => { d.sales.push({ ...sale }); });
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
      d.returns.push({ ...ret });
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
    return this.persist().catch(err => {
      this.db.set(prev);
      throw err;
    });
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
