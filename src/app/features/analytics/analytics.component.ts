import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTabsModule } from '@angular/material/tabs';
import { MatTooltipModule } from '@angular/material/tooltip';
import { CommonModule } from '@angular/common';
import { DataService } from '../../core/services/data.service';
import { CsvExportService } from '../../core/services/csv-export.service';
import { PageHeaderComponent } from '../../shared/components/page-header.component';
import { StatusBadgeComponent } from '../../shared/components/status-badge.component';
import { EmptyStateComponent } from '../../shared/components/empty-state.component';
import { SkeletonComponent } from '../../shared/components/skeleton.component';
import { BrlPipe } from '../../shared/pipes/brl.pipe';

interface ProductStat {
  product: string;
  qty: number;
  revenue: number;
  netRevenue: number;
  cost: number;
  grossProfit: number;
  netProfit: number;
  margin: number;
}

interface CategoryStat {
  category: string;
  batches: number;
  invested: number;
  idleCapital: number;
  revenue: number;
  profit: number;
  margin: number;
}

interface MonthStat {
  month: string;
  sortKey: string;
  qty: number;
  revenue: number;
  fees: number;
  netRevenue: number;
  cost: number;
  profit: number;
  margin: number;
}

type SortDir = 'asc' | 'desc';

const MONTHS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

@Component({
  selector: 'app-analytics',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink, CommonModule, MatIconModule, MatButtonModule, MatTabsModule, MatTooltipModule,
    PageHeaderComponent, StatusBadgeComponent, EmptyStateComponent, SkeletonComponent, BrlPipe,
  ],
  templateUrl: './analytics.component.html',
  styleUrl: './analytics.component.scss',
})
export class AnalyticsComponent {
  protected readonly data = inject(DataService);
  private readonly csv = inject(CsvExportService);

  protected readonly kpis = this.data.kpis;
  protected readonly hasData = computed(() =>
    this.data.sales().length > 0 || this.data.purchases().length > 0
  );

  /** Sort state per tab. */
  protected readonly productSort = signal<{ key: keyof ProductStat; dir: SortDir }>({ key: 'netProfit', dir: 'desc' });
  protected readonly categorySort = signal<{ key: keyof CategoryStat; dir: SortDir }>({ key: 'profit', dir: 'desc' });
  protected readonly monthSort = signal<{ key: keyof MonthStat; dir: SortDir }>({ key: 'sortKey', dir: 'asc' });
  protected readonly idleSort = signal<{ key: 'daysInStock' | 'idleValue' | 'currentStock'; dir: SortDir }>({ key: 'idleValue', dir: 'desc' });

  // Raw stats (un-sorted)
  private readonly productRankingRaw = computed<ProductStat[]>(() => {
    const completed = this.data.computedSales().filter(v => v.status === 'Concluída');
    const map = new Map<string, ProductStat>();

    for (const v of completed) {
      const e = map.get(v.product) ?? {
        product: v.product, qty: 0, revenue: 0, netRevenue: 0,
        cost: 0, grossProfit: 0, netProfit: 0, margin: 0,
      };
      e.qty += v.quantitySold;
      e.revenue += v.grossRevenue;
      e.netRevenue += v.netRevenue;
      e.cost += v.proportionalCost;
      e.grossProfit += v.grossProfit;
      e.netProfit += v.netProfit;
      map.set(v.product, e);
    }

    return [...map.values()].map(e => ({ ...e, margin: e.revenue > 0 ? e.netProfit / e.revenue : 0 }));
  });

  protected readonly productRanking = computed<ProductStat[]>(() => {
    const list = this.productRankingRaw();
    const { key, dir } = this.productSort();
    return [...list].sort((a, b) => compare(a[key], b[key], dir));
  });

  private readonly categoryStatsRaw = computed<CategoryStat[]>(() => {
    const purchases = this.data.computedPurchases();
    const completed = this.data.computedSales().filter(v => v.status === 'Concluída');
    const map = new Map<string, CategoryStat>();

    for (const c of purchases) {
      const e = map.get(c.category) ?? {
        category: c.category, batches: 0, invested: 0,
        idleCapital: 0, revenue: 0, profit: 0, margin: 0,
      };
      e.batches += 1;
      e.invested += c.totalActualCost;
      e.idleCapital += c.idleValue;
      map.set(c.category, e);
    }

    for (const v of completed) {
      const batch = purchases.find(c => c.id === v.batchId);
      if (!batch) continue;
      const e = map.get(batch.category);
      if (!e) continue;
      e.revenue += v.grossRevenue;
      e.profit += v.netProfit;
    }

    return [...map.values()].map(e => ({ ...e, margin: e.revenue > 0 ? e.profit / e.revenue : 0 }));
  });

