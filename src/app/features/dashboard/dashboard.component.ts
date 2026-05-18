import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { BaseChartDirective } from 'ng2-charts';
import type { ChartConfiguration } from 'chart.js';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { DataService } from '../../core/services/data.service';
import { ThemeService } from '../../core/services/theme.service';
import { CHART_COLORS, ChartPalette } from '../../core/constants/app.constants';
import { PageHeaderComponent } from '../../shared/components/page-header.component';
import { KpiCardComponent } from '../../shared/components/kpi-card.component';
import { BrlPipe } from '../../shared/pipes/brl.pipe';

const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

@Component({
  selector: 'app-dashboard',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    BaseChartDirective, MatCardModule, MatIconModule,
    PageHeaderComponent, KpiCardComponent, BrlPipe,
  ],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
})
export class DashboardComponent {
  private readonly dataService = inject(DataService);
  private readonly themeService = inject(ThemeService);

  protected readonly kpis = this.dataService.kpis;

  /** Paleta dinâmica conforme tema atual. */
  protected readonly C = computed(() =>
    this.themeService.isDark() ? CHART_COLORS.dark : CHART_COLORS.light
  );

  // ── Dados mensais ────────────────────────────────────
  protected readonly mensalChart = computed<ChartConfiguration<'line'>['data']>(() => {
    const concluidas = this.dataService.vendasCalculadas().filter(v => v.status === 'Concluída');
    const recLiq = new Array<number>(12).fill(0);
    const lucro = new Array<number>(12).fill(0);

    for (const v of concluidas) {
      const m = new Date(v.dataVenda).getUTCMonth();
      recLiq[m] += v.receitaLiquida;
      lucro[m] += v.lucroLiquido;
    }

    const ativos: number[] = [];
    for (let i = 0; i < 12; i++) {
      if (recLiq[i] !== 0 || lucro[i] !== 0) ativos.push(i);
    }
    if (ativos.length === 0) return { labels: [], datasets: [] };

    const min = Math.min(...ativos);
    const max = Math.max(...ativos);
    const c = this.C();

    return {
      labels: MESES.slice(min, max + 1),
      datasets: [
        {
          label: 'Receita Líquida',
          data: recLiq.slice(min, max + 1),
          borderColor: c.blue,
          backgroundColor: c.blue + '33',
          tension: 0.3,
          fill: true,
          pointBackgroundColor: c.blue,
          pointRadius: 5,
        },
        {
          label: 'Lucro Líquido',
          data: lucro.slice(min, max + 1),
          borderColor: c.green,
          backgroundColor: c.green + '33',
          tension: 0.3,
          fill: true,
          pointBackgroundColor: c.green,
          pointRadius: 5,
        },
      ],
    };
  });

