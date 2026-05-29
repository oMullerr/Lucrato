import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialog } from '@angular/material/dialog';
import { MatSort, MatSortModule, Sort } from '@angular/material/sort';
import { MatPaginator, MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { BreakpointObserver } from '@angular/cdk/layout';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { DataService } from '../../core/services/data.service';
import { NotifyService } from '../../core/services/notify.service';
import { ComputedPurchase, InventoryStatus, Purchase } from '../../core/models/models';
import { PageHeaderComponent } from '../../shared/components/page-header.component';
import { KpiCardComponent } from '../../shared/components/kpi-card.component';
import { StatusBadgeComponent } from '../../shared/components/status-badge.component';
import { EmptyStateComponent } from '../../shared/components/empty-state.component';
import { SkeletonComponent } from '../../shared/components/skeleton.component';
import { BatchDetailPanelComponent } from '../../shared/components/batch-detail-panel.component';
import { BrlPipe } from '../../shared/pipes/brl.pipe';
import { BrDatePipe } from '../../shared/pipes/br-date.pipe';
import { PurchaseFormDialogComponent } from '../purchases/purchase-form.dialog';
import { ConfirmDialogComponent, ConfirmDialogResult } from '../../shared/components/confirm-dialog.component';

type FilterKey = 'all' | InventoryStatus;

@Component({
  selector: 'app-inventory',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink, MatButtonModule, MatIconModule, MatSidenavModule, MatTooltipModule,
    MatSortModule, MatPaginatorModule,
    PageHeaderComponent, KpiCardComponent, StatusBadgeComponent,
    EmptyStateComponent, SkeletonComponent, BatchDetailPanelComponent,
    BrlPipe, BrDatePipe, DatePipe,
  ],
  templateUrl: './inventory.component.html',
  styleUrl: './inventory.component.scss',
})
export class InventoryComponent {
  protected readonly data = inject(DataService);
  private readonly dialog = inject(MatDialog);
  private readonly notify = inject(NotifyService);
  private readonly bp = inject(BreakpointObserver);

  protected readonly kpis = this.data.kpis;

  /** Wide viewport (>=1600px) — detail drawer becomes a pinned side column instead of an overlay. */
  protected readonly isWideViewport = toSignal(
    this.bp.observe('(min-width: 1600px)').pipe(map(r => r.matches)),
    { initialValue: globalThis.window ? globalThis.window.innerWidth >= 1600 : false }
  );

  /** Currently selected filter chip. */
  protected readonly filter = signal<FilterKey>('all');

  /** Row currently expanded inline. */
  protected readonly expandedRow = signal<string | null>(null);

  /** Selected batch for the lateral detail panel. */
  protected readonly selectedBatch = signal<ComputedPurchase | null>(null);
  protected readonly panelOpen = computed(() => this.selectedBatch() !== null);

  /** Current sort state from MatSort. Empty `active`/`direction` means use the default sort. */
  protected readonly sortState = signal<Sort>({ active: '', direction: '' });

  /** Current paginator state. Defaults to first page, 15 items per page. */
  protected readonly pageState = signal<PageEvent>({ pageIndex: 0, pageSize: 15, length: 0 });

  protected readonly pageSizeOptions = [15, 30, 50, 100, 150];

  private readonly sortRef = viewChild(MatSort);
  private readonly paginatorRef = viewChild(MatPaginator);

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

