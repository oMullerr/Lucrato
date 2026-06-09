import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, Signal, viewChild, WritableSignal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTabsModule } from '@angular/material/tabs';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatPaginator, MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { CommonModule } from '@angular/common';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { DataService } from '../../core/services/data.service';
import { LanguageService } from '../../core/services/language.service';
import { XlsxExportService, SheetSpec, ResumoSpec, Tone } from '../../core/services/xlsx-export.service';
import { ComputedPurchase, InventoryStatus } from '../../core/models/models';
import { PageHeaderComponent } from '../../shared/components/page-header.component';
import { StatusBadgeComponent } from '../../shared/components/status-badge.component';
import { EmptyStateComponent } from '../../shared/components/empty-state.component';
import { SkeletonComponent } from '../../shared/components/skeleton.component';
import { ColorPillComponent } from '../../shared/components/color-pill.component';
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

@Component({
  selector: 'app-analytics',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink, CommonModule, MatIconModule, MatButtonModule, MatTabsModule, MatTooltipModule,
    MatPaginatorModule,
    PageHeaderComponent, StatusBadgeComponent, EmptyStateComponent, SkeletonComponent, ColorPillComponent, BrlPipe,
    TranslateModule,
  ],
  templateUrl: './analytics.component.html',
  styleUrl: './analytics.component.scss',
})
export class AnalyticsComponent {
  protected readonly data = inject(DataService);
  private readonly xlsx = inject(XlsxExportService);
  private readonly t = inject(TranslateService);
  private readonly lang = inject(LanguageService);

  protected readonly kpis = this.data.kpis;
  protected readonly hasData = computed(() =>
    this.data.sales().length > 0 || this.data.purchases().length > 0
  );

  /** Sort state per tab. */
  protected readonly productSort = signal<{ key: keyof ProductStat; dir: SortDir }>({ key: 'netProfit', dir: 'desc' });
  protected readonly categorySort = signal<{ key: keyof CategoryStat; dir: SortDir }>({ key: 'profit', dir: 'desc' });
  protected readonly monthSort = signal<{ key: keyof MonthStat; dir: SortDir }>({ key: 'sortKey', dir: 'asc' });
  protected readonly idleSort = signal<{ key: 'daysInStock' | 'idleValue' | 'currentStock'; dir: SortDir }>({ key: 'idleValue', dir: 'desc' });

  /** Pagination — one state signal + one paginator ref per table. */
  protected readonly pageSizeOptions = [15, 30, 50, 100, 150];
  protected readonly productPage = signal<PageEvent>({ pageIndex: 0, pageSize: 15, length: 0 });
  protected readonly categoryPage = signal<PageEvent>({ pageIndex: 0, pageSize: 15, length: 0 });
  protected readonly monthPage = signal<PageEvent>({ pageIndex: 0, pageSize: 15, length: 0 });
  protected readonly idlePage = signal<PageEvent>({ pageIndex: 0, pageSize: 15, length: 0 });

  private readonly productPaginator = viewChild('productPaginator', { read: MatPaginator });
  private readonly categoryPaginator = viewChild('categoryPaginator', { read: MatPaginator });
  private readonly monthPaginator = viewChild('monthPaginator', { read: MatPaginator });
  private readonly idlePaginator = viewChild('idlePaginator', { read: MatPaginator });

  constructor() {
    this.wirePaginator(this.productPaginator, this.productPage);
    this.wirePaginator(this.categoryPaginator, this.categoryPage);
    this.wirePaginator(this.monthPaginator, this.monthPage);
    this.wirePaginator(this.idlePaginator, this.idlePage);
  }

  private wirePaginator(
    ref: Signal<MatPaginator | undefined>,
    state: WritableSignal<PageEvent>,
  ): void {
    effect((onCleanup) => {
      const p = ref();
      if (!p) return;
      const sub = p.page.subscribe((evt: PageEvent) => state.set(evt));
      onCleanup(() => sub.unsubscribe());
    });
  }

