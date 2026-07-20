import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { DialogService } from '../../shared/ui/dialog/dialog.service';
import { DataService } from '../../core/services/data.service';
import { NotifyService } from '../../core/services/notify.service';
import { QuickActionsService } from '../../core/services/quick-actions.service';
import { ComputedPurchase, InventoryStatus, Purchase } from '../../core/models/models';
import { PageHeaderComponent } from '../../shared/components/page-header.component';
import { KpiCardComponent } from '../../shared/components/kpi-card.component';
import { StatusBadgeComponent } from '../../shared/components/status-badge.component';
import { EmptyStateComponent } from '../../shared/components/empty-state.component';
import { SkeletonComponent } from '../../shared/components/skeleton.component';
import { BatchDetailPanelComponent } from '../../shared/components/batch-detail-panel.component';
import { ColorPillComponent } from '../../shared/components/color-pill.component';
import { BrlPipe } from '../../shared/pipes/brl.pipe';
import { BrDatePipe } from '../../shared/pipes/br-date.pipe';
import { PurchaseFormDialogComponent } from '../purchases/purchase-form.dialog';
import { ConfirmDialogComponent, ConfirmDialogResult } from '../../shared/components/confirm-dialog.component';
import { BreakpointService } from '../../shared/ui/breakpoint.service';
import { ButtonComponent } from '../../shared/ui/button/button.component';
import { IconComponent } from '../../shared/ui/icon/icon.component';
import { TooltipDirective } from '../../shared/ui/tooltip/tooltip.directive';
import { ChipComponent } from '../../shared/ui/chip/chip.component';
import { DrawerComponent } from '../../shared/ui/drawer/drawer.component';
import { MoneyComponent } from '../../shared/ui/money/money.component';
import { SortDirective, SortState } from '../../shared/ui/sort/sort.directive';
import { SortHeaderComponent } from '../../shared/ui/sort/sort-header.component';
import { PaginatorComponent, PageChangeEvent } from '../../shared/ui/paginator/paginator.component';
import { RecordCardComponent, RecordCardFigure } from '../../shared/ui/record-card/record-card.component';
import { SelectComponent } from '../../shared/ui/select/select.component';
import { OptionComponent } from '../../shared/ui/select/option.component';

const MS_PER_DAY = 86_400_000;

type FilterKey = 'all' | InventoryStatus;

/** Opções do "ordenar por" compacto do mobile (chave + direção). */
interface MobileSortOption {
  value: string; // `${active}:${direction}` ou '' para padrão
  labelKey: string;
}

@Component({
  selector: 'app-inventory',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink, FormsModule, TranslateModule,
    PageHeaderComponent, KpiCardComponent, StatusBadgeComponent,
    EmptyStateComponent, SkeletonComponent, BatchDetailPanelComponent, ColorPillComponent,
    BrlPipe, BrDatePipe, DatePipe,
    ButtonComponent, IconComponent, TooltipDirective, ChipComponent, DrawerComponent,
    MoneyComponent, SortDirective, SortHeaderComponent, PaginatorComponent,
    RecordCardComponent, SelectComponent, OptionComponent,
  ],
  templateUrl: './inventory.component.html',
  styleUrl: './inventory.component.scss',
})
export class InventoryComponent {
  protected readonly data = inject(DataService);
  private readonly dialog = inject(DialogService);
  private readonly notify = inject(NotifyService);
  private readonly quick = inject(QuickActionsService);
  protected readonly bp = inject(BreakpointService);
  private readonly t = inject(TranslateService);

  protected readonly kpis = this.data.kpis;

  protected readonly filter = signal<FilterKey>('all');

  /** Linha expandida inline (só desktop). */
  protected readonly expandedRow = signal<string | null>(null);

  /** Id do lote no painel lateral (id, não snapshot, para refletir updates). */
  protected readonly selectedBatchId = signal<string | null>(null);

  protected readonly selectedBatch = computed<ComputedPurchase | null>(() => {
    const id = this.selectedBatchId();
    if (!id) return null;
    return this.data.computedPurchases().find(c => c.id === id) ?? null;
  });
  protected readonly panelOpen = computed(() => this.selectedBatch() !== null);

