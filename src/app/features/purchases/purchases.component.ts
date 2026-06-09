import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSort, MatSortModule, Sort } from '@angular/material/sort';
import { MatPaginator, MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { BreakpointObserver } from '@angular/cdk/layout';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
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
import { BrlPipe } from '../../shared/pipes/brl.pipe';
import { BrDatePipe } from '../../shared/pipes/br-date.pipe';
import { PurchaseFormDialogComponent } from './purchase-form.dialog';

type StatusFilter = 'all' | InventoryStatus;

@Component({
  selector: 'app-purchases',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    MatButtonModule, MatIconModule, MatSidenavModule,
    MatFormFieldModule, MatInputModule, MatTooltipModule,
    MatSortModule, MatPaginatorModule,
    PageHeaderComponent, StatusBadgeComponent,
    EmptyStateComponent, SkeletonComponent, BatchDetailPanelComponent, ColorPillComponent,
    BrlPipe, BrDatePipe,
    TranslateModule,
  ],
  templateUrl: './purchases.component.html',
  styleUrl: './purchases.component.scss',
})
export class PurchasesComponent {
  protected readonly data = inject(DataService);
  private readonly notify = inject(NotifyService);
  private readonly dialog = inject(MatDialog);
  private readonly bp = inject(BreakpointObserver);
  private readonly t = inject(TranslateService);

  protected readonly textFilter = signal('');
  protected readonly statusFilter = signal<StatusFilter>('all');
  protected readonly expandedRow = signal<string | null>(null);
  protected readonly selectedBatch = signal<ComputedPurchase | null>(null);
  protected readonly panelOpen = computed(() => this.selectedBatch() !== null);

  /** Wide viewport (>=1600px) — detail drawer becomes a pinned side column instead of an overlay. */
  protected readonly isWideViewport = toSignal(
    this.bp.observe('(min-width: 1600px)').pipe(map(r => r.matches)),
    { initialValue: globalThis.window ? globalThis.window.innerWidth >= 1600 : false }
  );

  protected readonly purchases = this.data.computedPurchases;

  /** Current sort state from MatSort. Empty `active`/`direction` means use the default sort. */
  protected readonly sortState = signal<Sort>({ active: '', direction: '' });

  /** Current paginator state. Defaults to first page, 15 items per page. */
  protected readonly pageState = signal<PageEvent>({ pageIndex: 0, pageSize: 15, length: 0 });

  protected readonly pageSizeOptions = [15, 30, 50, 100, 150];

  private readonly sortRef = viewChild(MatSort);
  private readonly paginatorRef = viewChild(MatPaginator);

  private readonly STATUS_PRIORITY: Record<InventoryStatus, number> = {
    'Parado': 0,
    'Atenção': 1,
    'Em trânsito': 2,
    'Em Estoque': 3,
    'Vendido': 4,
  };

  /** Accessors used by user-driven column sorting. */
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

    // Reset to first page whenever the filter or search input changes.
    effect(() => {
      this.statusFilter();
      this.textFilter();
      this.paginatorRef()?.firstPage();
    });
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

  /** Status + text filtered list, sorted by purchase date DESC — newest first (default order). */
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
    return [...cs].sort((a, b) => {
      const byDate = b.purchaseDate.localeCompare(a.purchaseDate);
      if (byDate !== 0) return byDate;
      return b.id.localeCompare(a.id, undefined, { numeric: true });
    });
  });

  /** Applies user-driven column sort on top of the filtered list, or returns the default order. */
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

  /** Page slice of the filtered/sorted list. */
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
    this.openForm();
  }

  protected edit(c: ComputedPurchase, event: Event): void {
    event.stopPropagation();
    const { ...purchase } = c as Purchase;
    this.openForm(purchase);
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

  protected onEditRequested(batch: ComputedPurchase): void {
    this.closeDetail();
    this.edit(batch, new Event('synthetic'));
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
          width: '460px',
          maxWidth: '95vw',
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
        width: '420px',
        maxWidth: '95vw',
      })
      .afterClosed()
      .subscribe(confirmed => {
        if (confirmed) {
          this.data.removePurchase(c.id);
          this.notify.success(this.t.instant('purchases.removed', { id: c.id }));
        }
      });
  }

  private openForm(purchase?: Purchase): void {
    this.dialog
      .open<PurchaseFormDialogComponent, { purchase?: Purchase }, Purchase | null>(
        PurchaseFormDialogComponent,
        { data: { purchase }, width: '720px', maxWidth: '95vw' }
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