    // Reset to first page when filter changes so we don't end up on a page that no longer exists.
    effect(() => {
      this.filter();
      this.paginatorRef()?.firstPage();
    });
  }

  /** Updated timestamp shown in the eyebrow (refreshes when data changes). */
  protected readonly updatedAt = computed(() => {
    // Trigger recompute when data changes
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

  /** Accessors used by user-driven column sorting. Return a value comparable for the column. */
  private readonly SORT_ACCESSORS: Record<string, (row: ComputedPurchase) => string | number> = {
    id: row => row.id,
    product: row => row.product,
    category: row => row.category,
    currentStock: row => row.currentStock,
    idleValue: row => row.idleValue,
    averageMargin: row => row.averageMargin ?? 0,
    status: row => this.STATUS_PRIORITY[row.status] ?? 99,
  };

  /** Default ordering: status priority, then lote (id) ascending as tie-break. */
  protected readonly sortedPurchases = computed(() =>
    [...this.data.computedPurchases()].sort((a, b) => {
      const pa = this.STATUS_PRIORITY[a.status] ?? 99;
      const pb = this.STATUS_PRIORITY[b.status] ?? 99;
      if (pa !== pb) return pa - pb;
      return a.id.localeCompare(b.id, undefined, { numeric: true });
    })
  );

  /** Filter by status chip, applied over the default-sorted list. */
  private readonly filteredDefault = computed(() => {
    const f = this.filter();
    const list = this.sortedPurchases();
    if (f === 'all') return list;
    return list.filter(c => c.status === f);
  });

  /** Filtered + user-driven column sort (or default order if no column is active). */
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

  /** Page slice of the filtered/sorted list. */
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

  /** Sparkline of cumulative net profit over the last 30 days. */
  protected readonly profitSparkline = computed(() => this.buildSparkline(s => s.netProfit));

  /** Sparkline of cumulative gross revenue over the last 30 days. */
  protected readonly revenueSparkline = computed(() => this.buildSparkline(s => s.grossRevenue));

  /** Margin trend — daily margin %, last 30 days. */
  protected readonly marginSparkline = computed(() => {
    const sales = this.data.computedSales().filter(s => s.status === 'Concluída');
    if (sales.length < 2) return [];
    const days = 30;
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

  /** Idle capital — current value (single bar). Tracks the absolute capital parado. */
  protected readonly idleSparkline = computed(() => {
    // Build a simple 30-point series: capital parado computed at each day
    const purchases = this.data.computedPurchases();
    const days = 30;
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    const points: number[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const ref = new Date(today);
      ref.setDate(ref.getDate() - i);
      const total = purchases.reduce((acc, c) => {
        if (!c.receiptDate) return acc;
        const start = new Date(c.receiptDate);
        if (start > ref) return acc;
        const soldByDate = this.data.sales()
          .filter(s => s.batchId === c.id && new Date(s.saleDate) <= ref)
          .reduce((sum, s) => sum + s.quantitySold, 0);
        const remaining = Math.max(0, c.quantityPurchased - soldByDate);
        return acc + remaining * c.actualUnitCost;
      }, 0);
      points.push(total);
    }
    return points;
  });

  private buildSparkline(picker: (s: import('../../core/models/models').ComputedSale) => number): number[] {
    const sales = this.data.computedSales().filter(s => s.status === 'Concluída');
    if (sales.length < 2) return [];
    const days = 30;
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    const points: number[] = [];
    let acc = 0;
    for (let i = days - 1; i >= 0; i--) {
      const start = new Date(today);
      start.setDate(start.getDate() - i);
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setHours(23, 59, 59, 999);
      const dayValue = sales
        .filter(s => {
          const d = new Date(s.saleDate);
          return d >= start && d <= end;
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
    this.selectedBatch.set(batch);
  }

  protected closeDetail(): void {
    this.selectedBatch.set(null);
  }

  protected scrollToAlerts(): void {
    document.getElementById('positions-table')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    this.filter.set('Parado');
  }

  /** Marker class for the row's edge stripe — visual signal for status. */
  protected rowStripeClass(c: ComputedPurchase): string {
    switch (c.status) {
      case 'Parado': return 'stripe-danger';
      case 'Atenção': return 'stripe-warning';
      case 'Em trânsito': return 'stripe-info';
      default: return '';
    }
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
        { data: { purchase }, width: '720px', maxWidth: '95vw' },
      )
      .afterClosed()
      .subscribe(result => {
        if (!result) return;
        this.data.updatePurchase(result.id, result);
        this.notify.success(`Lote ${result.id} atualizado.`);
      });
  }

  protected confirmDelete(batch: ComputedPurchase, event: Event): void {
    event.stopPropagation();
    if (batch.quantitySold > 0) {
      this.notify.warning('Lote possui vendas vinculadas. Remova as vendas antes de excluir.');
      return;
    }
    this.dialog
      .open<ConfirmDialogComponent, unknown, ConfirmDialogResult>(ConfirmDialogComponent, {
        width: '420px',
        data: {
          title: 'Excluir este lote?',
          message: `O lote ${batch.id} (${batch.product}) será removido permanentemente.`,
          confirmText: 'Excluir',
          danger: true,
        },
      })
      .afterClosed()
      .subscribe(result => {
        if (!result || !result.confirmed) return;
        this.data.removePurchase(batch.id);
        this.notify.success(`Lote ${batch.id} excluído.`);
      });
  }
}
