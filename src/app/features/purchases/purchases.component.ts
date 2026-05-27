import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatTooltipModule } from '@angular/material/tooltip';
import { DataService } from '../../core/services/data.service';
import { NotifyService } from '../../core/services/notify.service';
import { Purchase, ComputedPurchase, InventoryStatus } from '../../core/models/models';
import { PageHeaderComponent } from '../../shared/components/page-header.component';
import { StatusBadgeComponent } from '../../shared/components/status-badge.component';
import { ConfirmDialogComponent } from '../../shared/components/confirm-dialog.component';
import { EmptyStateComponent } from '../../shared/components/empty-state.component';
import { SkeletonComponent } from '../../shared/components/skeleton.component';
import { BatchDetailPanelComponent } from '../../shared/components/batch-detail-panel.component';
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
    PageHeaderComponent, StatusBadgeComponent,
    EmptyStateComponent, SkeletonComponent, BatchDetailPanelComponent,
    BrlPipe, BrDatePipe,
  ],
  templateUrl: './purchases.component.html',
  styleUrl: './purchases.component.scss',
})
export class PurchasesComponent {
  protected readonly data = inject(DataService);
  private readonly notify = inject(NotifyService);
  private readonly dialog = inject(MatDialog);

  protected readonly textFilter = signal('');
  protected readonly statusFilter = signal<StatusFilter>('all');
  protected readonly expandedRow = signal<string | null>(null);
  protected readonly selectedBatch = signal<ComputedPurchase | null>(null);
  protected readonly panelOpen = computed(() => this.selectedBatch() !== null);

  protected readonly purchases = this.data.computedPurchases;

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

  protected readonly filteredPurchases = computed(() => {
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
    return [...cs].sort((a, b) => b.purchaseDate.localeCompare(a.purchaseDate));
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
      this.notify.warning(
        `Existem ${linkedSales.length} venda(s) vinculada(s). Remova-as antes do lote.`
      );
      return;
    }

    this.dialog
      .open(ConfirmDialogComponent, {
        data: {
          title: 'Remover este lote?',
          message: `O lote ${c.id} ("${c.product}") será removido permanentemente.`,
          danger: true,
          confirmText: 'Remover',
        },
        width: '420px',
        maxWidth: '95vw',
      })
      .afterClosed()
      .subscribe(confirmed => {
        if (confirmed) {
          this.data.removePurchase(c.id);
          this.notify.success(`Lote ${c.id} removido.`);
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
          this.notify.success(`Lote ${result.id} atualizado.`);
        } else {
          if (this.data.findPurchase(result.id)) {
            this.notify.error(`ID ${result.id} já existe.`);
            return;
          }
          this.data.addPurchase(result);
          this.notify.success(`Lote ${result.id} adicionado.`);
        }
      });
  }
}