  /** Estado de ordenação (shape compatível com o antigo MatSort). */
  protected readonly sortState = signal<SortState>({ active: '', direction: '' });

  /** Estado de paginação (shape compatível com o antigo PageEvent). */
  protected readonly pageState = signal<PageChangeEvent>({ pageIndex: 0, pageSize: 15, length: 0 });

  protected readonly pageSizeOptions = [15, 30, 50, 100, 150];

  protected readonly mobileSortOptions: MobileSortOption[] = [
    { value: '', labelKey: 'inventory.sortDefault' },
    { value: 'product:asc', labelKey: 'purchases.colProduct' },
    { value: 'currentStock:desc', labelKey: 'inventory.colStock' },
    { value: 'idleValue:desc', labelKey: 'inventory.idleCapital' },
    { value: 'averageMargin:asc', labelKey: 'sales.colMargin' },
  ];

  protected readonly mobileSortValue = computed(() => {
    const s = this.sortState();
    return s.active && s.direction ? `${s.active}:${s.direction}` : '';
  });

  constructor() {
    // Volta à primeira página quando o filtro muda (a página atual pode sumir).
    effect(() => {
      this.filter();
      this.pageState.update(p => ({ ...p, pageIndex: 0 }));
    }, { allowSignalWrites: true });
  }

  protected onSortChange(sort: SortState): void {
    this.sortState.set(sort);
  }

  protected onMobileSort(value: string): void {
    if (!value) {
      this.sortState.set({ active: '', direction: '' });
      return;
    }
    const [active, direction] = value.split(':');
    this.sortState.set({ active, direction: direction as SortState['direction'] });
  }

  protected onPage(evt: PageChangeEvent): void {
    this.pageState.set(evt);
  }

  /** Timestamp do eyebrow (atualiza quando os dados mudam). */
  protected readonly updatedAt = computed(() => {
    this.data.purchases();
    this.data.sales();
    return new Date();
  });

  private readonly STATUS_PRIORITY: Record<InventoryStatus, number> = {
    'Parado': 0,
    'Atenção': 1,
    'Em trânsito': 2,
    'Em Estoque': 3,
    'Vendido': 4,
  };

  private readonly SORT_ACCESSORS: Record<string, (row: ComputedPurchase) => string | number> = {
    id: row => row.id,
    product: row => row.product,
    category: row => row.category,
    currentStock: row => row.currentStock,
    idleValue: row => row.idleValue,
    averageMargin: row => row.averageMargin ?? 0,
    status: row => this.STATUS_PRIORITY[row.status] ?? 99,
  };

  /** Ordem padrão: prioridade de status, depois lote (id) como desempate. */
  protected readonly sortedPurchases = computed(() =>
    [...this.data.computedPurchases()].sort((a, b) => {
      const pa = this.STATUS_PRIORITY[a.status] ?? 99;
      const pb = this.STATUS_PRIORITY[b.status] ?? 99;
      if (pa !== pb) return pa - pb;
      return a.id.localeCompare(b.id, undefined, { numeric: true });
    })
  );

  private readonly filteredDefault = computed(() => {
    const f = this.filter();
    const list = this.sortedPurchases();
    if (f === 'all') return list;
    return list.filter(c => c.status === f);
  });

  /** Filtrado + ordenação do usuário (ou ordem padrão sem coluna ativa). */
  protected readonly filteredPurchases = computed(() => {
    const base = this.filteredDefault();
    const s = this.sortState();
    if (!s.active || !s.direction) return base;
    const accessor = this.SORT_ACCESSORS[s.active];
    if (!accessor) return base;
    const dir = s.direction === 'asc' ? 1 : -1;
    return [...base].sort((a, b) => {
      const va = accessor(a);
      const vb = accessor(b);
      if (typeof va === 'number' && typeof vb === 'number') {
        return (va - vb) * dir;
      }
      return String(va).localeCompare(String(vb), undefined, { numeric: true }) * dir;
    });
  });

  /** Fatia da página atual. */
  protected readonly pagedPurchases = computed(() => {
    const list = this.filteredPurchases();
    const { pageIndex, pageSize } = this.pageState();
    const start = pageIndex * pageSize;
    return list.slice(start, start + pageSize);
  });