  protected readonly categoryStats = computed<CategoryStat[]>(() => {
    const list = this.categoryStatsRaw();
    const { key, dir } = this.categorySort();
    return [...list].sort((a, b) => compare(a[key], b[key], dir));
  });

  private readonly monthlyStatsRaw = computed<MonthStat[]>(() => {
    const completed = this.data.computedSales().filter(v => v.status === 'Concluída');
    const map = new Map<string, MonthStat>();

    for (const v of completed) {
      const d = new Date(v.saleDate);
      const year = d.getUTCFullYear();
      const month = d.getUTCMonth();
      const sortKey = `${year}${String(month).padStart(2, '0')}`;
      const displayMonth = `${MONTHS[month]}/${year}`;
      const e = map.get(sortKey) ?? {
        month: displayMonth, sortKey, qty: 0, revenue: 0, fees: 0,
        netRevenue: 0, cost: 0, profit: 0, margin: 0,
      };
      e.qty += v.quantitySold;
      e.revenue += v.grossRevenue;
      e.fees += v.feeAmount;
      e.netRevenue += v.netRevenue;
      e.cost += v.proportionalCost;
      e.profit += v.netProfit;
      map.set(sortKey, e);
    }

    return [...map.values()].map(e => ({ ...e, margin: e.revenue > 0 ? e.profit / e.revenue : 0 }));
  });

  protected readonly monthlyStats = computed<MonthStat[]>(() => {
    const list = this.monthlyStatsRaw();
    const { key, dir } = this.monthSort();
    return [...list].sort((a, b) => compare(a[key], b[key], dir));
  });

  protected readonly idleInventory = computed(() => {
    const list = this.data.computedPurchases().filter(c => c.currentStock > 0);
    const { key, dir } = this.idleSort();
    return [...list].sort((a, b) => compare(a[key], b[key], dir));
  });

  protected readonly maxIdleDays = computed(() => {
    const list = this.idleInventory();
    if (list.length === 0) return 0;
    return Math.max(...list.map(b => b.daysInStock));
  });

  /** Resume cards (3 columns: Investment / Result / Efficiency). */
  protected readonly resumeBlocks = computed(() => {
    const k = this.kpis();
    return [
      {
        title: 'Investimento',
        icon: 'savings',
        rows: [
          { label: 'Investido em compras', value: k.totalInvested, tone: 'neutral' as const, prefix: '' },
          { label: 'Capital parado',       value: k.idleCapital,   tone: 'warning' as const, prefix: '' },
          { label: 'Total de lotes',       value: k.totalBatches,  tone: 'neutral' as const, kind: 'count' as const },
          { label: 'Lotes em estoque',     value: k.batchesInStock, tone: 'neutral' as const, kind: 'count' as const },
        ],
      },
      {
        title: 'Resultado',
        icon: 'trending_up',
        rows: [
          { label: 'Receita bruta',  value: k.grossRevenue, tone: 'neutral' as const, prefix: '' },
          { label: 'Receita líquida', value: k.netRevenue,   tone: 'neutral' as const, prefix: '' },
          { label: 'Lucro bruto',     value: k.grossProfit,  tone: 'success' as const, prefix: '' },
          { label: 'Lucro líquido',   value: k.netProfit,    tone: 'success' as const, prefix: '', emphasis: true },
        ],
      },
      {
        title: 'Eficiência',
        icon: 'auto_graph',
        rows: [
          { label: 'Taxas pagas',     value: k.totalFees,      tone: 'warning' as const, prefix: '' },
          { label: 'Total descontos', value: k.totalDiscounts, tone: 'neutral' as const, prefix: '' },
          { label: 'Ticket médio',    value: k.averageTicket,  tone: 'neutral' as const, prefix: '' },
          { label: 'Margem líquida',  value: k.netMargin,      tone: 'success' as const, kind: 'percent' as const, emphasis: true },
        ],
      },
    ];
  });