  // ── Lucro por produto ─────────────────────────────────
  protected readonly lucroProdutoChart = computed<ChartConfiguration<'bar'>['data']>(() => {
    const concluidas = this.dataService.vendasCalculadas().filter(v => v.status === 'Concluída');
    const map = new Map<string, number>();
    for (const v of concluidas) {
      map.set(v.produto, (map.get(v.produto) ?? 0) + v.lucroLiquido);
    }
    const arr = [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
    const c = this.C();

    return {
      labels: arr.map(([p]) => (p.length > 30 ? p.substring(0, 28) + '…' : p)),
      datasets: [{
        label: 'Lucro Líquido',
        data: arr.map(([, v]) => v),
        backgroundColor: arr.map(([, v]) => (v >= 0 ? c.green + 'CC' : c.red + 'CC')),
        borderColor: arr.map(([, v]) => (v >= 0 ? c.green : c.red)),
        borderWidth: 1.5,
        borderRadius: 4,
      }],
    };
  });

  // ── Composição de receita ─────────────────────────────
  protected readonly composicaoChart = computed<ChartConfiguration<'doughnut'>['data']>(() => {
    const k = this.kpis();
    const custoProd = k.receitaBruta - k.taxasTotal - k.fretesTotal - k.descontosTotal - k.lucroLiquido;
    const c = this.C();

    return {
      labels: ['Lucro Líquido', 'Taxas L', 'Frete', 'Desconto', 'Custo Produtos'],
      datasets: [{
        data: [
          Math.max(0, k.lucroLiquido),
          k.taxasTotal,
          k.fretesTotal,
          k.descontosTotal,
          Math.max(0, custoProd),
        ],
        backgroundColor: [c.green, c.amber, c.orange, c.red, c.blue],
        borderColor: this.themeService.isDark() ? '#1A1D27' : '#FFFFFF',
        borderWidth: 2,
      }],
    };
  });

  // ── Capital parado ────────────────────────────────────
  protected readonly capitalParadoChart = computed<ChartConfiguration<'bar'>['data']>(() => {
    const compras = this.dataService.comprasCalculadas()
      .filter(c => c.valorParado > 0)
      .sort((a, b) => b.valorParado - a.valorParado);
    const c = this.C();

    return {
      labels: compras.map(x => `${x.id} — ${x.produto.substring(0, 22)}${x.produto.length > 22 ? '…' : ''}`),
      datasets: [{
        label: 'Capital Parado (R$)',
        data: compras.map(x => x.valorParado),
        backgroundColor: c.amber + 'CC',
        borderColor: c.amber,
        borderWidth: 1.5,
        borderRadius: 4,
      }],
    };
  });

  // ── Comparativo geral ─────────────────────────────────
  protected readonly comparativoChart = computed<ChartConfiguration<'bar'>['data']>(() => {
    const k = this.kpis();
    const c = this.C();
    return {
      labels: ['Investido', 'Receita Bruta', 'Receita Líquida', 'Lucro Líquido', 'Capital Parado', 'Taxas L'],
      datasets: [{
        label: 'Valor (R$)',
        data: [k.totalInvestido, k.receitaBruta, k.receitaLiquida, k.lucroLiquido, k.capitalParado, k.taxasTotal],
        backgroundColor: [c.red + 'CC', c.blue + 'CC', c.blue + 'CC', c.green + 'CC', c.amber + 'CC', c.orange + 'CC'],
        borderColor: [c.red, c.blue, c.blue, c.green, c.amber, c.orange],
        borderWidth: 1.5,
        borderRadius: 4,
      }],
    };
  });

  // ── Chart options (todas dinâmicas via tema) ─────────
  protected readonly lineOptions = computed<ChartConfiguration<'line'>['options']>(() => {
    const c = this.C();
    return this.baseChartOptions(c) as ChartConfiguration<'line'>['options'];
  });

  protected readonly barOptions = computed<ChartConfiguration<'bar'>['options']>(() => {
    const c = this.C();
    return this.baseChartOptions(c) as ChartConfiguration<'bar'>['options'];
  });

  protected readonly horizontalBarOptions = computed<ChartConfiguration<'bar'>['options']>(() => {
    const c = this.C();
    return {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: this.tooltipOpts(c),
      },
      scales: {
        x: {
          ticks: { color: c.textSec, callback: v => 'R$ ' + Number(v).toLocaleString('pt-BR') },
          grid: { color: c.grid },
        },
        y: {
          ticks: { color: c.textSec, font: { size: 10 } },
          grid: { display: false },
        },
      },
    };
  });

  protected readonly doughnutOptions = computed<ChartConfiguration<'doughnut'>['options']>(() => {
    const c = this.C();
    return {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'right',
          labels: { color: c.text, padding: 12, font: { family: 'Inter', size: 12 } },
        },
        tooltip: {
          ...this.tooltipOpts(c),
          callbacks: {
            label: (ctx) => {
              const val = ctx.raw as number;
              return `${ctx.label}: R$ ${val.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
            },
          },
        },
      },
    };
  });

  // Helpers
  private baseChartOptions(c: ChartPalette): ChartConfiguration['options'] {
    return {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: c.text, font: { family: 'Inter' } } },
        tooltip: this.tooltipOpts(c),
      },
      scales: {
        x: { ticks: { color: c.textSec, font: { size: 10 } }, grid: { color: c.grid } },
        y: {
          ticks: {
            color: c.textSec,
            callback: (v: any) => 'R$ ' + Number(v).toLocaleString('pt-BR'),
          },
          grid: { color: c.grid },
        },
      },
    };
  }

  private tooltipOpts(c: ChartPalette) {
    return {
      backgroundColor: this.themeService.isDark() ? '#1A1D27' : '#FFFFFF',
      titleColor: c.text,
      bodyColor: c.text,
      borderColor: c.grid,
      borderWidth: 1,
      padding: 10,
      cornerRadius: 8,
    };
  }
}
