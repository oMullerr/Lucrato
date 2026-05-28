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
import { DataService } from '../../core/services/data.service';
import { NotifyService } from '../../core/services/notify.service';
import { Sale, ComputedSale, SaleStatus } from '../../core/models/models';
import { PageHeaderComponent } from '../../shared/components/page-header.component';
import { StatusBadgeComponent } from '../../shared/components/status-badge.component';
import { ConfirmDialogComponent } from '../../shared/components/confirm-dialog.component';
import { KpiCardComponent } from '../../shared/components/kpi-card.component';
import { EmptyStateComponent } from '../../shared/components/empty-state.component';
import { SkeletonComponent } from '../../shared/components/skeleton.component';
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
    EmptyStateComponent, SkeletonComponent,
    BrlPipe, BrDatePipe,
  ],
  templateUrl: './sales.component.html',
  styleUrl: './sales.component.scss',
})
export class SalesComponent {
  protected readonly data = inject(DataService);
  private readonly notify = inject(NotifyService);
  private readonly dialog = inject(MatDialog);

  protected readonly textFilter = signal('');
  protected readonly channelFilter = signal('all');
  protected readonly quickFilter = signal<SaleFilter>('all');
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
    // Subscribe to sortChange whenever the MatSort instance becomes available.
    effect((onCleanup) => {
      const s = this.sortRef();
      if (!s) return;
      const sub = s.sortChange.subscribe((sort: Sort) => this.sortState.set(sort));
      onCleanup(() => sub.unsubscribe());
    });

    // Subscribe to page events whenever the MatPaginator instance becomes available.
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
      this.paginatorRef()?.firstPage();
    });
  }

  /** Filtered list (channel + text + quick) sorted by id ASC — the default order. */
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
    const qf = this.quickFilter();
    if (qf === 'loss') vs = vs.filter(v => v.netProfit < 0);
    else if (qf === 'profit') vs = vs.filter(v => v.netProfit > 0);
    else if (qf === 'low-margin') vs = vs.filter(v => v.netMargin < this.minimumMargin() && v.status === 'Concluída');
    return [...vs].sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
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
    const min = this.minimumMargin();
    return {
      all: all.length,
      profit: all.filter(v => v.netProfit > 0).length,
      loss: all.filter(v => v.netProfit < 0).length,
      lowMargin: all.filter(v => v.netMargin < min && v.status === 'Concluída').length,
    };
  });

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
          title: 'Remover esta venda?',
          message: `A venda ${v.id} de "${v.product}" será removida.`,
          danger: true,
          confirmText: 'Remover',
        },
        width: '420px',
        maxWidth: '95vw',
      })
      .afterClosed()
      .subscribe(confirmed => {
        if (confirmed) {
          this.data.removeSale(v.id);
          this.notify.success(`Venda ${v.id} removida.`);
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
          this.notify.success(`Venda ${result.id} atualizada.`);
        } else {
          if (this.data.findSale(result.id)) {
            this.notify.error(`ID ${result.id} já existe.`);
            return;
          }
          this.data.addSale(result);
          this.notify.success(`Venda ${result.id} registrada.`);
        }
      });
  }
}
