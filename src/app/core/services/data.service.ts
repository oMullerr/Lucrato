import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { Firestore, doc, onSnapshot, setDoc } from '@angular/fire/firestore';
import type { Unsubscribe } from '@angular/fire/firestore';
import { APP } from '../constants/app.constants';
import {
  Purchase, Sale, Settings, Database, SaleChannel
} from '../models/models';
import { calculatePurchase, calculateKpis, calculateSale, nextId } from './calculations';
import { AuthService } from './auth.service';
import { NotifyService } from './notify.service';

@Injectable({ providedIn: 'root' })
export class DataService {
  private readonly firestore = inject(Firestore);
  private readonly auth = inject(AuthService);
  private readonly notify = inject(NotifyService);

  private readonly db = signal<Database | null>(null);
  private _unsub?: Unsubscribe;

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
          console.error('[DataService] startSync falhou:', err),
        );
      } else if (u === null) {
        this.stopSync();
      }
    }, { allowSignalWrites: true });
  }

  // ─── Firestore sync ────────────────────────────────────

  private async startSync(uid: string): Promise<void> {
    this.stopSync();
    await this.auth.refreshIdToken();
    const ref = doc(this.firestore, `users/${uid}/db/main`);
    this._unsub = onSnapshot(ref, snap => {
      if (snap.exists()) {
        this.db.set(this.migrateDatabase(snap.data()));
      } else if (snap.metadata.fromCache) {
        if (this.db() === null) {
          this.db.set(this.createEmpty());
        }
      } else {
        const empty = this.createEmpty();
        this.db.set(empty);
        setDoc(ref, empty).catch(err => console.error('[Firestore] Falha ao criar documento inicial:', err));
      }
    }, err => console.error('[Firestore] onSnapshot falhou:', err));
  }

  private stopSync(): void {
    this._unsub?.();
    this._unsub = undefined;
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
      metadata: {
        versao: current.metadata.versao,
        ultimaAtualizacao: new Date().toISOString(),
      },
    };
    return setDoc(doc(this.firestore, `users/${uid}/db/main`), payload, { merge: true })
      .catch(err => {
        console.error('[Firestore] Falha ao salvar:', err);
        this.notify.error('Erro ao sincronizar dados com o servidor. Verifique sua conexão.');
        throw err;
      });
  }

  async reset(): Promise<void> {
    const uid = this.auth.currentUser()?.uid;
    if (!uid) return;
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
    await setDoc(doc(this.firestore, `users/${uid}/db/main`), zeroed);
  }

  // ─── Purchases CRUD ──────────────────────────────────────

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

  // ─── Sales CRUD ───────────────────────────────────────

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

  // ─── Internals ─────────────────────────────────────────

  private update(mutator: (db: Database) => void): Promise<void> {
    const current = this.db();
    if (!current) return Promise.resolve();
    const next: Database = JSON.parse(JSON.stringify(current));
    mutator(next);
    this.db.set(next);
    return this.persist();
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
      initialCapital: cfg.initialCapital ?? defaults.initialCapital,
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
      initialCapital: 0,
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
