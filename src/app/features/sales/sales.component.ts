import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
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

  protected readonly filteredSales = computed(() => {
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
    return [...vs].sort((a, b) => b.saleDate.localeCompare(a.saleDate));
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
