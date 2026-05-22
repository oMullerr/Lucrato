import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatChipsModule } from '@angular/material/chips';
import { MatTooltipModule } from '@angular/material/tooltip';
import { DataService } from '../../core/services/data.service';
import { NotifyService } from '../../core/services/notify.service';
import { Purchase, ComputedPurchase, InventoryStatus } from '../../core/models/models';
import { PageHeaderComponent } from '../../shared/components/page-header.component';
import { StatusBadgeComponent } from '../../shared/components/status-badge.component';
import { ConfirmDialogComponent } from '../../shared/components/confirm-dialog.component';
import { BrlPipe } from '../../shared/pipes/brl.pipe';
import { BrDatePipe } from '../../shared/pipes/br-date.pipe';
import { PurchaseFormDialogComponent } from './purchase-form.dialog';

type StatusFilter = 'all' | 'in-transit' | 'in-stock' | 'attention' | 'idle' | 'sold';

@Component({
  selector: 'app-purchases',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    MatButtonModule, MatIconModule, MatCardModule,
    MatFormFieldModule, MatInputModule, MatChipsModule,
    MatTooltipModule,
    PageHeaderComponent, StatusBadgeComponent,
    BrlPipe, BrDatePipe,
  ],
  templateUrl: './purchases.component.html',
  styleUrl: './purchases.component.scss',
})
export class PurchasesComponent {
  private readonly dataService = inject(DataService);
  private readonly notify = inject(NotifyService);
  private readonly dialog = inject(MatDialog);

  protected readonly textFilter = signal('');
  protected readonly statusFilter = signal<StatusFilter>('all');

  protected readonly purchases = this.dataService.computedPurchases;

  protected readonly totals = computed(() => {
    const cs = this.purchases();
    return {
      total: cs.length,
      inTransit: cs.filter(c => c.status === 'Em trânsito').length,
      inStock: cs.filter(c => c.status === 'Em Estoque').length,
      attention: cs.filter(c => c.status === 'Atenção').length,
      idle: cs.filter(c => c.status === 'Parado').length,
      sold: cs.filter(c => c.status === 'Vendido').length,
    };
  });

  protected readonly filteredPurchases = computed(() => {
    const statusMap: Record<Exclude<StatusFilter, 'all'>, InventoryStatus> = {
      'in-transit': 'Em trânsito',
      'in-stock': 'Em Estoque',
      'attention': 'Atenção',
      'idle': 'Parado',
      'sold': 'Vendido',
    };

    let cs = this.purchases();
    const status = this.statusFilter();
    if (status !== 'all') {
      cs = cs.filter(c => c.status === statusMap[status]);
    }
    const text = this.textFilter().trim().toLowerCase();
    if (text) {
      cs = cs.filter(c =>
        c.product.toLowerCase().includes(text) ||
        c.id.toLowerCase().includes(text) ||
        c.category.toLowerCase().includes(text)
      );
    }
    return [...cs].sort((a, b) => b.purchaseDate.localeCompare(a.purchaseDate));
  });

  protected setStatus(s: StatusFilter): void {
    this.statusFilter.set(s);
  }

  protected openNew(): void {
    this.openForm();
  }

  protected edit(c: ComputedPurchase): void {
    this.openForm({ ...c });
  }

  protected confirmRemove(c: ComputedPurchase): void {
    const linkedSales = this.dataService.sales().filter(v => v.batchId === c.id);
    if (linkedSales.length > 0) {
      this.notify.warning(
        `Existem ${linkedSales.length} venda(s) vinculada(s). Remova-as antes do lote.`
      );
      return;
    }

    this.dialog
      .open(ConfirmDialogComponent, {
        data: {
          title: 'Remover Lote',
          message: `Remover o lote ${c.id} — "${c.product}"?`,
          danger: true,
          confirmText: 'Remover',
        },
        width: '420px',
        maxWidth: '95vw',
      })
      .afterClosed()
      .subscribe(confirmed => {
        if (confirmed) {
          this.dataService.removePurchase(c.id);
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
          this.dataService.updatePurchase(purchase.id, result);
          this.notify.success(`Lote ${result.id} atualizado.`);
        } else {
          if (this.dataService.findPurchase(result.id)) {
            this.notify.error(`ID ${result.id} já existe.`);
            return;
          }
          this.dataService.addPurchase(result);
          this.notify.success(`Lote ${result.id} adicionado.`);
        }
      });
  }
}
