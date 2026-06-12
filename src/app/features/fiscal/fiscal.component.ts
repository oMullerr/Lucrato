import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { BaseChartDirective } from 'ng2-charts';
import type { ChartConfiguration, ChartData } from 'chart.js';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatInputModule } from '@angular/material/input';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { DataService } from '../../core/services/data.service';
import { ThemeService } from '../../core/services/theme.service';
import { LanguageService } from '../../core/services/language.service';
import { NotifyService } from '../../core/services/notify.service';
import { CHART_COLORS } from '../../core/constants/app.constants';
import { PageHeaderComponent } from '../../shared/components/page-header.component';
import { KpiCardComponent } from '../../shared/components/kpi-card.component';
import { EmptyStateComponent } from '../../shared/components/empty-state.component';
import { SkeletonComponent } from '../../shared/components/skeleton.component';
import { BrlPipe } from '../../shared/pipes/brl.pipe';
import { computeFiscalStatus, availableYears, dasSchedule, dasnReminder } from '../../core/fiscal/fiscal';
import {
  FiscalActivity, FiscalRegimeId, DasMonth, DasMonthStatus, DasnReminder, DasnStatus,
} from '../../core/fiscal/fiscal.model';

interface AlertView {
  tone: 'ok' | 'warning' | 'danger' | 'over';
  icon: string;
  titleKey: string;
  messageKey: string;
  params: Record<string, string>;
}

interface ForecastView {
  icon: string;
  key: string;
  params: Record<string, string>;
  tone: 'ok' | 'danger';
}

const REGIME_OPTIONS: FiscalRegimeId[] = ['MEI', 'none'];
const ACTIVITY_OPTIONS: FiscalActivity[] = ['commerce', 'services', 'mixed'];

@Component({
  selector: 'app-fiscal',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink, BaseChartDirective,
    MatIconModule, MatButtonModule, MatTooltipModule,
    MatFormFieldModule, MatSelectModule, MatInputModule, MatDatepickerModule,
    PageHeaderComponent, KpiCardComponent, EmptyStateComponent, SkeletonComponent, BrlPipe,
    TranslateModule,
  ],
  templateUrl: './fiscal.component.html',
  styleUrl: './fiscal.component.scss',
})
export class FiscalComponent {
  protected readonly data = inject(DataService);
  private readonly theme = inject(ThemeService);
  private readonly t = inject(TranslateService);
  private readonly lang = inject(LanguageService);
  private readonly notify = inject(NotifyService);

  protected readonly regimeOptions = REGIME_OPTIONS;
  protected readonly activityOptions = ACTIVITY_OPTIONS;
  protected readonly today = new Date();

  protected readonly config = this.data.fiscalConfig;
  protected readonly selectedYear = signal(new Date().getUTCFullYear());

  protected readonly years = computed(() => availableYears(this.data.computedSales()));

  protected readonly completedCount = computed(() =>
    this.data.computedSales().filter(s => s.status === 'Concluída').length
  );
  protected readonly hasData = computed(() => this.completedCount() > 0);

  /** Status fiscal do ano selecionado. */
  protected readonly status = computed(() =>
    computeFiscalStatus(this.config(), this.data.computedSales(), this.selectedYear())
  );

  protected readonly hasRegime = computed(() => this.config().regime !== 'none');

  /** Valor (Date) para o datepicker a partir do ISO salvo. */
  protected readonly startDateValue = computed(() => {
    const iso = this.config().regimeStartDate;
    return iso ? new Date(iso + 'T00:00:00') : null;
  });

  /** Largura da barra de progresso (limitada a 100%). */
  protected readonly progressPct = computed(() => Math.min(100, this.status().usagePct * 100));

