import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { BaseChartDirective } from 'ng2-charts';
import type { ChartConfiguration } from 'chart.js';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { DataService } from '../../core/services/data.service';
import { ThemeService } from '../../core/services/theme.service';
import { CHART_COLORS } from '../../core/constants/app.constants';
import { PageHeaderComponent } from '../../shared/components/page-header.component';
import { KpiCardComponent } from '../../shared/components/kpi-card.component';
import { EmptyStateComponent } from '../../shared/components/empty-state.component';
import { SkeletonComponent } from '../../shared/components/skeleton.component';
import { BrlPipe } from '../../shared/pipes/brl.pipe';
import { ComputedSale } from '../../core/models/models';

const MONTHS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

type RangeKey = '7d' | '30d' | '90d' | '12m' | 'all' | 'custom';

interface RangeOption { key: RangeKey; label: string; }

const RANGE_OPTIONS: RangeOption[] = [
  { key: '7d',  label: '7 dias' },
  { key: '30d', label: '30 dias' },
  { key: '90d', label: '90 dias' },
  { key: '12m', label: '12 meses' },
  { key: 'all', label: 'Tudo' },
];

@Component({
  selector: 'app-dashboard',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule, RouterLink, BaseChartDirective,
    MatIconModule, MatButtonModule, MatTooltipModule,
    MatFormFieldModule, MatInputModule, MatDatepickerModule,
    PageHeaderComponent, KpiCardComponent, EmptyStateComponent, SkeletonComponent, BrlPipe,
  ],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
})
export class DashboardComponent {
  protected readonly dataService = inject(DataService);
  private readonly themeService = inject(ThemeService);

  protected readonly rangeOptions = RANGE_OPTIONS;
  protected readonly range = signal<RangeKey>('30d');
  protected readonly customStart = signal<Date | null>(null);
  protected readonly customEnd = signal<Date | null>(null);
  protected readonly today = new Date();

  /** All completed sales — unfiltered base. */
  private readonly allSales = computed(() =>
    this.dataService.computedSales().filter(s => s.status === 'Concluída')
  );

  /** Bounds [start, end] for the active range, or null for "all" or incomplete custom. */
  protected readonly rangeBounds = computed<{ start: Date; end: Date } | null>(() => {
    const r = this.range();
    if (r === 'custom') {
      const s = this.customStart();
      const e = this.customEnd();
      if (!s || !e) return null;
      const start = new Date(s); start.setHours(0, 0, 0, 0);
      const end = new Date(e); end.setHours(23, 59, 59, 999);
      return { start, end };
    }
    if (r === 'all') return null;
    const end = new Date(); end.setHours(23, 59, 59, 999);
    const start = new Date(); start.setHours(0, 0, 0, 0);
    switch (r) {
      case '7d':  start.setDate(start.getDate() - 7); break;
      case '30d': start.setDate(start.getDate() - 30); break;
      case '90d': start.setDate(start.getDate() - 90); break;
      case '12m': start.setMonth(start.getMonth() - 12); break;
    }
    return { start, end };
  });

  /** Period-filtered sales. */
  protected readonly periodSales = computed(() => {
    const bounds = this.rangeBounds();
    if (!bounds) return this.allSales();
    return this.allSales().filter(s => {
      const d = new Date(s.saleDate);
      return d >= bounds.start && d <= bounds.end;
    });
  });

  /** Compact label for the custom pill (DD/MM – DD/MM). */
  protected readonly customRangeLabel = computed(() => {
    const s = this.customStart();
    const e = this.customEnd();
    if (!s || !e) return '';
    const fmt = (d: Date) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
    return `${fmt(s)} – ${fmt(e)}`;
  });

  protected readonly hasData = computed(() =>
    this.dataService.sales().length > 0 || this.dataService.purchases().length > 0
  );

  /** Period-aware KPIs (idleCapital and investment remain global; revenues filter by sales date). */
  protected readonly periodKpis = computed(() => {
    const sales = this.periodSales();
    const grossRevenue = sales.reduce((s, v) => s + v.grossRevenue, 0);
    const netRevenue = sales.reduce((s, v) => s + v.netRevenue, 0);
    const totalFees = sales.reduce((s, v) => s + v.feeAmount, 0);
    const netProfit = sales.reduce((s, v) => s + v.netProfit, 0);
    const grossProfit = sales.reduce((s, v) => s + v.grossProfit, 0);
    const proportionalCost = sales.reduce((s, v) => s + v.proportionalCost, 0);
    const totalShipping = sales.reduce((s, v) => s + v.sellerShipping, 0);
    const totalDiscounts = sales.reduce((s, v) => s + v.discount, 0);
    const totalSold = sales.reduce((s, v) => s + v.quantitySold, 0);
    const netMargin = grossRevenue > 0 ? netProfit / grossRevenue : 0;
    const averageTicket = sales.length > 0 ? grossRevenue / sales.length : 0;
    return {
      grossRevenue, netRevenue, totalFees, netProfit, grossProfit,
      proportionalCost, totalShipping, totalDiscounts, totalSold, netMargin, averageTicket,
      salesCount: sales.length,
    };
  });

