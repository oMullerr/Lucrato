import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import { DataService } from '../../core/services/data.service';
import { NotifyService } from '../../core/services/notify.service';
import { Sale, ComputedSale } from '../../core/models/models';
import { PageHeaderComponent } from '../../shared/components/page-header.component';
import { StatusBadgeComponent } from '../../shared/components/status-badge.component';
import { ConfirmDialogComponent } from '../../shared/components/confirm-dialog.component';
import { BrlPipe } from '../../shared/pipes/brl.pipe';
import { BrDatePipe } from '../../shared/pipes/br-date.pipe';
import { SaleFormDialogComponent } from './sale-form.dialog';

@Component({
  selector: 'app-sales',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    MatButtonModule, MatIconModule, MatCardModule,
    MatFormFieldModule, MatInputModule, MatSelectModule, MatTooltipModule,
    PageHeaderComponent, StatusBadgeComponent,
    BrlPipe, BrDatePipe,
  ],
  templateUrl: './sales.component.html',
  styleUrl: './sales.component.scss',
})
export class SalesComponent {
  private readonly dataService = inject(DataService);
  private readonly notify = inject(NotifyService);
  private readonly dialog = inject(MatDialog);

  protected readonly textFilter = signal('');
  protected readonly channelFilter = signal('all');
  protected readonly statusFilter = signal('all');

  protected readonly sales = this.dataService.computedSales;
  protected readonly channels = computed(() => this.dataService.settings()?.channels ?? []);
  protected readonly defaultFee = computed(() => this.dataService.settings()?.defaultMlFee ?? 0.12);

  protected readonly filteredSales = computed(() => {
    let vs = this.sales();
    if (this.channelFilter() !== 'all') {
      vs = vs.filter(v => v.channel === this.channelFilter());
    }
    if (this.statusFilter() !== 'all') {
      vs = vs.filter(v => v.status === this.statusFilter());
    }
    const text = this.textFilter().trim().toLowerCase();
    if (text) {
      vs = vs.filter(v =>
        v.product.toLowerCase().includes(text) ||
        v.id.toLowerCase().includes(text) ||
        v.batchId.toLowerCase().includes(text)
      );
    }
    return [...vs].sort((a, b) => b.saleDate.localeCompare(a.saleDate));
  });

  protected readonly summary = computed(() => {
    const completed = this.filteredSales().filter(v => v.status === 'Concluída');
    const revenue = completed.reduce((s, v) => s + v.grossRevenue, 0);
    const fees = completed.reduce((s, v) => s + v.feeAmount, 0);
    const profit = completed.reduce((s, v) => s + v.netProfit, 0);
    return {
      total: this.sales().length,
      revenue,
      fees,
      profit,
      margin: revenue > 0 ? profit / revenue : 0,
    };
  });

  protected openNew(): void {
    this.openForm();
  }

  protected edit(v: ComputedSale): void {
    this.openForm({ ...v });
  }

  protected confirmRemove(v: ComputedSale): void {
    this.dialog
      .open(ConfirmDialogComponent, {
        data: {
          title: 'Remover Venda',
          message: `Remover a venda ${v.id} — "${v.product}"?`,
          danger: true,
          confirmText: 'Remover',
        },
        width: '420px',
      })
      .afterClosed()
      .subscribe(confirmed => {
        if (confirmed) {
          this.dataService.removeSale(v.id);
          this.notify.success(`Venda ${v.id} removida.`);
        }
      });
  }

  protected isCustomFee(fee: number): boolean {
    return Math.abs(fee - this.defaultFee()) > 0.0001;
  }

  protected marginClass(margin: number): string {
    if (margin < 0) return 'text-danger';
    const cfg = this.dataService.settings();
    if (cfg && margin < cfg.minimumMargin) return 'text-warning';
    return 'text-success';
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
          this.dataService.updateSale(sale.id, result);
          this.notify.success(`Venda ${result.id} atualizada.`);
        } else {
          if (this.dataService.findSale(result.id)) {
            this.notify.error(`ID ${result.id} já existe.`);
            return;
          }
          this.dataService.addSale(result);
          this.notify.success(`Venda ${result.id} registrada.`);
        }
      });
  }
}