  /** Bloco de alerta conforme a banda atual. */
  protected readonly alert = computed<AlertView>(() => {
    this.lang.lang(); // recomputa rótulos ao trocar idioma
    const s = this.status();
    const p = {
      pct: (s.usagePct * 100).toFixed(0),
      ceiling: this.brl(s.ceiling),
      remaining: this.brl(s.remaining),
      revenue: this.brl(s.revenue),
      over: this.brl(s.overBy),
      projected: this.brl(s.projectedAnnual),
    };
    if (s.band === 'over') {
      const hard = s.revenue > s.toleranceCeiling;
      return {
        tone: 'over',
        icon: hard ? 'gpp_bad' : 'report',
        titleKey: hard ? 'fiscal.statusOverHardTitle' : 'fiscal.statusOverTitle',
        messageKey: hard ? 'fiscal.statusOverHardMsg' : 'fiscal.statusOverMsg',
        params: p,
      };
    }
    if (s.band === 'danger') {
      return { tone: 'danger', icon: 'warning', titleKey: 'fiscal.statusDangerTitle', messageKey: 'fiscal.statusDangerMsg', params: p };
    }
    if (s.band === 'warning') {
      return { tone: 'warning', icon: 'trending_up', titleKey: 'fiscal.statusWarnTitle', messageKey: 'fiscal.statusWarnMsg', params: p };
    }
    return { tone: 'ok', icon: 'check_circle', titleKey: 'fiscal.statusOkTitle', messageKey: 'fiscal.statusOkMsg', params: p };
  });

  /** Variant do KPI de faturamento/disponível conforme a banda. */
  protected readonly bandVariant = computed(() => {
    switch (this.status().band) {
      case 'over': return 'danger';
      case 'danger': return 'danger';
      case 'warning': return 'warning';
      default: return 'brand';
    }
  });

  protected readonly palette = computed(() =>
    this.theme.isDark() ? CHART_COLORS.dark : CHART_COLORS.light
  );

  /** Nota dinâmica do card de DAS (INSS + adicional fixo, aproximado). */
  protected readonly dasNote = computed(() => {
    this.lang.lang();
    const tax = this.status().tax;
    if (!tax) return '';
    return this.t.instant('fiscal.dasNote', { inss: this.brl(tax.inss) });
  });

  /** Nomes dos meses (reativos ao idioma). */
  protected readonly monthNames = computed<string[]>(() => {
    this.lang.lang();
    return this.t.instant('dashboard.months') as string[];
  });

  /** Previsão de estouro do teto — linha do rodapé do hero. */
  protected readonly forecastView = computed<ForecastView>(() => {
    this.lang.lang();
    const s = this.status();
    const params: Record<string, string> =
      s.projectedHitsCeiling && s.ceilingHitDate ? { when: this.formatMonthYear(s.ceilingHitDate) } : {};
    if (s.band === 'over') {
      return { icon: 'block', key: 'fiscal.forecastOver', params, tone: 'danger' };
    }
    if (s.projectedHitsCeiling && s.ceilingHitDate) {
      return { icon: 'event_busy', key: 'fiscal.forecastWillHit', params, tone: 'danger' };
    }
    return { icon: 'event_available', key: 'fiscal.forecastSafe', params, tone: 'ok' };
  });

  /** Agenda do DAS do ano selecionado. */
  protected readonly dasMonths = computed<DasMonth[]>(() =>
    dasSchedule(this.config(), this.selectedYear(), this.data.dasPaidMonths())
  );

  /** Resumo do DAS: pagos/total (meses ativos) e atrasados. */
  protected readonly dasSummary = computed(() => {
    const active = this.dasMonths().filter(m => m.status !== 'inactive');
    return {
      paid: active.filter(m => m.status === 'paid').length,
      total: active.length,
      overdue: active.filter(m => m.status === 'overdue').length,
    };
  });

  /** Lembrete da DASN-SIMEI do ano selecionado. */
  protected readonly dasn = computed<DasnReminder>(() =>
    dasnReminder(this.selectedYear(), this.data.dasnDeclaredYears())
  );
  protected readonly dasnDeclared = computed(() => this.dasn().status === 'declared');

