import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { Firestore, doc, onSnapshot } from '@angular/fire/firestore';
import type { Unsubscribe } from '@angular/fire/firestore';
import { APP } from '../constants/app.constants';
import {
  Purchase, Sale, Settings, Database, SaleChannel
} from '../models/models';
import { calculatePurchase, calculateKpis, calculateSale, nextId } from './calculations';
import { ApiClient } from './api-client.service';
import { AuthService } from './auth.service';
import { NotifyService } from './notify.service';
import { ConnectionService } from './connection.service';
import { firestoreErrorMessage } from './firestore-errors';
import { logError } from './logger';

const RETRY_DELAYS_MS = [1000, 2000, 4000, 8000, 16000, 30000];

@Injectable({ providedIn: 'root' })
export class DataService {
  private readonly firestore = inject(Firestore);
  private readonly api = inject(ApiClient);
  private readonly auth = inject(AuthService);
  private readonly notify = inject(NotifyService);
  private readonly connection = inject(ConnectionService);

  private readonly db = signal<Database | null>(null);
  private _unsub?: Unsubscribe;
  private _retryTimer?: ReturnType<typeof setTimeout>;
  private _retryAttempt = 0;
  private _warnedFirstOffline = false;

  readonly loaded = computed(() => this.db() !== null);
  readonly purchases = computed(() => this.db()?.purchases ?? []);
  readonly sales = computed(() => this.db()?.sales ?? []);
  readonly settings = computed(() => this.db()?.settings ?? null);

  readonly computedPurchases = computed(() => {
    const cfg = this.settings();
    if (!cfg) return [];
    return this.purchases().map(c => calculatePurchase(c, this.sales(), cfg));
  });

  readonly computedSales = computed(() =>
    this.sales().map(v => calculateSale(v, this.purchases()))
  );

  readonly kpis = computed(() =>
    calculateKpis(this.computedPurchases(), this.computedSales())
  );

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
      snap => {
        this.connection.reportSnapshot(snap.metadata);
        if (this.connection.syncError()) {
          this.connection.clearSyncError();
          this.notify.success('Sincronização restaurada');
        }
        this._retryAttempt = 0;

        if (snap.exists()) {
          this.db.set(this.migrateDatabase(snap.data()));
        } else if (snap.metadata.fromCache) {
          if (this.db() === null) {
            this.db.set(this.createEmpty());
            if (!this._warnedFirstOffline) {
              this._warnedFirstOffline = true;
              this.notify.warning('Você está offline. Seus dados aparecerão quando conectar ao servidor.');
            }
          }
        } else {
          const empty = this.createEmpty();
          this.db.set(empty);
          this.api.putDb(this.toPayload(empty)).catch(err => {
            logError('[API] Falha ao criar documento inicial:', err);
            this.connection.reportSnapshotError(err);
            this.notify.warning('Não foi possível criar seu banco de dados inicial. Recarregue a página.');
          });
        }
      },
      err => {
        logError('[Firestore] onSnapshot falhou:', err);
        this.connection.reportSnapshotError(err);
        this.notify.error(firestoreErrorMessage(err));
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

  /** Builds the full-document payload sent to the API (backend overwrites the whole doc). */
  private toPayload(db: Database) {
    return {
      purchases: JSON.parse(JSON.stringify(db.purchases)) as Purchase[],
      sales: JSON.parse(JSON.stringify(db.sales)) as Sale[],
      settings: JSON.parse(JSON.stringify(db.settings)) as Settings,
      metadata: {
        versao: db.metadata.versao,
        ultimaAtualizacao: new Date().toISOString(),
      },
    };
  }

  private persist(): Promise<void> {
    const uid = this.auth.currentUser()?.uid;
    if (!uid) return Promise.resolve();
    const current = this.db();
    if (!current) return Promise.resolve();
    return this.api.putDb(this.toPayload(current))
      .catch(err => {
        logError('[API] Falha ao salvar:', err);
        this.notify.error(firestoreErrorMessage(err));
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
      settings: {
        defaultMlFee: 0,
        yellowAlertDays: 0,
        redAlertDays: 0,
        minimumMargin: 0,
        lowStockAlert: 0,
        defaultShipping: 0,
        defaultChannel: '' as SaleChannel,
        categories: [],
        suppliers: [],
        channels: [],
      },
      metadata: { versao: APP.version, ultimaAtualizacao: new Date().toISOString() },
    };
    this.db.set(zeroed);
    try {
      await this.api.putDb(this.toPayload(zeroed));
    } catch (err) {
      logError('[API] Falha ao zerar dados:', err);
      this.db.set(prev);
      this.notify.error(firestoreErrorMessage(err));
      throw err;
    }
  }

  nextPurchaseId(): string {
    return nextId(this.purchases().map(c => c.id), 'C');
  }

  findPurchase(id: string): Purchase | undefined {
    return this.purchases().find(c => c.id === id);
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
      d.purchases = d.purchases.filter(c => c.id !== purchaseId);
      d.sales     = d.sales.filter(v => v.batchId !== purchaseId);
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
    this.update(d => { d.sales = d.sales.filter(v => v.id !== id); });
  }

  async bulkImport(purchases: Purchase[], sales: Sale[]): Promise<void> {
    if (purchases.length === 0 && sales.length === 0) return;
    await this.update(d => {
      if (purchases.length) d.purchases.push(...purchases);
      if (sales.length) d.sales.push(...sales);
    });
  }

  /** Replaces the full settings object (optimistic + rollback via update()). */
  updateSettings(settings: Settings): Promise<void> {
    return this.update(d => { d.settings = { ...settings }; });
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
      defaultChannel: cfg.defaultChannel ?? defaults.defaultChannel,
      categories: cfg.categories ?? defaults.categories,
      suppliers: cfg.suppliers ?? defaults.suppliers,
      channels: cfg.channels ?? defaults.channels,
    };

    return {
      purchases: data.purchases ?? [],
      sales: data.sales ?? [],
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
      defaultChannel: 'Mercado Livre',
      categories: ['Eletrônicos', 'Outros'],
      suppliers: ['Amazon BR', 'Outro'],
      channels: ['Mercado Livre', 'Outro'],
    };
  }

  private createEmpty(): Database {
    return {
      purchases: [],
      sales: [],
      settings: this.defaultSettings(),
      metadata: { versao: APP.version, ultimaAtualizacao: new Date().toISOString() },
    };
  }
}
