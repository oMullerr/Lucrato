import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { DialogService } from '../../shared/ui/dialog/dialog.service';
import { DataService } from '../../core/services/data.service';
import { NotifyService } from '../../core/services/notify.service';
import { Purchase, ComputedPurchase, InventoryStatus } from '../../core/models/models';
import { PageHeaderComponent } from '../../shared/components/page-header.component';
import { StatusBadgeComponent } from '../../shared/components/status-badge.component';
import { ConfirmDialogComponent } from '../../shared/components/confirm-dialog.component';
import { EmptyStateComponent } from '../../shared/components/empty-state.component';
import { SkeletonComponent } from '../../shared/components/skeleton.component';
import { BatchDetailPanelComponent } from '../../shared/components/batch-detail-panel.component';
import { ColorPillComponent } from '../../shared/components/color-pill.component';
import { DateRangePickerComponent, RangeBounds, RangeChange } from '../../shared/components/date-range-picker.component';
import { BrlPipe } from '../../shared/pipes/brl.pipe';
import { BrDatePipe } from '../../shared/pipes/br-date.pipe';
import { PurchaseFormDialogComponent, PurchaseDialogData } from './purchase-form.dialog';
import { BreakpointService } from '../../shared/ui/breakpoint.service';
import { ButtonComponent } from '../../shared/ui/button/button.component';
import { IconComponent } from '../../shared/ui/icon/icon.component';
import { TooltipDirective } from '../../shared/ui/tooltip/tooltip.directive';
import { ChipComponent } from '../../shared/ui/chip/chip.component';
import { FieldComponent } from '../../shared/ui/field/field.component';
import { InputDirective } from '../../shared/ui/field/input.directive';
import { SelectComponent } from '../../shared/ui/select/select.component';
import { OptionComponent } from '../../shared/ui/select/option.component';
import { DrawerComponent } from '../../shared/ui/drawer/drawer.component';
import { SortDirective, SortState } from '../../shared/ui/sort/sort.directive';
import { SortHeaderComponent } from '../../shared/ui/sort/sort-header.component';
import { PaginatorComponent, PageChangeEvent } from '../../shared/ui/paginator/paginator.component';
import { RecordCardComponent, RecordCardFigure } from '../../shared/ui/record-card/record-card.component';

type StatusFilter = 'all' | InventoryStatus;

@Component({
  selector: 'app-purchases',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule, TranslateModule,
    PageHeaderComponent, StatusBadgeComponent,
    EmptyStateComponent, SkeletonComponent, BatchDetailPanelComponent, ColorPillComponent, DateRangePickerComponent,
    BrlPipe, BrDatePipe,
    ButtonComponent, IconComponent, TooltipDirective, ChipComponent,
    FieldComponent, InputDirective, SelectComponent, OptionComponent, DrawerComponent,
    SortDirective, SortHeaderComponent, PaginatorComponent, RecordCardComponent,
  ],
  templateUrl: './purchases.component.html',
  styleUrl: './purchases.component.scss',
})
export class PurchasesComponent {
  protected readonly data = inject(DataService);
  private readonly notify = inject(NotifyService);
  private readonly dialog = inject(DialogService);
  protected readonly bp = inject(BreakpointService);
  private readonly t = inject(TranslateService);

  protected readonly textFilter = signal('');
  protected readonly statusFilter = signal<StatusFilter>('all');
  protected readonly dateBounds = signal<RangeBounds | null>(null);
  protected readonly expandedRow = signal<string | null>(null);
  protected readonly selectedBatch = signal<ComputedPurchase | null>(null);
  protected readonly panelOpen = computed(() => this.selectedBatch() !== null);

  protected readonly purchases = this.data.computedPurchases;

  /** Estado de ordenação (shape compatível com o antigo MatSort). */
  protected readonly sortState = signal<SortState>({ active: '', direction: '' });