  protected readonly statusCounts = computed(() => {
    const counts: Record<FilterKey, number> = {
      all: 0, 'Em Estoque': 0, 'Atenção': 0, 'Parado': 0, 'Em trânsito': 0, 'Vendido': 0,
    };
    for (const c of this.sortedPurchases()) {
      counts.all++;
      counts[c.status]++;
    }
    return counts;
  });

  protected readonly alerts = computed(() =>
    this.data.computedPurchases()
      .filter(c => c.status === 'Parado' || c.status === 'Atenção')
      .sort((a, b) => b.daysInStock - a.daysInStock)
  );

  protected readonly alertLevel = computed<'high' | 'medium'>(() =>
    this.alerts().some(a => a.status === 'Parado') ? 'high' : 'medium'
  );

  protected readonly alertSummary = computed(() => {
    const stalled = this.alerts().filter(a => a.status === 'Parado');
    const idle = stalled.reduce((s, b) => s + b.idleValue, 0);
    return {
      count: this.alerts().length,
      stalledCount: stalled.length,
      idleValue: idle,
    };
  });

  /** Sparkline do lucro líquido acumulado nos últimos 30 dias. */
  protected readonly profitSparkline = computed(() => this.buildSparkline(s => s.netProfit));

  /** Sparkline da receita bruta acumulada nos últimos 30 dias. */
  protected readonly revenueSparkline = computed(() => this.buildSparkline(s => s.grossRevenue));

  /**
   * Régua das sparklines: meia-noite UTC de cada um dos últimos `days` dias de
   * CALENDÁRIO LOCAL (antigo→recente). receiptDate/saleDate ('YYYY-MM-DD') são
   * parseados como meia-noite UTC, então a régua ancora no dia local em UTC para
   * os baldes baterem com daysInStock — misturar hora local aqui empurrava
   * lotes/vendas para o balde do dia anterior em fusos atrás de UTC (ex.: BRT).
   */
  private localDayRefs(days: number): number[] {
    const now = new Date();
    const todayMs = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
    const refs: number[] = [];
    for (let i = days - 1; i >= 0; i--) refs.push(todayMs - i * MS_PER_DAY);
    return refs;
  }

  /** Tendência de margem — margem % acumulada por dia, últimos 30 dias. */
  protected readonly marginSparkline = computed(() => {
    const sales = this.data.computedSales().filter(s => s.status === 'Concluída');
    if (sales.length < 2) return [];
    return this.localDayRefs(30).map(ref => {
      const upTo = sales.filter(s => new Date(s.saleDate).getTime() <= ref);
      const gross = upTo.reduce((acc, s) => acc + s.grossRevenue, 0);
      const profit = upTo.reduce((acc, s) => acc + s.netProfit, 0);
      return gross > 0 ? profit / gross : 0;
    });
  });

  /** Capital parado — valor absoluto ao longo dos últimos 30 dias. */
  protected readonly idleSparkline = computed(() => {
    const purchases = this.data.computedPurchases();
    const sales = this.data.sales();
    return this.localDayRefs(30).map(ref => purchases.reduce((acc, c) => {
      // Em trânsito conta como capital imobilizado desde a compra — mesma base do
      // KPI idleCapital do card.
      const start = new Date(c.receiptDate ?? c.purchaseDate).getTime();
      if (start > ref) return acc;
      const soldByDate = sales
        .filter(s => s.batchId === c.id && s.status === 'Concluída' && new Date(s.saleDate).getTime() <= ref)
        .reduce((sum, s) => sum + s.quantitySold, 0);
      const remaining = Math.max(0, c.quantityPurchased - soldByDate);
      return acc + remaining * c.actualUnitCost;
    }, 0));
  });

  private buildSparkline(picker: (s: import('../../core/models/models').ComputedSale) => number): number[] {
    const sales = this.data.computedSales().filter(s => s.status === 'Concluída');
    if (sales.length < 2) return [];
    const points: number[] = [];
    let acc = 0;
    for (const ref of this.localDayRefs(30)) {
      const dayValue = sales
        .filter(s => {
          const d = new Date(s.saleDate).getTime();
          return d >= ref && d < ref + MS_PER_DAY;
        })
        .reduce((sum, s) => sum + picker(s), 0);
      acc += dayValue;
      points.push(acc);
    }
    return points;
  }

