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
import { BrlPipe } from '../../shared/pipes/brl.pipe';
import { BrDatePipe } from '../../shared/pipes/br-date.pipe';

@Component({
  selector: 'app-inventory',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink, MatButtonModule, MatIconModule, MatCardModule,
    PageHeaderComponent, KpiCardComponent, StatusBadgeComponent,
    BrlPipe, BrDatePipe,
  ],
  templateUrl: './inventory.component.html',
  styleUrl: './inventory.component.scss',
})
export class InventoryComponent {
  private readonly dataService = inject(DataService);

  protected readonly kpis = this.dataService.kpis;

  protected readonly sortedPurchases = computed(() =>
    [...this.dataService.computedPurchases()].sort((a, b) => {
      if (a.currentStock > 0 && b.currentStock <= 0) return -1;
      if (a.currentStock <= 0 && b.currentStock > 0) return 1;
      return b.daysInStock - a.daysInStock;
    })
  );

  protected readonly alerts = computed(() =>
    this.dataService.computedPurchases()
      .filter(c => c.status === 'Parado' || c.status === 'Atenção')
      .sort((a, b) => b.daysInStock - a.daysInStock)
  );

  protected dayClass(c: ComputedPurchase): string {
    const cfg = this.dataService.settings();
    if (!cfg || c.currentStock <= 0 || !c.receiptDate) return '';
    if (c.daysInStock >= cfg.redAlertDays) return 'alert-red';
    if (c.daysInStock >= cfg.yellowAlertDays) return 'alert-amber';
    return '';
  }

  protected marginClass(margin: number | undefined): string {
    if (margin === undefined) return 'text-muted';
    const cfg = this.dataService.settings();
    if (margin < 0) return 'text-danger';
    if (cfg && margin < cfg.minimumMargin) return 'text-warning';
    return 'text-success';
  }
}