  // ──────────────────────────────────────────────
  // Sort handlers
  // ──────────────────────────────────────────────
  protected sortProduct(key: keyof ProductStat): void {
    this.productSort.update(s => ({ key, dir: s.key === key && s.dir === 'desc' ? 'asc' : 'desc' }));
  }
  protected sortCategory(key: keyof CategoryStat): void {
    this.categorySort.update(s => ({ key, dir: s.key === key && s.dir === 'desc' ? 'asc' : 'desc' }));
  }
  protected sortMonth(key: keyof MonthStat): void {
    this.monthSort.update(s => ({ key, dir: s.key === key && s.dir === 'desc' ? 'asc' : 'desc' }));
  }
  protected sortIdle(key: 'daysInStock' | 'idleValue' | 'currentStock'): void {
    this.idleSort.update(s => ({ key, dir: s.key === key && s.dir === 'desc' ? 'asc' : 'desc' }));
  }

  protected sortIcon<T>(state: { key: T; dir: SortDir }, key: T): string {
    if (state.key !== key) return 'unfold_more';
    return state.dir === 'desc' ? 'arrow_downward' : 'arrow_upward';
  }

  // ──────────────────────────────────────────────
  // CSV Exports
  // ──────────────────────────────────────────────
  protected exportProducts(): void {
    this.csv.download(
      'lucrato-produtos',
      ['Produto', 'Qtd Vendida', 'Receita Bruta', 'Receita Líquida', 'Custo', 'Lucro Bruto', 'Lucro Líquido', 'Margem %'],
      this.productRanking().map(p => ({
        product: p.product, qty: p.qty, revenue: p.revenue, netRevenue: p.netRevenue,
        cost: p.cost, grossProfit: p.grossProfit, netProfit: p.netProfit, margin: p.margin * 100,
      })),
      ['product', 'qty', 'revenue', 'netRevenue', 'cost', 'grossProfit', 'netProfit', 'margin'],
    );
  }

  protected exportCategories(): void {
    this.csv.download(
      'lucrato-categorias',
      ['Categoria', 'Lotes', 'Investido', 'Capital Parado', 'Receita Bruta', 'Lucro Líquido', 'Margem %'],
      this.categoryStats().map(c => ({
        category: c.category, batches: c.batches, invested: c.invested,
        idleCapital: c.idleCapital, revenue: c.revenue, profit: c.profit, margin: c.margin * 100,
      })),
      ['category', 'batches', 'invested', 'idleCapital', 'revenue', 'profit', 'margin'],
    );
  }

  protected exportMonthly(): void {
    this.csv.download(
      'lucrato-evolucao-mensal',
      ['Mês', 'Vendas', 'Receita Bruta', 'Taxas ML', 'Receita Líquida', 'Custo', 'Lucro Líquido', 'Margem %'],
      this.monthlyStats().map(m => ({
        month: m.month, qty: m.qty, revenue: m.revenue, fees: m.fees,
        netRevenue: m.netRevenue, cost: m.cost, profit: m.profit, margin: m.margin * 100,
      })),
      ['month', 'qty', 'revenue', 'fees', 'netRevenue', 'cost', 'profit', 'margin'],
    );
  }

  protected exportIdle(): void {
    this.csv.download(
      'lucrato-estoque-parado',
      ['ID', 'Produto', 'Estoque', 'Custo Unit.', 'Capital Parado', 'Dias Parado', 'Status'],
      this.idleInventory().map(c => ({
        id: c.id, product: c.product, currentStock: c.currentStock,
        actualUnitCost: c.actualUnitCost, idleValue: c.idleValue,
        daysInStock: c.daysInStock, status: c.status,
      })),
      ['id', 'product', 'currentStock', 'actualUnitCost', 'idleValue', 'daysInStock', 'status'],
    );
  }

  protected marginClass(m: number): string {
    if (m < 0) return 'text-danger';
    const cfg = this.data.settings();
    if (cfg && m < cfg.minimumMargin) return 'text-warning';
    return 'text-success';
  }
}

function compare(a: unknown, b: unknown, dir: SortDir): number {
  const direction = dir === 'asc' ? 1 : -1;
  if (typeof a === 'number' && typeof b === 'number') return (a - b) * direction;
  return String(a).localeCompare(String(b)) * direction;
}