  /** Estado de paginação (shape compatível com o antigo PageEvent). */
  protected readonly pageState = signal<PageChangeEvent>({ pageIndex: 0, pageSize: 15, length: 0 });

  protected readonly pageSizeOptions = [15, 30, 50, 100, 150];

  protected readonly mobileSortOptions = [
    { value: '', labelKey: 'purchases.sortDefault' },
    { value: 'product:asc', labelKey: 'purchases.colProduct' },
    { value: 'purchaseDate:desc', labelKey: 'purchases.colDate' },
    { value: 'totalActualCost:desc', labelKey: 'purchases.colTotalCost' },
    { value: 'quantityPurchased:desc', labelKey: 'purchases.colQty' },
  ];

  protected readonly mobileSortValue = computed(() => {
    const s = this.sortState();
    return s.active && s.direction ? `${s.active}:${s.direction}` : '';
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
    supplier: row => row.supplier,
    purchaseDate: row => row.purchaseDate,
    quantityPurchased: row => row.quantityPurchased,
    totalActualCost: row => row.totalActualCost,
    status: row => this.STATUS_PRIORITY[row.status] ?? 99,
  };

  constructor() {
    // Volta à primeira página quando filtro/busca/período mudam.
    effect(() => {
      this.statusFilter();
      this.textFilter();
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

  protected readonly totals = computed(() => {
    const cs = this.purchases();
    return {
      all: cs.length,
      'Em trânsito': cs.filter(c => c.status === 'Em trânsito').length,
      'Em Estoque':  cs.filter(c => c.status === 'Em Estoque').length,
      'Atenção':     cs.filter(c => c.status === 'Atenção').length,
      'Parado':      cs.filter(c => c.status === 'Parado').length,
      'Vendido':     cs.filter(c => c.status === 'Vendido').length,
    };
  });

  /** Guarda os bounds efetivos emitidos pelo seletor de período. */
  protected onRangeChange(e: RangeChange): void {
    this.dateBounds.set(e.bounds);
  }

  /** Status + texto + período, por data de compra DESC — mais recentes primeiro. */
  private readonly filteredBase = computed(() => {
    let cs = this.purchases();
    const status = this.statusFilter();
    if (status !== 'all') {
      cs = cs.filter(c => c.status === status);
    }
    const text = this.textFilter().trim().toLowerCase();
    if (text) {
      cs = cs.filter(c =>
        c.product.toLowerCase().includes(text) ||
        c.id.toLowerCase().includes(text) ||
        c.category.toLowerCase().includes(text) ||
        c.supplier.toLowerCase().includes(text)
      );
    }
    const b = this.dateBounds();
    if (b) {
      cs = cs.filter(c => {
        const d = new Date(c.purchaseDate);
        return d >= b.start && d <= b.end;
      });
    }
    return [...cs].sort((a, b) => {
      const byDate = b.purchaseDate.localeCompare(a.purchaseDate);
      if (byDate !== 0) return byDate;
      return b.id.localeCompare(a.id, undefined, { numeric: true });
    });
  });

  /** Ordenação do usuário sobre a lista filtrada, ou ordem padrão. */
  protected readonly filteredPurchases = computed(() => {
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
  protected readonly pagedPurchases = computed(() => {
    const list = this.filteredPurchases();
    const { pageIndex, pageSize } = this.pageState();
    const start = pageIndex * pageSize;
    return list.slice(start, start + pageSize);
  });

  protected setStatus(s: StatusFilter): void {
    this.statusFilter.set(s);
    this.expandedRow.set(null);
  }

  protected openNew(): void {
    this.openForm({});
  }

  protected edit(c: ComputedPurchase, event: Event): void {
    event.stopPropagation();
    const { ...purchase } = c as Purchase;
    this.openForm({ purchase });
  }

  /**
   * "Recomprar": abre a Nova Compra já com produto/categoria/fornecedor/link deste
   * lote (id novo, quantidade/custo/datas em branco). É o caminho rápido para o
   * mesmo produto que voltou à promoção.
   */
  protected rebuy(c: ComputedPurchase, event: Event): void {
    event.stopPropagation();
    this.openForm({
      prefill: { product: c.product, category: c.category, supplier: c.supplier, link: c.link ?? '' },
    });
  }

  protected toggleRow(id: string, event: Event): void {
    event.stopPropagation();
    this.expandedRow.update(curr => curr === id ? null : id);
  }

  protected openDetail(batch: ComputedPurchase): void {
    this.selectedBatch.set(batch);
  }

  protected closeDetail(): void {
    this.selectedBatch.set(null);
  }

  protected onDrawerOpenChange(open: boolean): void {
    if (!open) this.closeDetail();
  }

  protected onEditRequested(batch: ComputedPurchase): void {
    this.closeDetail();
    this.edit(batch, new Event('synthetic'));
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
      { label: this.t.instant('purchases.colQty'), text: `${c.quantityPurchased} un` },
      { label: this.t.instant('purchases.colTotalCost'), value: c.totalActualCost, tone: 'neutral' },
      { label: this.t.instant('batchPanel.currentStock'), text: `${c.currentStock}` },
    ];
  }

  protected confirmRemove(c: ComputedPurchase, event: Event): void {
    event.stopPropagation();
    const linkedSales = this.data.sales().filter(v => v.batchId === c.id);
    if (linkedSales.length > 0) {
      const salesList = linkedSales.map(v => v.id).join(', ');
      this.dialog
        .open(ConfirmDialogComponent, {
          data: {
            title: this.t.instant('purchases.removeLinkedTitle'),
            message: this.t.instant('purchases.removeLinkedMsg', {
              id: c.id,
              product: c.product,
              count: linkedSales.length,
              salesList,
            }),
            danger: true,
            confirmText: this.t.instant('purchases.removeAll'),
          },
          size: 'sm',
        })
        .afterClosed()
        .subscribe(confirmed => {
          if (confirmed) {
            this.data.removePurchaseWithSales(c.id);
            this.notify.success(this.t.instant('purchases.removedWithSales', { id: c.id, count: linkedSales.length }));
          }
        });
      return;
    }

    this.dialog
      .open(ConfirmDialogComponent, {
        data: {
          title: this.t.instant('purchases.removeTitle'),
          message: this.t.instant('purchases.removeMsg', { id: c.id, product: c.product }),
          danger: true,
          confirmText: this.t.instant('common.remove'),
        },
        size: 'sm',
      })
      .afterClosed()
      .subscribe(confirmed => {
        if (!confirmed) return;
        /* Snapshot cru ANTES de remover — é ele que o desfazer restaura. */
        const raw = this.data.findPurchase(c.id);
        this.data.removePurchase(c.id);
        if (raw) {
          this.notify.withUndo(
            this.t.instant('purchases.deletedUndo', { id: c.id }),
            () => this.data.addPurchase(raw),
          );
        } else {
          this.notify.success(this.t.instant('purchases.removed', { id: c.id }));
        }
      });
  }

  private openForm(opts: { purchase?: Purchase; prefill?: Partial<Purchase> } = {}): void {
    const { purchase, prefill } = opts;
    this.dialog
      .open<PurchaseFormDialogComponent, PurchaseDialogData, Purchase | null>(
        PurchaseFormDialogComponent,
        { data: { purchase, prefill }, size: 'lg' }
      )
      .afterClosed()
      .subscribe(result => {
        if (!result) return;
        if (purchase) {
          this.data.updatePurchase(purchase.id, result);
          this.notify.success(this.t.instant('purchases.updated', { id: result.id }));
        } else {
          if (this.data.findPurchase(result.id)) {
            this.notify.error(this.t.instant('purchases.idExists', { id: result.id }));
            return;
          }
          this.data.addPurchase(result);
          this.notify.success(this.t.instant('purchases.added', { id: result.id }));
        }
      });
  }
}
