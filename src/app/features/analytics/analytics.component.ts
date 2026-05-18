import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatTabsModule } from '@angular/material/tabs';
import { CommonModule } from '@angular/common';
import { DataService } from '../../core/services/data.service';
import { PageHeaderComponent } from '../../shared/components/page-header.component';
import { StatusBadgeComponent } from '../../shared/components/status-badge.component';
import { BrlPipe } from '../../shared/pipes/brl.pipe';

interface ProductStat {
  product: string;
  qty: number;
  revenue: number;
  netRevenue: number;
  cost: number;
  grossProfit: number;
  netProfit: number;
  margin: number;
}

interface CategoryStat {
  category: string;
  batches: number;
  invested: number;
  idleCapital: number;
  revenue: number;
  profit: number;
  margin: number;
}

interface MonthStat {
  month: string;
  qty: number;
  revenue: number;
  fees: number;
  netRevenue: number;
  cost: number;
  profit: number;
  margin: number;
}

const MONTHS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

@Component({
  selector: 'app-analytics',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule, MatCardModule, MatIconModule, MatTabsModule,
    PageHeaderComponent, StatusBadgeComponent, BrlPipe,
  ],
  templateUrl: './analytics.component.html',
  styleUrl: './analytics.component.scss',
})
export class AnalyticsComponent {
  private readonly dataService = inject(DataService);

  protected readonly kpis = this.dataService.kpis;

  protected readonly productRanking = computed<ProductStat[]>(() => {
    const completed = this.dataService.computedSales().filter(v => v.status === 'Concluída');
    const map = new Map<string, ProductStat>();

    for (const v of completed) {
      const e = map.get(v.product) ?? {
        product: v.product, qty: 0, revenue: 0, netRevenue: 0,
        cost: 0, grossProfit: 0, netProfit: 0, margin: 0,
      };
      e.qty += v.quantitySold;
      e.revenue += v.grossRevenue;
      e.netRevenue += v.netRevenue;
      e.cost += v.proportionalCost;
      e.grossProfit += v.grossProfit;
      e.netProfit += v.netProfit;
      map.set(v.product, e);
    }

    return [...map.values()]
      .map(e => ({ ...e, margin: e.revenue > 0 ? e.netProfit / e.revenue : 0 }))
      .sort((a, b) => b.netProfit - a.netProfit);
  });

  protected readonly categoryStats = computed<CategoryStat[]>(() => {
    const purchases = this.dataService.computedPurchases();
    const completed = this.dataService.computedSales().filter(v => v.status === 'Concluída');
    const map = new Map<string, CategoryStat>();

    for (const c of purchases) {
      const e = map.get(c.category) ?? {
        category: c.category, batches: 0, invested: 0,
        idleCapital: 0, revenue: 0, profit: 0, margin: 0,
      };
      e.batches += 1;
      e.invested += c.totalActualCost;
      e.idleCapital += c.idleValue;
      map.set(c.category, e);
    }

    for (const v of completed) {
      const batch = purchases.find(c => c.id === v.batchId);
      if (!batch) continue;
      const e = map.get(batch.category);
      if (!e) continue;
      e.revenue += v.grossRevenue;
      e.profit += v.netProfit;
    }

    return [...map.values()]
      .map(e => ({ ...e, margin: e.revenue > 0 ? e.profit / e.revenue : 0 }))
      .sort((a, b) => b.profit - a.profit);
  });

  protected readonly monthlyStats = computed<MonthStat[]>(() => {
    const completed = this.dataService.computedSales().filter(v => v.status === 'Concluída');
    const map = new Map<string, MonthStat>();

    for (const v of completed) {
      const d = new Date(v.saleDate);
      const key = `${MONTHS[d.getUTCMonth()]}/${d.getUTCFullYear()}`;
      const e = map.get(key) ?? {
        month: key, qty: 0, revenue: 0, fees: 0,
        netRevenue: 0, cost: 0, profit: 0, margin: 0,
      };
      e.qty += v.quantitySold;
      e.revenue += v.grossRevenue;
      e.fees += v.feeAmount;
      e.netRevenue += v.netRevenue;
      e.cost += v.proportionalCost;
      e.profit += v.netProfit;
      map.set(key, e);
    }

    return [...map.values()]
      .map(e => ({ ...e, margin: e.revenue > 0 ? e.profit / e.revenue : 0 }))
      .sort((a, b) => a.month.localeCompare(b.month));
  });

  protected readonly idleInventory = computed(() =>
    this.dataService.computedPurchases()
      .filter(c => c.currentStock > 0)
      .sort((a, b) => b.idleValue - a.idleValue)
  );

  protected marginClass(m: number): string {
    if (m < 0) return 'text-danger';
    const cfg = this.dataService.settings();
    if (cfg && m < cfg.minimumMargin) return 'text-warning';
    return 'text-success';
  }
}