  /** Gráfico de barras — faturamento por mês + linha de referência do limite mensal. */
  protected readonly monthlyChart = computed<ChartData>(() => {
    this.lang.lang();
    const s = this.status();
    const c = this.palette();
    const months = this.t.instant('dashboard.months') as string[];
    return {
      labels: months,
      datasets: [
        {
          type: 'bar',
          label: this.t.instant('fiscal.monthlyRevenueLabel'),
          data: s.monthly.map(m => m.revenue),
          backgroundColor: hexToRgba(c.brand, 0.85),
          borderColor: c.brand,
          borderWidth: 0,
          borderRadius: 6,
          order: 2,
        },
        {
          type: 'line',
          label: this.t.instant('fiscal.monthlyLimitLabel'),
          data: Array(12).fill(s.monthlyAvgLimit),
          borderColor: c.warning,
          borderWidth: 1.5,
          borderDash: [6, 4],
          pointRadius: 0,
          fill: false,
          order: 1,
        },
      ],
    } as ChartData;
  });

  protected readonly chartOptions = computed<ChartConfiguration['options']>(() => {
    const c = this.palette();
    const dark = this.theme.isDark();
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
        tooltip: {
          backgroundColor: dark ? '#0E0F12' : '#FFFFFF',
          titleColor: c.text,
          bodyColor: c.text,
          borderColor: c.grid,
          borderWidth: 1,
          padding: 12,
          cornerRadius: 10,
          usePointStyle: true,
          callbacks: {
            label: (ctx) => ` ${ctx.dataset.label ?? ''}: ${formatCurrency(ctx.raw as number)}`,
          },
        },
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

  protected regimeLabel(id: FiscalRegimeId): string {
    return this.t.instant('fiscal.regime.' + id);
  }
  protected activityLabel(id: FiscalActivity): string {
    return this.t.instant('fiscal.activity.' + id);
  }

  protected setYear(year: number): void {
    this.selectedYear.set(year);
  }

  protected onRegimeChange(regime: FiscalRegimeId): void {
    this.persist({ ...this.config(), regime });
  }
  protected onActivityChange(activity: FiscalActivity): void {
    this.persist({ ...this.config(), activity });
  }
  protected onStartDateChange(d: Date | null): void {
    const regimeStartDate = d ? toIsoDate(d) : undefined;
    this.persist({ ...this.config(), regimeStartDate });
  }

  private persist(cfg: { regime: FiscalRegimeId; activity: FiscalActivity; regimeStartDate?: string }): void {
    this.data.updateFiscalConfig(cfg)
      .then(() => this.notify.success(this.t.instant('fiscal.saved')))
      .catch(() => { /* erro já notificado pelo DataService */ });
  }

  protected toggleDasPaid(m: DasMonth): void {
    if (m.status === 'inactive') return;
    this.data.setDasPaid(m.periodKey, m.status !== 'paid')
      .catch(() => { /* erro já notificado */ });
  }

  protected markDasnDeclared(declared: boolean): void {
    this.data.setDasnDeclared(this.selectedYear(), declared)
      .catch(() => { /* erro já notificado */ });
  }

  protected dasStatusKey(status: DasMonthStatus): string {
    return 'fiscal.dasStatus.' + status;
  }
  protected dasnStatusKey(status: DasnStatus): string {
    return 'fiscal.dasnStatus.' + status;
  }

  /** 'yyyy-MM-dd' → 'mês/ano' (mês abreviado do idioma atual). */
  protected formatMonthYear(iso: string): string {
    const [y, m] = iso.split('-');
    return `${this.monthNames()[parseInt(m, 10) - 1]}/${y}`;
  }

  /** 'yyyy-MM-dd' → 'dd/MM/yyyy'. */
  protected formatBrDate(iso: string): string {
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y}`;
  }

  private brl(value: number): string {
    return formatCurrency(value);
  }
}

function toIsoDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

function formatShort(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return 'R$ ' + (value / 1_000_000).toFixed(1) + 'M';
  if (abs >= 1_000) return 'R$ ' + (value / 1_000).toFixed(0) + 'k';
  return 'R$ ' + value.toFixed(0);
}

function hexToRgba(hex: string, alpha: number): string {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map(ch => ch + ch).join('');
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
