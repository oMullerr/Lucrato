import { Injectable, computed, signal } from '@angular/core';
import { APP } from '../constants/app.constants';
import {
  Purchase, Sale, Settings, Database
} from '../models/models';
import { calculatePurchase, calculateKpis, calculateSale, nextId } from './calculations';

@Injectable({ providedIn: 'root' })
export class DataService {
  private readonly db = signal<Database | null>(null);

  readonly loaded = computed(() => this.db() !== null);
  readonly purchases = computed(() => this.db()?.purchases ?? []);
  readonly sales = computed(() => this.db()?.sales ?? []);
  readonly settings = computed(() => this.db()?.settings ?? null);

  /** Purchases with derived computed fields (actual cost, stock, status). */
  readonly computedPurchases = computed(() => {
    const cfg = this.settings();
    if (!cfg) return [];
    return this.purchases().map(c => calculatePurchase(c, this.sales(), cfg));
  });

  /** Sales with derived computed fields (profit, margin). */
  readonly computedSales = computed(() =>
    this.sales().map(v => calculateSale(v, this.purchases()))
  );

  /** Consolidated KPIs. */
  readonly kpis = computed(() =>
    calculateKpis(this.computedPurchases(), this.computedSales())
  );

  constructor() {
    void this.load();
  }

  // ─── Persistence ───────────────────────────────────────

  async load(): Promise<void> {
    const stored = localStorage.getItem(APP.storageKey);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        this.db.set(this.migrateDatabase(parsed));
        return;
      } catch {
        // fall through to fetch
      }
    }
    try {
      const response = await fetch(APP.initialDbUrl);
      const data = await response.json();
      this.db.set(this.migrateDatabase(data));
      this.persist();
    } catch {
      this.db.set(this.createEmpty());
    }
  }

  async reset(): Promise<void> {
    localStorage.removeItem(APP.storageKey);
    await this.load();
  }

  exportData(): string {
    return JSON.stringify(this.db(), null, 2);
  }

  importData(json: string): boolean {
    try {
      const data = JSON.parse(json);
      const migrated = this.migrateDatabase(data);
      if (!migrated.purchases || !migrated.sales || !migrated.settings) return false;
      this.db.set(migrated);
      this.persist();
      return true;
    } catch {
      return false;
    }
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

  // ─── Settings ─────────────────────────────────────────

  updateSettings(data: Partial<Settings>): void {
    this.update(d => { d.settings = { ...d.settings, ...data }; });
  }

  // ─── Internals ─────────────────────────────────────────

  private update(mutator: (db: Database) => void): void {
    const current = this.db();
    if (!current) return;
    const next: Database = JSON.parse(JSON.stringify(current));
    mutator(next);
    this.db.set(next);
    this.persist();
  }

  private persist(): void {
    const current = this.db();
    if (!current) return;
    current.metadata.ultimaAtualizacao = new Date().toISOString();
    localStorage.setItem(APP.storageKey, JSON.stringify(current));
  }

  /** Migrates old Portuguese-keyed database format to current English format. */
  private migrateDatabase(data: any): Database {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const isOldFormat = (data.compras !== undefined || data.vendas !== undefined) && data.purchases === undefined;
    if (!isOldFormat) return data as Database;

    const cfg = data.configuracoes ?? data.settings ?? {};
    return {
      purchases: (data.compras ?? []).map((c: any) => ({
        id: c.id,
        product: c.produto ?? c.product ?? '',
        category: c.categoria ?? c.category ?? '',
        supplier: c.fornecedor ?? c.supplier ?? '',
        link: c.link,
        purchaseDate: c.dataCompra ?? c.purchaseDate ?? '',
        quantityPurchased: c.qtdComprada ?? c.quantityPurchased ?? 0,
        unitCost: c.custoUnitario ?? c.unitCost ?? 0,
        purchaseShipping: c.freteCompra ?? c.purchaseShipping ?? 0,
        otherCosts: c.outrosCustos ?? c.otherCosts ?? 0,
        notes: c.observacoes ?? c.notes,
      })),
      sales: (data.vendas ?? []).map((v: any) => ({
        id: v.id,
        batchId: v.idLote ?? v.batchId ?? '',
        product: v.produto ?? v.product ?? '',
        quantitySold: v.qtdVendida ?? v.quantitySold ?? 0,
        unitPrice: v.precoUnitario ?? v.unitPrice ?? 0,
        saleDate: v.dataVenda ?? v.saleDate ?? '',
        channel: v.canal ?? v.channel ?? 'Mercado Livre',
        feePercentage: v.taxaPercentual ?? v.feePercentage ?? 0.12,
        sellerShipping: v.freteVendedor ?? v.sellerShipping ?? 0,
        discount: v.desconto ?? v.discount ?? 0,
        otherCosts: v.outrosCustos ?? v.otherCosts ?? 0,
        status: v.status ?? 'Concluída',
        notes: v.observacoes ?? v.notes,
      })),
      settings: {
        defaultMlFee: cfg.taxaMlPadrao ?? cfg.defaultMlFee ?? 0.12,
        yellowAlertDays: cfg.diasAlertaAmarelo ?? cfg.yellowAlertDays ?? 25,
        redAlertDays: cfg.diasAlertaVermelho ?? cfg.redAlertDays ?? 30,
        minimumMargin: cfg.margemMinima ?? cfg.minimumMargin ?? 0.10,
        lowStockAlert: cfg.alertaEstoqueBaixo ?? cfg.lowStockAlert ?? 1,
        defaultShipping: cfg.fretePadrao ?? cfg.defaultShipping ?? 0,
        defaultChannel: cfg.canalPadrao ?? cfg.defaultChannel ?? 'Mercado Livre',
        categories: cfg.categorias ?? cfg.categories ?? [],
        suppliers: cfg.fornecedores ?? cfg.suppliers ?? [],
        channels: cfg.canais ?? cfg.channels ?? [],
      },
      metadata: data.metadata ?? { versao: APP.version, ultimaAtualizacao: new Date().toISOString() },
    };
  }

  private createEmpty(): Database {
    return {
      purchases: [],
      sales: [],
      settings: {
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
      },
      metadata: { versao: APP.version, ultimaAtualizacao: new Date().toISOString() },
    };
  }
}
