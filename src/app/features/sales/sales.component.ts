import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSort, MatSortModule, Sort } from '@angular/material/sort';
import { MatPaginator, MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { DataService } from '../../core/services/data.service';
import { NotifyService } from '../../core/services/notify.service';
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

type SaleFilter = 'all' | 'profit' | 'loss' | 'low-margin';

@Component({
  selector: 'app-sales',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    MatButtonModule, MatIconModule,
    MatFormFieldModule, MatInputModule, MatSelectModule, MatTooltipModule,
    MatSortModule, MatPaginatorModule,
    PageHeaderComponent, StatusBadgeComponent, KpiCardComponent,
    EmptyStateComponent, SkeletonComponent, ColorPillComponent, DateRangePickerComponent,
    BrlPipe, BrDatePipe,
    TranslateModule,
  ],
  templateUrl: './sales.component.html',
  styleUrl: './sales.component.scss',
})
export class SalesComponent {
  protected readonly data = inject(DataService);
  private readonly notify = inject(NotifyService);
  private readonly dialog = inject(MatDialog);
  private readonly t = inject(TranslateService);

  protected readonly textFilter = signal('');
  protected readonly channelFilter = signal('all');
  protected readonly quickFilter = signal<SaleFilter>('all');
  protected readonly dateBounds = signal<RangeBounds | null>(null);
  protected readonly expandedRow = signal<string | null>(null);

  protected readonly sales = this.data.computedSales;
  protected readonly channels = computed(() => this.data.settings()?.channels ?? []);
  protected readonly defaultFee = computed(() => this.data.settings()?.defaultMlFee ?? 0.12);
  protected readonly minimumMargin = computed(() => this.data.settings()?.minimumMargin ?? 0.10);

  protected readonly sortState = signal<Sort>({ active: '', direction: '' });
  protected readonly pageState = signal<PageEvent>({ pageIndex: 0, pageSize: 15, length: 0 });
  protected readonly pageSizeOptions = [15, 30, 50, 100, 150];

  private readonly sortRef = viewChild(MatSort);
  private readonly paginatorRef = viewChild(MatPaginator);

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
    status: row => this.STATUS_PRIORITY[row.status] ?? 99,
  };

  constructor() {
    effect((onCleanup) => {
      const s = this.sortRef();
      if (!s) return;
      const sub = s.sortChange.subscribe((sort: Sort) => this.sortState.set(sort));
      onCleanup(() => sub.unsubscribe());
    });

    effect((onCleanup) => {
      const p = this.paginatorRef();
      if (!p) return;
      const sub = p.page.subscribe((evt: PageEvent) => this.pageState.set(evt));
      onCleanup(() => sub.unsubscribe());
    });

    // Reset to first page whenever any filter changes.
    effect(() => {
      this.textFilter();
      this.channelFilter();
      this.quickFilter();
      this.dateBounds();
      this.paginatorRef()?.firstPage();
    });
  }

  /** Stores the effective date-range bounds emitted by the period picker. */
  protected onRangeChange(e: RangeChange): void {
    this.dateBounds.set(e.bounds);
  }

  /** Filtered list (channel + text + quick + date range) sorted by sale date DESC — newest first (default order). */
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
    if (qf === 'loss') vs = vs.filter(v => v.netProfit < 0 && v.status === 'Concluída');
    else if (qf === 'profit') vs = vs.filter(v => v.netProfit > 0 && v.status === 'Concluída');
    else if (qf === 'low-margin') vs = vs.filter(v => v.netMargin < this.minimumMargin() && v.status === 'Concluída');
    return [...vs].sort((a, b) => {
      const byDate = b.saleDate.localeCompare(a.saleDate);
      if (byDate !== 0) return byDate;
      return b.id.localeCompare(a.id, undefined, { numeric: true });
    });
  });

  /** Applies user-driven column sort on top of the filtered list, or returns the default order. */
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

  /** Page slice of the filtered/sorted list. */
  protected readonly pagedSales = computed(() => {
    const list = this.filteredSales();
    const { pageIndex, pageSize } = this.pageState();
    const start = pageIndex * pageSize;
    return list.slice(start, start + pageSize);
  });

  protected readonly summary = computed(() => {
    const completed = this.filteredSales().filter(v => v.status === 'Concluída');
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
    const completed = all.filter(v => v.status === 'Concluída');
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
        width: '420px',
        maxWidth: '95vw',
      })
      .afterClosed()
      .subscribe(confirmed => {
        if (confirmed) {
          this.data.removeSale(v.id);
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

  private openForm(sale?: Sale): void {
    this.dialog
      .open<SaleFormDialogComponent, { sale?: Sale }, Sale | null>(
        SaleFormDialogComponent,
        { data: { sale }, width: '820px', maxWidth: '95vw' }
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
