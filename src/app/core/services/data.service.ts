import { Injectable, computed, signal } from '@angular/core';
import { APP } from '../constants/app.constants';
import {
  Compra, Venda, Configuracoes, Database
} from '../models/models';
import { calcularCompra, calcularKpis, calcularVenda, proximoId } from './calculations';

@Injectable({ providedIn: 'root' })
export class DataService {
  private readonly db = signal<Database | null>(null);

  readonly loaded = computed(() => this.db() !== null);
  readonly compras = computed(() => this.db()?.compras ?? []);
  readonly vendas = computed(() => this.db()?.vendas ?? []);
  readonly configuracoes = computed(() => this.db()?.configuracoes ?? null);

  /** Compras com cálculos derivados (custo real, estoque, status). */
  readonly comprasCalculadas = computed(() => {
    const cfg = this.configuracoes();
    if (!cfg) return [];
    return this.compras().map(c => calcularCompra(c, this.vendas(), cfg));
  });

  /** Vendas com cálculos derivados (lucro, margem). */
  readonly vendasCalculadas = computed(() =>
    this.vendas().map(v => calcularVenda(v, this.compras()))
  );

  /** KPIs consolidados. */
  readonly kpis = computed(() =>
    calcularKpis(this.comprasCalculadas(), this.vendasCalculadas())
  );

  constructor() {
    void this.carregar();
  }

  // ─── Persistence ───────────────────────────────────────

  async carregar(): Promise<void> {
    const stored = localStorage.getItem(APP.storageKey);
    if (stored) {
      try {
        this.db.set(JSON.parse(stored) as Database);
        return;
      } catch {
        // fall through to fetch
      }
    }
    try {
      const response = await fetch(APP.initialDbUrl);
      const data = (await response.json()) as Database;
      this.db.set(data);
      this.persist();
    } catch {
      this.db.set(this.createEmpty());
    }
  }

  async resetar(): Promise<void> {
    localStorage.removeItem(APP.storageKey);
    await this.carregar();
  }

  exportar(): string {
    return JSON.stringify(this.db(), null, 2);
  }

  importar(json: string): boolean {
    try {
      const data = JSON.parse(json) as Database;
      if (!data.compras || !data.vendas || !data.configuracoes) return false;
      this.db.set(data);
      this.persist();
      return true;
    } catch {
      return false;
    }
  }

  // ─── Compras CRUD ──────────────────────────────────────

  proximoIdCompra(): string {
    return proximoId(this.compras().map(c => c.id), 'C');
  }

  buscarCompra(id: string): Compra | undefined {
    return this.compras().find(c => c.id === id);
  }

  adicionarCompra(compra: Compra): void {
    this.update(d => { d.compras.push({ ...compra }); });
  }

  atualizarCompra(id: string, dados: Partial<Compra>): void {
    this.update(d => {
      const idx = d.compras.findIndex(c => c.id === id);
      if (idx !== -1) d.compras[idx] = { ...d.compras[idx]!, ...dados };
    });
  }

  removerCompra(id: string): void {
    this.update(d => { d.compras = d.compras.filter(c => c.id !== id); });
  }

  // ─── Vendas CRUD ───────────────────────────────────────

  proximoIdVenda(): string {
    return proximoId(this.vendas().map(v => v.id), 'V');
  }

  buscarVenda(id: string): Venda | undefined {
    return this.vendas().find(v => v.id === id);
  }

  adicionarVenda(venda: Venda): void {
    this.update(d => { d.vendas.push({ ...venda }); });
  }

  atualizarVenda(id: string, dados: Partial<Venda>): void {
    this.update(d => {
      const idx = d.vendas.findIndex(v => v.id === id);
      if (idx !== -1) d.vendas[idx] = { ...d.vendas[idx]!, ...dados };
    });
  }

  removerVenda(id: string): void {
    this.update(d => { d.vendas = d.vendas.filter(v => v.id !== id); });
  }

  // ─── Configurações ─────────────────────────────────────

  atualizarConfiguracoes(dados: Partial<Configuracoes>): void {
    this.update(d => { d.configuracoes = { ...d.configuracoes, ...dados }; });
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

  private createEmpty(): Database {
    return {
      compras: [],
      vendas: [],
      configuracoes: {
        taxaMlPadrao: 0.12,
        diasAlertaAmarelo: 25,
        diasAlertaVermelho: 30,
        margemMinima: 0.10,
        alertaEstoqueBaixo: 1,
        fretePadrao: 0,
        canalPadrao: 'Mercado Livre',
        categorias: ['Eletrônicos', 'Outros'],
        fornecedores: ['Amazon BR', 'Outro'],
        canais: ['Mercado Livre', 'Outro'],
      },
      metadata: { versao: APP.version, ultimaAtualizacao: new Date().toISOString() },
    };
  }
}
