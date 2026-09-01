import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { DialogService } from '../../shared/ui/dialog/dialog.service';
import { DataService } from '../../core/services/data.service';
import { NotifyService } from '../../core/services/notify.service';
import { QuickActionsService } from '../../core/services/quick-actions.service';
import { remainingReturnable } from '../../core/services/calculations';
import { Sale, ComputedSale, SaleStatus } from '../../core/models/models';
import { PageHeaderComponent } from '../../shared/components/page-header.component';
import { StatusBadgeComponent } from '../../shared/components/status-badge.component';
import { ConfirmDialogComponent } from '../../shared/components/confirm-dialog.component';
import { KpiCardComponent } from '../../shared/components/kpi-card.component';
import { EmptyStateComponent } from '../../shared/components/empty-state.component';
import { SkeletonComponent } from '../../shared/components/skeleton.component';
import { ColorPillComponent } from '../../shared/components/color-pill.component';
import { DateRangePickerComponent, RangeBounds, RangeChange } from '../../shared/components/date-range-picker.component';
import { BrlPipe } from '../../shared/pipes/brl.pipe';
import { BrDatePipe } from '../../shared/pipes/br-date.pipe';
import { SaleFormDialogComponent } from './sale-form.dialog';
import { BreakpointService } from '../../shared/ui/breakpoint.service';
import { ButtonComponent } from '../../shared/ui/button/button.component';
import { IconComponent } from '../../shared/ui/icon/icon.component';
import { TooltipDirective } from '../../shared/ui/tooltip/tooltip.directive';
import { ChipComponent } from '../../shared/ui/chip/chip.component';
import { FieldComponent } from '../../shared/ui/field/field.component';
import { InputDirective } from '../../shared/ui/field/input.directive';
import { SelectComponent } from '../../shared/ui/select/select.component';
import { OptionComponent } from '../../shared/ui/select/option.component';
import { MoneyComponent } from '../../shared/ui/money/money.component';
import { SortDirective, SortState } from '../../shared/ui/sort/sort.directive';
import { SortHeaderComponent } from '../../shared/ui/sort/sort-header.component';
import { PaginatorComponent, PageChangeEvent } from '../../shared/ui/paginator/paginator.component';
import { RecordCardComponent, RecordCardFigure } from '../../shared/ui/record-card/record-card.component';

type SaleFilter = 'all' | 'profit' | 'loss' | 'low-margin';

@Component({
  selector: 'app-sales',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule, TranslateModule,
    PageHeaderComponent, StatusBadgeComponent, KpiCardComponent,
    EmptyStateComponent, SkeletonComponent, ColorPillComponent, DateRangePickerComponent,
    BrlPipe, BrDatePipe,
    ButtonComponent, IconComponent, TooltipDirective, ChipComponent,
    FieldComponent, InputDirective, SelectComponent, OptionComponent,
    MoneyComponent, SortDirective, SortHeaderComponent, PaginatorComponent, RecordCardComponent,
  ],
  templateUrl: './sales.component.html',
  styleUrl: './sales.component.scss',
})
export class SalesComponent {
  protected readonly data = inject(DataService);
  private readonly notify = inject(NotifyService);
  private readonly dialog = inject(DialogService);
  private readonly t = inject(TranslateService);
  private readonly quick = inject(QuickActionsService);
  protected readonly bp = inject(BreakpointService);

  protected readonly textFilter = signal('');
  protected readonly channelFilter = signal('all');
  protected readonly quickFilter = signal<SaleFilter>('all');
  protected readonly dateBounds = signal<RangeBounds | null>(null);
  protected readonly expandedRow = signal<string | null>(null);

  protected readonly sales = this.data.computedSales;
  protected readonly channels = computed(() => this.data.settings()?.channels ?? []);
  protected readonly defaultFee = computed(() => this.data.settings()?.defaultMlFee ?? 0.12);
  protected readonly minimumMargin = computed(() => this.data.settings()?.minimumMargin ?? 0.10);

  protected readonly sortState = signal<SortState>({ active: '', direction: '' });
  protected readonly pageState = signal<PageChangeEvent>({ pageIndex: 0, pageSize: 15, length: 0 });
  protected readonly pageSizeOptions = [15, 30, 50, 100, 150];