  protected setFilter(f: FilterKey): void {
    this.filter.set(f);
    this.expandedRow.set(null);
  }

  protected toggleRow(id: string, event: Event): void {
    event.stopPropagation();
    this.expandedRow.update(curr => curr === id ? null : id);
  }

  protected openDetail(batch: ComputedPurchase): void {
    this.selectedBatchId.set(batch.id);
  }

  protected closeDetail(): void {
    this.selectedBatchId.set(null);
  }

  protected onDrawerOpenChange(open: boolean): void {
    if (!open) this.closeDetail();
  }

  /** "Chegou hoje" com um clique direto da linha (só Em trânsito). */
  protected markReceived(batch: ComputedPurchase, event: Event): void {
    event.stopPropagation();
    this.quick.markReceivedToday(batch);
  }

  protected scrollToAlerts(): void {
    document.getElementById('positions-table')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    this.filter.set('Parado');
  }

  /** Classe da listra lateral da linha — sinal visual do status. */
  protected rowStripeClass(c: ComputedPurchase): string {
    switch (c.status) {
      case 'Parado': return 'stripe-danger';
      case 'Atenção': return 'stripe-warning';
      case 'Em trânsito': return 'stripe-info';
      default: return '';
    }
  }

  /** Tom do dot de status do record-card mobile. */
  protected statusKindFor(c: ComputedPurchase): string {
    switch (c.status) {
      case 'Parado': return 'danger';
      case 'Atenção': return 'warning';
      case 'Em trânsito': return 'info';
      case 'Vendido': return 'neutral';
      default: return 'success';
    }
  }

  /** Valores do rodapé do record-card mobile. */
  protected figuresFor(c: ComputedPurchase): RecordCardFigure[] {
    return [
      { label: this.t.instant('inventory.colStock'), text: `${c.currentStock}/${c.quantityPurchased}` },
      { label: this.t.instant('inventory.idleCapital'), value: c.idleValue, tone: c.idleValue > 0 ? 'loss' : 'neutral' },
      {
        label: this.t.instant('sales.colMargin'),
        text: c.averageMargin !== undefined ? (c.averageMargin * 100).toFixed(1) + '%' : '—',
      },
    ];
  }

  protected marginClass(margin: number | undefined): string {
    if (margin === undefined) return 'text-muted';
    const cfg = this.data.settings();
    if (margin < 0) return 'text-danger';
    if (cfg && margin < cfg.minimumMargin) return 'text-warning';
    return 'text-success';
  }

  protected onEditRequested(batch: ComputedPurchase): void {
    this.closeDetail();
    const { ...purchase } = batch as Purchase;
    this.dialog
      .open<PurchaseFormDialogComponent, { purchase?: Purchase }, Purchase | null>(
        PurchaseFormDialogComponent,
        { data: { purchase }, size: 'lg' },
      )
      .afterClosed()
      .subscribe(result => {
        if (!result) return;
        this.data.updatePurchase(result.id, result);
        this.notify.success(this.t.instant('purchases.updated', { id: result.id }));
      });
  }

  protected confirmDelete(batch: ComputedPurchase, event: Event): void {
    event.stopPropagation();
    // Qualquer venda vinculada (mesmo cancelada/devolvida) bloqueia: excluir o lote
    // deixaria vendas órfãs com custo 0. Cascata disponível na tela Compras.
    if (this.data.sales().some(s => s.batchId === batch.id)) {
      this.notify.warning(this.t.instant('inventory.hasLinkedSales'));
      return;
    }
    this.dialog
      .open<ConfirmDialogComponent, unknown, ConfirmDialogResult>(ConfirmDialogComponent, {
        size: 'sm',
        data: {
          title: this.t.instant('inventory.deleteTitle'),
          message: this.t.instant('inventory.deleteMsg', { id: batch.id, product: batch.product }),
          confirmText: this.t.instant('common.delete'),
          danger: true,
        },
      })
      .afterClosed()
      .subscribe(result => {
        if (!result || !result.confirmed) return;
        this.data.removePurchase(batch.id);
        this.notify.success(this.t.instant('inventory.deleted', { id: batch.id }));
      });
  }
}