  /** Paleta dinâmica conforme tema atual. */
  protected readonly palette = computed(() =>
    this.themeService.isDark() ? CHART_COLORS.dark : CHART_COLORS.light
  );

  // ────────────────────────────────────────────────────────
  // SPARKLINES (period-aware) for KPI cards
  // ────────────────────────────────────────────────────────
  protected readonly profitSpark = computed(() => this.buildSparkline(s => s.netProfit));
  protected readonly revenueSpark = computed(() => this.buildSparkline(s => s.grossRevenue));
  protected readonly feesSpark = computed(() => this.buildSparkline(s => s.feeAmount));
  protected readonly marginSpark = computed(() => {
    const sales = this.periodSales();
    if (sales.length < 2) return [];
    const days = this.bucketCount();
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    const points: number[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const end = new Date(today);
      end.setDate(end.getDate() - i);
      const upTo = sales.filter(s => new Date(s.saleDate) <= end);
      const gross = upTo.reduce((acc, s) => acc + s.grossRevenue, 0);
      const profit = upTo.reduce((acc, s) => acc + s.netProfit, 0);
      points.push(gross > 0 ? profit / gross : 0);
    }
    return points;
  });

  // ────────────────────────────────────────────────────────
  // CHARTS — period-aware
  // ────────────────────────────────────────────────────────