  protected readonly mobileSortOptions = [
    { value: '', labelKey: 'sales.sortDefault' },
    { value: 'product:asc', labelKey: 'sales.colProduct' },
    { value: 'netProfit:desc', labelKey: 'sales.colNetProfit' },
    { value: 'netMargin:asc', labelKey: 'sales.colMargin' },
    { value: 'quantitySold:desc', labelKey: 'sales.colQty' },
    { value: 'returnLoss:desc', labelKey: 'sales.colReturnLoss' },
  ];

  protected readonly mobileSortValue = computed(() => {
    const s = this.sortState();
    return s.active && s.direction ? `${s.active}:${s.direction}` : '';
  });

  private readonly STATUS_PRIORITY: Record<SaleStatus, number> = {
    'Concluída': 0,
    'Em disputa': 1,
    'Devolvida': 2,
    'Cancelada': 3,
  };

  private readonly SORT_ACCESSORS: Record<string, (row: ComputedSale) => string | number> = {
    id: row => row.id,
    batchId: row => row.batchId,
    product: row => row.product,
    saleDate: row => row.saleDate,
    channel: row => row.channel,
    quantitySold: row => row.quantitySold,
    netProfit: row => row.netProfit,
    netMargin: row => row.netMargin,
    status: row => this.STATUS_PRIORITY[row.effectiveStatus] ?? 99,
    returnLoss: row => row.returnLoss,
  };