  private slicePage<T>(list: T[], state: PageEvent): T[] {
    const start = state.pageIndex * state.pageSize;
    return list.slice(start, start + state.pageSize);
  }

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
    this.lang.lang(); // re-evaluate month labels when the language changes
    const completed = this.data.computedSales().filter(v => v.status === 'Concluída');
    const map = new Map<string, MonthStat>();

    for (const v of completed) {
      const d = new Date(v.saleDate);
      const year = d.getUTCFullYear();
      const month = d.getUTCMonth();
      const sortKey = `${year}${String(month).padStart(2, '0')}`;
      const months = this.t.instant('dashboard.months') as string[];
      const displayMonth = `${months[month]}/${year}`;
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

  /** Page slices for each tab — derived from the already-sorted base signals. */
  protected readonly pagedProductRanking = computed(() =>
    this.slicePage(this.productRanking(), this.productPage()));
  protected readonly pagedCategoryStats = computed(() =>
    this.slicePage(this.categoryStats(), this.categoryPage()));
  protected readonly pagedMonthlyStats = computed(() =>
    this.slicePage(this.monthlyStats(), this.monthPage()));
  protected readonly pagedIdleInventory = computed(() =>
    this.slicePage(this.idleInventory(), this.idlePage()));

  /** Resume cards (3 columns: Investment / Result / Efficiency). */
  protected readonly resumeBlocks = computed(() => {
    this.lang.lang(); // re-evaluate labels when the language changes
    const k = this.kpis();
    const tr = (key: string) => this.t.instant(key);
    return [
      {
        title: tr('analytics.resInvestment'),
        icon: 'savings',
        rows: [
          { label: tr('analytics.investedInPurchases'), value: k.totalInvested, tone: 'neutral' as const, prefix: '' },
          { label: tr('analytics.idleCapital'),         value: k.idleCapital,   tone: 'warning' as const, prefix: '' },
          { label: tr('analytics.totalBatches'),        value: k.totalBatches,  tone: 'neutral' as const, kind: 'count' as const },
          { label: tr('analytics.batchesInStock'),      value: k.batchesInStock, tone: 'neutral' as const, kind: 'count' as const },
        ],
      },
      {
        title: tr('analytics.resResult'),
        icon: 'trending_up',
        rows: [
          { label: tr('analytics.grossRevenue'), value: k.grossRevenue, tone: 'neutral' as const, prefix: '' },
          { label: tr('analytics.netRevenue'),   value: k.netRevenue,   tone: 'neutral' as const, prefix: '' },
          { label: tr('analytics.grossProfit'),  value: k.grossProfit,  tone: 'success' as const, prefix: '' },
          { label: tr('analytics.netProfit'),    value: k.netProfit,    tone: 'success' as const, prefix: '', emphasis: true },
        ],
      },
      {
        title: tr('analytics.resEfficiency'),
        icon: 'auto_graph',
        rows: [
          { label: tr('analytics.feesPaid'),       value: k.totalFees,      tone: 'warning' as const, prefix: '' },
          { label: tr('analytics.totalDiscounts'), value: k.totalDiscounts, tone: 'neutral' as const, prefix: '' },
          { label: tr('analytics.avgTicket'),      value: k.averageTicket,  tone: 'neutral' as const, prefix: '' },
          { label: tr('analytics.netMargin'),      value: k.netMargin,      tone: 'success' as const, kind: 'percent' as const, emphasis: true },
        ],
      },
    ];
  });

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

  protected exportProducts(): void {
    this.xlsx.download(
      `lucrato-produtos-${this.today()}.xlsx`,
      [this.productsSheetSpec()],
      this.resumoSpec(),
    );
  }

  protected exportCategories(): void {
    this.xlsx.download(
      `lucrato-categorias-${this.today()}.xlsx`,
      [this.categoriesSheetSpec()],
      this.resumoSpec(),
    );
  }

  protected exportMonthly(): void {
    this.xlsx.download(
      `lucrato-evolucao-mensal-${this.today()}.xlsx`,
      [this.monthlySheetSpec()],
      this.resumoSpec(),
    );
  }

  protected exportIdle(): void {
    this.xlsx.download(
      `lucrato-estoque-parado-${this.today()}.xlsx`,
      [this.idleSheetSpec()],
      this.resumoSpec(),
    );
  }

  protected exportAll(): void {
    this.xlsx.download(
      `lucrato-analises-${this.today()}.xlsx`,
      [
        this.productsSheetSpec(),
        this.categoriesSheetSpec(),
        this.monthlySheetSpec(),
        this.idleSheetSpec(),
      ],
      this.resumoSpec(),
    );
  }

  private productsSheetSpec(): SheetSpec<ProductStat> {
    const marginTone = (m: number) => this.marginTone(m);
    const tr = (key: string) => this.t.instant(key);
    return {
      name: tr('analytics.tabProduct'),
      title: tr('analytics.productRankingTitle'),
      columns: [
        { header: tr('analytics.colProduct'),     key: 'product',     type: 'text' },
        { header: tr('analytics.colQtySold'),     key: 'qty',         type: 'int',     total: 'sum' },
        { header: tr('analytics.colGrossRevenue'), key: 'revenue',    type: 'brl',     total: 'sum' },
        { header: tr('analytics.colNetRevenue'),  key: 'netRevenue',  type: 'brl',     total: 'sum' },
        { header: tr('analytics.colCost'),        key: 'cost',        type: 'brl',     total: 'sum' },
        { header: tr('analytics.colGrossProfit'), key: 'grossProfit', type: 'brl',     total: 'sum' },
        { header: tr('analytics.colNetProfit'),   key: 'netProfit',   type: 'brl',     total: 'sum' },
        {
          header: tr('analytics.colMargin'), key: 'margin', type: 'percent',
          total: 'weightedAvg', numKey: 'netProfit', denKey: 'revenue',
          toneFn: r => marginTone(r.margin),
        },
      ],
      rows: this.productRanking(),
    };
  }

  private categoriesSheetSpec(): SheetSpec<CategoryStat> {
    const marginTone = (m: number) => this.marginTone(m);
    const tr = (key: string) => this.t.instant(key);
    return {
      name: tr('analytics.tabCategory'),
      title: tr('analytics.categoryStatsTitle'),
      columns: [
        { header: tr('analytics.colCategory'),     key: 'category',    type: 'text' },
        { header: tr('analytics.colBatches'),      key: 'batches',     type: 'int',     total: 'sum' },
        { header: tr('analytics.colInvested'),     key: 'invested',    type: 'brl',     total: 'sum' },
        { header: tr('analytics.colIdleCapital'),  key: 'idleCapital', type: 'brl',     total: 'sum' },
        { header: tr('analytics.colGrossRevenue'), key: 'revenue',     type: 'brl',     total: 'sum' },
        { header: tr('analytics.colNetProfit'),    key: 'profit',      type: 'brl',     total: 'sum' },
        {
          header: tr('analytics.colMargin'), key: 'margin', type: 'percent',
          total: 'weightedAvg', numKey: 'profit', denKey: 'revenue',
          toneFn: r => marginTone(r.margin),
        },
      ],
      rows: this.categoryStats(),
    };
  }

  private monthlySheetSpec(): SheetSpec<MonthStat> {
    const marginTone = (m: number) => this.marginTone(m);
    const tr = (key: string) => this.t.instant(key);
    return {
      name: tr('analytics.tabMonthly'),
      title: tr('analytics.monthlyTitle'),
      columns: [
        { header: tr('analytics.colMonth'),       key: 'month',      type: 'text' },
        { header: tr('analytics.colSales'),       key: 'qty',        type: 'int',     total: 'sum' },
        { header: tr('analytics.colGrossRevenue'), key: 'revenue',   type: 'brl',     total: 'sum' },
        { header: tr('analytics.colFees'),        key: 'fees',       type: 'brl',     total: 'sum' },
        { header: tr('analytics.colNetRevenue'),  key: 'netRevenue', type: 'brl',     total: 'sum' },
        { header: tr('analytics.colCost'),        key: 'cost',       type: 'brl',     total: 'sum' },
        { header: tr('analytics.colNetProfit'),   key: 'profit',     type: 'brl',     total: 'sum' },
        {
          header: tr('analytics.colMargin'), key: 'margin', type: 'percent',
          total: 'weightedAvg', numKey: 'profit', denKey: 'revenue',
          toneFn: r => marginTone(r.margin),
        },
      ],
      rows: this.monthlyStats(),
    };
  }

  private idleSheetSpec(): SheetSpec<ComputedPurchase> {
    const tr = (key: string) => this.t.instant(key);
    return {
      name: tr('analytics.tabIdle'),
      title: tr('analytics.idleTitle'),
      columns: [
        { header: tr('analytics.colId'),          key: 'id',             type: 'text' },
        { header: tr('analytics.colProduct'),     key: 'product',        type: 'text' },
        { header: tr('analytics.colStock'),       key: 'currentStock',   type: 'int',  total: 'sum' },
        { header: tr('analytics.colUnitCost'),    key: 'actualUnitCost', type: 'brl' },
        { header: tr('analytics.colIdleCapital'), key: 'idleValue',      type: 'brl',  total: 'sum' },
        { header: tr('analytics.colDaysIdle'),    key: 'daysInStock',    type: 'int' },
        { header: tr('analytics.colStatus'),      key: 'status',         type: 'text', bgFn: r => this.statusBg(r.status) },
      ],
      rows: this.idleInventory(),
    };
  }

  private resumoSpec(): ResumoSpec {
    const k = this.kpis();
    const tr = (key: string) => this.t.instant(key);
    return {
      title: tr('analytics.exportTitle'),
      generatedAt: new Date(),
      blocks: [
        {
          title: tr('analytics.resInvestment'),
          rows: [
            { label: tr('analytics.investedInPurchases'), value: k.totalInvested,  kind: 'brl' },
            { label: tr('analytics.idleCapital'),         value: k.idleCapital,    kind: 'brl' },
            { label: tr('analytics.totalBatches'),        value: k.totalBatches,   kind: 'count' },
            { label: tr('analytics.batchesInStock'),      value: k.batchesInStock, kind: 'count' },
          ],
        },
        {
          title: tr('analytics.resResult'),
          rows: [
            { label: tr('analytics.grossRevenue'), value: k.grossRevenue, kind: 'brl' },
            { label: tr('analytics.netRevenue'),   value: k.netRevenue,   kind: 'brl' },
            { label: tr('analytics.grossProfit'),  value: k.grossProfit,  kind: 'brl' },
            { label: tr('analytics.netProfit'),    value: k.netProfit,    kind: 'brl' },
          ],
        },
        {
          title: tr('analytics.resEfficiency'),
          rows: [
            { label: tr('analytics.feesPaid'),       value: k.totalFees,      kind: 'brl' },
            { label: tr('analytics.totalDiscounts'), value: k.totalDiscounts, kind: 'brl' },
            { label: tr('analytics.avgTicket'),      value: k.averageTicket,  kind: 'brl' },
            { label: tr('analytics.netMargin'),      value: k.netMargin,      kind: 'percent' },
          ],
        },
      ],
    };
  }

  private marginTone(margin: number): Tone {
    if (margin < 0) return 'danger';
    const cfg = this.data.settings();
    if (cfg && margin < cfg.minimumMargin) return 'warning';
    return 'success';
  }

  private statusBg(status: InventoryStatus): string | undefined {
    switch (status) {
      case 'Em Estoque':  return 'DCFCE7';
      case 'Vendido':     return 'E5E7EB';
      case 'Atenção':     return 'FEF3C7';
      case 'Parado':      return 'FEE2E2';
      case 'Em trânsito': return 'DBEAFE';
      default:            return undefined;
    }
  }

  private today(): string {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
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