  /** Hero chart — monthly evolution. */
  protected readonly monthlyChart = computed<ChartConfiguration<'line'>['data']>(() => {
    const sales = this.periodSales();
    const byMonth = new Map<string, { label: string; net: number; profit: number }>();

    for (const v of sales) {
      const d = new Date(v.saleDate);
      const year = d.getUTCFullYear();
      const month = d.getUTCMonth();
      const key = `${year}${String(month).padStart(2, '0')}`;
      const label = `${MONTHS[month]}/${String(year).slice(2)}`;
      const entry = byMonth.get(key) ?? { label, net: 0, profit: 0 };
      entry.net += v.netRevenue;
      entry.profit += v.netProfit;
      byMonth.set(key, entry);
    }

    const sorted = [...byMonth.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    if (sorted.length === 0) return { labels: [], datasets: [] };

    const c = this.palette();
    return {
      labels: sorted.map(([, e]) => e.label),
      datasets: [
        {
          label: 'Receita Líquida',
          data: sorted.map(([, e]) => e.net),
          borderColor: c.brand,
          backgroundColor: hexToRgba(c.brand, 0.10),
          borderWidth: 2,
          tension: 0.35,
          fill: true,
          pointBackgroundColor: c.brand,
          pointBorderColor: c.surface,
          pointBorderWidth: 2,
          pointRadius: 4,
          pointHoverRadius: 6,
        },
        {
          label: 'Lucro Líquido',
          data: sorted.map(([, e]) => e.profit),
          borderColor: c.success,
          backgroundColor: hexToRgba(c.success, 0.10),
          borderWidth: 2,
          tension: 0.35,
          fill: true,
          pointBackgroundColor: c.success,
          pointBorderColor: c.surface,
          pointBorderWidth: 2,
          pointRadius: 4,
          pointHoverRadius: 6,
        },
      ],
    };
  });

  /** Bar — profit by product (all products in period, with internal scroll). */
  protected readonly productProfitChart = computed<ChartConfiguration<'bar'>['data']>(() => {
    const sales = this.periodSales();
    const map = new Map<string, number>();
    for (const v of sales) {
      map.set(v.product, (map.get(v.product) ?? 0) + v.netProfit);
    }
    const arr = [...map.entries()].sort((a, b) => b[1] - a[1]);
    const c = this.palette();

    return {
      labels: arr.map(([p]) => (p.length > 26 ? p.substring(0, 24) + '…' : p)),
      datasets: [{
        label: 'Lucro Líquido',
        data: arr.map(([, v]) => v),
        backgroundColor: arr.map(([, v]) => v >= 0 ? hexToRgba(c.success, 0.85) : hexToRgba(c.danger, 0.85)),
        borderColor: arr.map(([, v]) => v >= 0 ? c.success : c.danger),
        borderWidth: 0,
        borderRadius: 6,
        barThickness: 14,
      }],
    };
  });

  /** Number of products in the chart — drives the subtitle and the scroll height. */
  protected readonly productCount = computed(() =>
    this.productProfitChart().labels?.length ?? 0
  );

  /** Dynamic canvas height: keeps every bar at ~36px so nothing overlaps. */
  protected readonly productChartHeight = computed(() => {
    const n = this.productCount();
    if (n === 0) return 280;
    return Math.max(280, n * 36 + 50);
  });

  /** Doughnut — revenue composition. */
  protected readonly compositionChart = computed<ChartConfiguration<'doughnut'>['data']>(() => {
    const k = this.periodKpis();
    const c = this.palette();
    return {
      labels: ['Lucro Líq.', 'Taxas ML', 'Frete', 'Descontos', 'Custo Produtos'],
      datasets: [{
        data: [
          Math.max(0, k.netProfit),
          k.totalFees,
          k.totalShipping,
          k.totalDiscounts,
          Math.max(0, k.proportionalCost),
        ],
        backgroundColor: [c.success, c.warning, c.info, c.danger, c.brand],
        borderColor: c.surface,
        borderWidth: 3,
        spacing: 2,
      }],
    };
  });

  /** All batches with idle capital, sorted desc. Rendered inside a scrollable list. */
  protected readonly idleRanking = computed(() =>
    this.dataService.computedPurchases()
      .filter(c => c.idleValue > 0)
      .sort((a, b) => b.idleValue - a.idleValue)
  );

  protected readonly maxIdle = computed(() => {
    const list = this.idleRanking();
    if (list.length === 0) return 0;
    return Math.max(...list.map(b => b.idleValue));
  });

  /** Waterfall steps. Used in HTML for horizontal cascade. */
  protected readonly waterfall = computed(() => {
    const k = this.periodKpis();
    const totalInvested = this.dataService.kpis().totalInvested;
    return [
      { label: 'Investido',      value: totalInvested,       tone: 'neutral' as const, kind: 'cost' as const },
      { label: 'Receita bruta',  value: k.grossRevenue,      tone: 'success' as const, kind: 'gain' as const },
      { label: 'Taxas ML',       value: -k.totalFees,        tone: 'warning' as const, kind: 'cost' as const },
      { label: 'Frete',          value: -k.totalShipping,    tone: 'warning' as const, kind: 'cost' as const },
      { label: 'Descontos',      value: -k.totalDiscounts,   tone: 'warning' as const, kind: 'cost' as const },
      { label: 'Receita líq.',   value: k.netRevenue,        tone: 'brand' as const,   kind: 'subtotal' as const },
      { label: 'Custo produtos', value: -k.proportionalCost, tone: 'danger' as const,  kind: 'cost' as const },
      { label: 'Lucro líq.',     value: k.netProfit,         tone: k.netProfit >= 0 ? 'success' as const : 'danger' as const, kind: 'total' as const },
    ];
  });

  // ────────────────────────────────────────────────────────
  // CHART OPTIONS
  // ────────────────────────────────────────────────────────
  protected readonly lineOptions = computed<ChartConfiguration<'line'>['options']>(() => {
    const c = this.palette();
    return {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          position: 'top',
          align: 'end',
          labels: {
            color: c.textSec,
            usePointStyle: true,
            pointStyle: 'circle',
            padding: 16,
            font: { family: 'Inter', size: 12, weight: 500 },
          },
        },
        tooltip: this.tooltipOpts(),
      },
      scales: {
        x: {
          ticks: { color: c.textSec, font: { size: 11, family: 'Inter' } },
          grid: { color: c.grid, drawTicks: false },
          border: { display: false },
        },
        y: {
          ticks: {
            color: c.textSec,
            font: { size: 11, family: 'Inter' },
            callback: (v) => formatShort(Number(v)),
          },
          grid: { color: c.grid, drawTicks: false },
          border: { display: false },
        },
      },
    };
  });

  protected readonly horizontalBarOptions = computed<ChartConfiguration<'bar'>['options']>(() => {
    const c = this.palette();
    return {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: this.tooltipOpts(),
      },
      scales: {
        x: {
          ticks: {
            color: c.textSec,
            font: { size: 11, family: 'Inter' },
            callback: (v) => formatShort(Number(v)),
          },
          grid: { color: c.grid, drawTicks: false },
          border: { display: false },
        },
        y: {
          ticks: { color: c.textSec, font: { size: 11, family: 'Inter' } },
          grid: { display: false },
          border: { display: false },
        },
      },
    };
  });

  protected readonly doughnutOptions = computed<ChartConfiguration<'doughnut'>['options']>(() => {
    const c = this.palette();
    return {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '68%',
      plugins: {
        legend: { display: false },
        tooltip: {
          ...this.tooltipOpts(),
          callbacks: {
            label: (ctx) => {
              const val = ctx.raw as number;
              return ` ${ctx.label}: ${formatCurrency(val)}`;
            },
          },
        },
      },
    } as ChartConfiguration<'doughnut'>['options'];
  });

  /** Composition legend items (inline chips below doughnut). */
  protected readonly compositionLegend = computed(() => {
    const k = this.periodKpis();
    const c = this.palette();
    const total = Math.max(0, k.netProfit) + k.totalFees + k.totalShipping + k.totalDiscounts + Math.max(0, k.proportionalCost);
    const items = [
      { label: 'Lucro líq.',     value: Math.max(0, k.netProfit),       color: c.success },
      { label: 'Taxas ML',       value: k.totalFees,                    color: c.warning },
      { label: 'Frete',          value: k.totalShipping,                color: c.info },
      { label: 'Descontos',      value: k.totalDiscounts,               color: c.danger },
      { label: 'Custo produtos', value: Math.max(0, k.proportionalCost), color: c.brand },
    ];
    return items.map(it => ({ ...it, pct: total > 0 ? (it.value / total) * 100 : 0 }));
  });

  // ────────────────────────────────────────────────────────
  // Actions
  // ────────────────────────────────────────────────────────
  protected setRange(r: RangeKey): void {
    this.range.set(r);
  }

  /** Called when the date-range picker closes. Only commits if both dates are set. */
  protected onPickerClosed(): void {
    if (this.customStart() && this.customEnd()) {
      this.range.set('custom');
    }
  }

  protected rangeLabel(r: RangeKey): string {
    if (r === 'custom' && this.customStart() && this.customEnd()) {
      return `PERSONALIZADO · ${this.customRangeLabel()}`;
    }
    return RANGE_OPTIONS.find(o => o.key === r)?.label.toUpperCase() ?? '';
  }

  // ────────────────────────────────────────────────────────
  // Helpers
  // ────────────────────────────────────────────────────────

  /** Number of buckets used by sparklines. Adapts to range length. */
  private bucketCount(): number {
    const r = this.range();
    if (r === '7d') return 7;
    if (r === 'custom') {
      const b = this.rangeBounds();
      if (!b) return 30;
      const days = Math.floor((b.end.getTime() - b.start.getTime()) / 86400000);
      return Math.max(7, Math.min(30, days));
    }
    return 30;
  }

  private buildSparkline(picker: (s: ComputedSale) => number): number[] {
    const sales = this.periodSales();
    if (sales.length < 2) return [];
    const bounds = this.rangeBounds();
    if (!bounds) return [];
    const days = this.bucketCount();
    const totalSpan = bounds.end.getTime() - bounds.start.getTime();
    if (totalSpan <= 0) return [];
    const bucketSpan = totalSpan / days;
    const points: number[] = [];
    let acc = 0;
    for (let i = 0; i < days; i++) {
      const bStart = new Date(bounds.start.getTime() + bucketSpan * i);
      const bEnd = new Date(bounds.start.getTime() + bucketSpan * (i + 1));
      const bucketVal = sales
        .filter(s => {
          const d = new Date(s.saleDate);
          return d >= bStart && d <= bEnd;
        })
        .reduce((sum, s) => sum + picker(s), 0);
      acc += bucketVal;
      points.push(acc);
    }
    return points;
  }

  private tooltipOpts() {
    const c = this.palette();
    const dark = this.themeService.isDark();
    return {
      backgroundColor: dark ? '#0E0F12' : '#FFFFFF',
      titleColor: c.text,
      bodyColor: c.text,
      borderColor: c.grid,
      borderWidth: 1,
      padding: 12,
      cornerRadius: 10,
      titleFont: { family: 'Inter', size: 12, weight: 600 },
      bodyFont: { family: 'Inter', size: 12 },
      boxPadding: 6,
      usePointStyle: true,
      callbacks: {
        label: (ctx: { dataset: { label?: string }; raw: unknown }) => {
          const v = ctx.raw as number;
          return ` ${ctx.dataset.label ?? ''}: ${formatCurrency(v)}`;
        },
      },
    };
  }
}

// ──────────────────────────────────────────────────────────
// Pure helpers
// ──────────────────────────────────────────────────────────

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
  }).format(value);
}

function formatShort(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return 'R$ ' + (value / 1_000_000).toFixed(1) + 'M';
  if (abs >= 1_000) return 'R$ ' + (value / 1_000).toFixed(0) + 'k';
  return 'R$ ' + value.toFixed(0);
}

function hexToRgba(hex: string, alpha: number): string {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