  constructor() {
    // Volta à primeira página quando qualquer filtro muda.
    effect(() => {
      this.textFilter();
      this.channelFilter();
      this.quickFilter();
      this.dateBounds();
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

  /** Guarda os bounds efetivos emitidos pelo seletor de período. */
  protected onRangeChange(e: RangeChange): void {
    this.dateBounds.set(e.bounds);
  }

  /** Lista filtrada (canal + texto + rápido + período) por data DESC — mais recentes primeiro. */
  private readonly filteredBase = computed(() => {
    let vs = this.sales();
    if (this.channelFilter() !== 'all') {
      vs = vs.filter(v => v.channel === this.channelFilter());
    }
    const text = this.textFilter().trim().toLowerCase();
    if (text) {
      vs = vs.filter(v =>
        v.product.toLowerCase().includes(text) ||
        v.id.toLowerCase().includes(text) ||
        v.batchId.toLowerCase().includes(text)
      );
    }
    const b = this.dateBounds();
    if (b) {
      vs = vs.filter(v => {
        const d = new Date(v.saleDate);
        return d >= b.start && d <= b.end;
      });
    }
    const qf = this.quickFilter();
    // Lucro/prejuízo só fazem sentido em vendas concluídas — cancelada não realizou resultado.
    if (qf === 'loss') vs = vs.filter(v => v.netProfit < 0 && v.countsAsRevenue);
    else if (qf === 'profit') vs = vs.filter(v => v.netProfit > 0 && v.countsAsRevenue);
    else if (qf === 'low-margin') vs = vs.filter(v => v.netMargin < this.minimumMargin() && v.countsAsRevenue);
    return [...vs].sort((a, b) => {
      const byDate = b.saleDate.localeCompare(a.saleDate);
      if (byDate !== 0) return byDate;
      return b.id.localeCompare(a.id, undefined, { numeric: true });
    });
  });

  /** Ordenação do usuário sobre a lista filtrada, ou ordem padrão. */
  protected readonly filteredSales = computed(() => {
    const base = this.filteredBase();
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
  protected readonly pagedSales = computed(() => {
    const list = this.filteredSales();
    const { pageIndex, pageSize } = this.pageState();
    const start = pageIndex * pageSize;
    return list.slice(start, start + pageSize);
  });

  protected readonly summary = computed(() => {
    const completed = this.filteredSales().filter(v => v.countsAsRevenue);
    const revenue = completed.reduce((s, v) => s + v.grossRevenue, 0);
    const profit = completed.reduce((s, v) => s + v.netProfit, 0);
    return {
      total: this.filteredSales().length,
      revenue,
      profit,
      margin: revenue > 0 ? profit / revenue : 0,
    };
  });

  protected readonly quickCounts = computed(() => {
    const all = this.sales();
    const completed = all.filter(v => v.countsAsRevenue);
    const min = this.minimumMargin();
    return {
      all: all.length,
      profit: completed.filter(v => v.netProfit > 0).length,
      loss: completed.filter(v => v.netProfit < 0).length,
      lowMargin: completed.filter(v => v.netMargin < min).length,
    };
  });

  /** Ids de lotes existentes — vendas cujo lote não resolve têm custo 0 (sinalizadas na tabela). */
  private readonly batchIds = computed(() => new Set(this.data.purchases().map(c => c.id)));

  protected isOrphanBatch(batchId: string): boolean {
    return !this.batchIds().has(batchId);
  }

  protected openNew(): void {
    this.openForm();
  }

  /** Unidades ainda devolvíveis — 0 desabilita a ação de registrar devolução. */
  protected remainingReturnable(v: ComputedSale): number {
    return remainingReturnable(v, this.data.returns());
  }

  protected canRegisterReturn(v: ComputedSale): boolean {
    return v.countsAsRevenue && this.remainingReturnable(v) > 0;
  }

  protected registerReturn(v: ComputedSale, event: Event): void {
    event.stopPropagation();
    this.quick.openNewReturn(v.id);
  }

  protected edit(v: ComputedSale, event: Event): void {
    event.stopPropagation();
    this.openForm({ ...v });
  }

  protected confirmRemove(v: ComputedSale, event: Event): void {
    event.stopPropagation();
    this.dialog
      .open(ConfirmDialogComponent, {
        data: {
          title: this.t.instant('sales.removeTitle'),
          message: this.t.instant('sales.removeMsg', { id: v.id, product: v.product }),
          danger: true,
          confirmText: this.t.instant('common.remove'),
        },
        size: 'sm',
      })
      .afterClosed()
      .subscribe(confirmed => {
        if (!confirmed) return;
        /* Snapshot cru ANTES de remover — é ele que o desfazer restaura.
           Inclui as devoluções, que saem em cascata junto com a venda. */
        const raw = this.data.findSale(v.id);
        const rawReturns = this.data.returnsForSale(v.id);
        this.data.removeSale(v.id);
        if (raw) {
          this.notify.withUndo(
            this.t.instant('sales.deletedUndo', { id: v.id }),
            () => this.data.restoreSale(raw, rawReturns),
          );
        } else {
          this.notify.success(this.t.instant('sales.removed', { id: v.id }));
        }
      });
  }

  protected isCustomFee(fee: number): boolean {
    return Math.abs(fee - this.defaultFee()) > 0.0001;
  }

  protected marginClass(margin: number): string {
    if (margin < 0) return 'text-danger';
    const cfg = this.data.settings();
    if (cfg && margin < cfg.minimumMargin) return 'text-warning';
    return 'text-success';
  }

  protected toggleRow(id: string, event: Event): void {
    event.stopPropagation();
    this.expandedRow.update(curr => curr === id ? null : id);
  }

  protected setQuickFilter(f: SaleFilter): void {
    this.quickFilter.set(f);
  }

  /** Tom do dot de status do record-card mobile. */
  protected statusKindFor(v: ComputedSale): string {
    switch (v.effectiveStatus) {
      case 'Concluída': return 'success';
      case 'Em disputa': return 'warning';
      case 'Devolvida': return 'danger';
      default: return 'neutral';
    }
  }

  /** Valores do rodapé do record-card mobile. */
  protected figuresFor(v: ComputedSale): RecordCardFigure[] {
    return [
      { label: this.t.instant('sales.colQty'), text: `${v.quantitySold}×` },
      { label: this.t.instant('sales.colNetProfit'), value: v.netProfit, tone: 'auto' },
      { label: this.t.instant('sales.colMargin'), text: (v.netMargin * 100).toFixed(1) + '%' },
    ];
  }

  /** Abre o formulário de edição a partir do card mobile. */
  protected editFromCard(v: ComputedSale): void {
    this.openForm({ ...v });
  }

  private openForm(sale?: Sale): void {
    this.dialog
      .open<SaleFormDialogComponent, { sale?: Sale }, Sale | null>(
        SaleFormDialogComponent,
        { data: { sale }, size: 'xl' }
      )
      .afterClosed()
      .subscribe(result => {
        if (!result) return;
        if (sale) {
          this.data.updateSale(sale.id, result);
          this.notify.success(this.t.instant('sales.updated', { id: result.id }));
        } else {
          if (this.data.findSale(result.id)) {
            this.notify.error(this.t.instant('sales.idExists', { id: result.id }));
            return;
          }
          this.data.addSale(result);
          this.notify.success(this.t.instant('sales.registered', { id: result.id }));
        }
      });
  }
}
