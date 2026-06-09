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
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { DataService } from '../../core/services/data.service';
import { ThemeService } from '../../core/services/theme.service';
import { LanguageService } from '../../core/services/language.service';
import { CHART_COLORS } from '../../core/constants/app.constants';
import { PageHeaderComponent } from '../../shared/components/page-header.component';
import { KpiCardComponent } from '../../shared/components/kpi-card.component';
import { EmptyStateComponent } from '../../shared/components/empty-state.component';
import { SkeletonComponent } from '../../shared/components/skeleton.component';
import { BrlPipe } from '../../shared/pipes/brl.pipe';
import { ComputedSale } from '../../core/models/models';

type RangeKey = '7d' | '30d' | '90d' | '12m' | 'all' | 'custom';

interface RangeOption { key: RangeKey; labelKey: string; }

interface WaterfallStep {
  label: string;
  value: number;
  tone: 'neutral' | 'success' | 'warning' | 'brand' | 'danger';
  kind: 'cost' | 'gain' | 'subtotal' | 'total';
}

const RANGE_OPTIONS: RangeOption[] = [
  { key: '7d',  labelKey: 'dashboard.range7d' },
  { key: '30d', labelKey: 'dashboard.range30d' },
  { key: '90d', labelKey: 'dashboard.range90d' },
  { key: '12m', labelKey: 'dashboard.range12m' },
  { key: 'all', labelKey: 'dashboard.rangeAll' },
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
    TranslateModule,
  ],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
})
export class DashboardComponent {
  protected readonly dataService = inject(DataService);
  private readonly themeService = inject(ThemeService);
  private readonly t = inject(TranslateService);
  private readonly lang = inject(LanguageService);

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
    const totalShipping = sales.reduce((s, v) => s + (v.shippingType === 'flex' ? 0 : v.sellerShipping), 0);
    const totalFlexRefund = sales.reduce((s, v) => s + (v.shippingType === 'flex' ? (v.flexRefund ?? 0) : 0), 0);
    const totalDiscounts = sales.reduce((s, v) => s + v.discount, 0);
    const totalOtherCosts = sales.reduce((s, v) => s + v.otherCosts, 0);
    const totalSold = sales.reduce((s, v) => s + v.quantitySold, 0);
    const netMargin = grossRevenue > 0 ? netProfit / grossRevenue : 0;
    const averageTicket = sales.length > 0 ? grossRevenue / sales.length : 0;
    return {
      grossRevenue, netRevenue, totalFees, netProfit, grossProfit,
      proportionalCost, totalShipping, totalFlexRefund, totalDiscounts, totalOtherCosts,
      totalSold, netMargin, averageTicket,
      salesCount: sales.length,
    };
  });

  /** Paleta dinâmica conforme tema atual. */
  protected readonly palette = computed(() =>
    this.themeService.isDark() ? CHART_COLORS.dark : CHART_COLORS.light
  );

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

  /** Hero chart — monthly evolution. */
  protected readonly monthlyChart = computed<ChartConfiguration<'line'>['data']>(() => {
    this.lang.lang(); // re-evaluate labels when the language changes
    const months = this.t.instant('dashboard.months') as string[];
    const sales = this.periodSales();
    const byMonth = new Map<string, { label: string; net: number; profit: number }>();

    for (const v of sales) {
      const d = new Date(v.saleDate);
      const year = d.getUTCFullYear();
      const month = d.getUTCMonth();
      const key = `${year}${String(month).padStart(2, '0')}`;
      const label = `${months[month]}/${String(year).slice(2)}`;
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
          label: this.t.instant('dashboard.netRevenue'),
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
          label: this.t.instant('dashboard.netProfit'),
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
    this.lang.lang(); // re-evaluate labels when the language changes
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
        label: this.t.instant('dashboard.netProfit'),
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

  /** Número de meses no gráfico hero — dirige a largura do scroll horizontal. */
  protected readonly monthCount = computed(() =>
    this.monthlyChart().labels?.length ?? 0
  );

  /** Largura dinâmica do canvas: ~90px por mês para os rótulos não se sobreporem; rola quando há muitos meses. */
  protected readonly monthlyChartWidth = computed(() => this.monthCount() * 90);

  /** Doughnut — revenue composition. */
  protected readonly compositionChart = computed<ChartConfiguration<'doughnut'>['data']>(() => {
    this.lang.lang(); // re-evaluate labels when the language changes
    const k = this.periodKpis();
    const c = this.palette();
    return {
      labels: [
        this.t.instant('dashboard.compNetProfit'),
        this.t.instant('dashboard.compFees'),
        this.t.instant('dashboard.compShipping'),
        this.t.instant('dashboard.compDiscounts'),
        this.t.instant('dashboard.compOtherCosts'),
        this.t.instant('dashboard.compProductCost'),
      ],
      datasets: [{
        data: [
          Math.max(0, k.netProfit),
          k.totalFees,
          k.totalShipping,
          k.totalDiscounts,
          k.totalOtherCosts,
          Math.max(0, k.proportionalCost),
        ],
        backgroundColor: [c.success, c.warning, c.info, c.danger, c.neutral, c.brand],
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
  protected readonly waterfall = computed<WaterfallStep[]>(() => {
    this.lang.lang(); // re-evaluate labels when the language changes
    const k = this.periodKpis();
    const totalInvested = this.dataService.kpis().totalInvested;
    const steps: WaterfallStep[] = [
      { label: this.t.instant('dashboard.wfInvested'),     value: totalInvested,    tone: 'neutral', kind: 'cost' },
      { label: this.t.instant('dashboard.wfGrossRevenue'), value: k.grossRevenue,   tone: 'success', kind: 'gain' },
      { label: this.t.instant('dashboard.compFees'),       value: -k.totalFees,     tone: 'warning', kind: 'cost' },
      { label: this.t.instant('dashboard.compShipping'),   value: -k.totalShipping, tone: 'warning', kind: 'cost' },
    ];
    if (k.totalFlexRefund > 0) {
      steps.push({ label: this.t.instant('dashboard.wfFlexRefund'), value: k.totalFlexRefund, tone: 'success', kind: 'gain' });
    }
    steps.push({ label: this.t.instant('dashboard.compDiscounts'), value: -k.totalDiscounts, tone: 'warning', kind: 'cost' });
    if (k.totalOtherCosts > 0) {
      steps.push({ label: this.t.instant('dashboard.wfOtherCosts'), value: -k.totalOtherCosts, tone: 'warning', kind: 'cost' });
    }
    steps.push(
      { label: this.t.instant('dashboard.wfNetRevenue'),   value: k.netRevenue,        tone: 'brand',  kind: 'subtotal' },
      { label: this.t.instant('dashboard.wfProductCost'),  value: -k.proportionalCost, tone: 'danger', kind: 'cost' },
      { label: this.t.instant('dashboard.wfNetProfit'),    value: k.netProfit,         tone: k.netProfit >= 0 ? 'success' : 'danger', kind: 'total' },
    );
    return steps;
  });

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
    this.lang.lang(); // re-evaluate labels when the language changes
    const k = this.periodKpis();
    const c = this.palette();
    const total = Math.max(0, k.netProfit) + k.totalFees + k.totalShipping + k.totalDiscounts + k.totalOtherCosts + Math.max(0, k.proportionalCost);
    const items = [
      { label: this.t.instant('dashboard.wfNetProfit'),    value: Math.max(0, k.netProfit),        color: c.success },
      { label: this.t.instant('dashboard.compFees'),       value: k.totalFees,                     color: c.warning },
      { label: this.t.instant('dashboard.compShipping'),   value: k.totalShipping,                 color: c.info },
      { label: this.t.instant('dashboard.compDiscounts'),  value: k.totalDiscounts,                color: c.danger },
      { label: this.t.instant('dashboard.wfOtherCosts'),   value: k.totalOtherCosts,               color: c.neutral },
      { label: this.t.instant('dashboard.wfProductCost'),  value: Math.max(0, k.proportionalCost), color: c.brand },
    ];
    return items.map(it => ({ ...it, pct: total > 0 ? (it.value / total) * 100 : 0 }));
  });

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
    this.lang.lang(); // re-evaluate when the language changes
    if (r === 'custom' && this.customStart() && this.customEnd()) {
      return `${this.t.instant('dashboard.customUpper')} · ${this.customRangeLabel()}`;
    }
    const opt = RANGE_OPTIONS.find(o => o.key === r);
    return opt ? (this.t.instant(opt.labelKey) as string).toUpperCase() : '';
  }

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
