import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';
import { DataService } from '../../core/services/data.service';
import { ComputedPurchase } from '../../core/models/models';
import { PageHeaderComponent } from '../../shared/components/page-header.component';
import { KpiCardComponent } from '../../shared/components/kpi-card.component';
import { StatusBadgeComponent } from '../../shared/components/status-badge.component';
import { EmptyStateComponent } from '../../shared/components/empty-state.component';
import { SkeletonComponent } from '../../shared/components/skeleton.component';
import { BrlPipe } from '../../shared/pipes/brl.pipe';
import { BrDatePipe } from '../../shared/pipes/br-date.pipe';

@Component({
  selector: 'app-inventory',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink, MatButtonModule, MatIconModule, MatCardModule,
    PageHeaderComponent, KpiCardComponent, StatusBadgeComponent,
    EmptyStateComponent, SkeletonComponent,
    BrlPipe, BrDatePipe,
  ],
  templateUrl: './inventory.component.html',
  styleUrl: './inventory.component.scss',
})
export class InventoryComponent {
  protected readonly data = inject(DataService);

  protected readonly kpis = this.data.kpis;

  private readonly STATUS_PRIORITY: Record<string, number> = {
    'Parado': 0,
    'Atenção': 1,
    'Em Estoque': 2,
    'Em trânsito': 3,
    'Vendido': 4,
  };

  protected readonly sortedPurchases = computed(() =>
    [...this.data.computedPurchases()].sort((a, b) => {
      const pa = this.STATUS_PRIORITY[a.status] ?? 99;
      const pb = this.STATUS_PRIORITY[b.status] ?? 99;
      if (pa !== pb) return pa - pb;
      return b.daysInStock - a.daysInStock;
    })
  );

  protected readonly alerts = computed(() =>
    this.data.computedPurchases()
      .filter(c => c.status === 'Parado' || c.status === 'Atenção')
      .sort((a, b) => b.daysInStock - a.daysInStock)
  );

  protected readonly alertLevel = computed<'high' | 'medium'>(() =>
    this.alerts().some(a => a.status === 'Parado') ? 'high' : 'medium'
  );

  protected dayClass(c: ComputedPurchase): string {
    const cfg = this.data.settings();
    if (!cfg || c.currentStock <= 0 || !c.receiptDate) return '';
    if (c.daysInStock >= cfg.redAlertDays) return 'alert-red';
    if (c.daysInStock >= cfg.yellowAlertDays) return 'alert-amber';
    return '';
  }

  protected marginClass(margin: number | undefined): string {
    if (margin === undefined) return 'text-muted';
    const cfg = this.data.settings();
    if (margin < 0) return 'text-danger';
    if (cfg && margin < cfg.minimumMargin) return 'text-warning';
    return 'text-success';
  }
}
