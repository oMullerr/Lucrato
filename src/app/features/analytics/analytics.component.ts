import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTabsModule } from '@angular/material/tabs';
import { CommonModule } from '@angular/common';
import { DataService } from '../../core/services/data.service';
import { PageHeaderComponent } from '../../shared/components/page-header.component';
import { StatusBadgeComponent } from '../../shared/components/status-badge.component';
import { EmptyStateComponent } from '../../shared/components/empty-state.component';
import { SkeletonComponent } from '../../shared/components/skeleton.component';
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
  sortKey: string;
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
    RouterLink, CommonModule, MatCardModule, MatIconModule, MatButtonModule, MatTabsModule,
    PageHeaderComponent, StatusBadgeComponent, EmptyStateComponent, SkeletonComponent, BrlPipe,
  ],
  templateUrl: './analytics.component.html',
  styleUrl: './analytics.component.scss',
})
export class AnalyticsComponent {
  protected readonly data = inject(DataService);

  protected readonly kpis = this.data.kpis;
  protected readonly hasData = computed(() =>
    this.data.sales().length > 0 || this.data.purchases().length > 0
  );

  protected readonly productRanking = computed<ProductStat[]>(() => {
    const completed = this.data.computedSales().filter(v => v.status === 'Concluída');
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
    const purchases = this.data.computedPurchases();
    const completed = this.data.computedSales().filter(v => v.status === 'Concluída');
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
    const completed = this.data.computedSales().filter(v => v.status === 'Concluída');
    const map = new Map<string, MonthStat>();

    for (const v of completed) {
      const d = new Date(v.saleDate);
      const year = d.getUTCFullYear();
      const month = d.getUTCMonth();
      const sortKey = `${year}${String(month).padStart(2, '0')}`;
      const displayMonth = `${MONTHS[month]}/${year}`;
      const e = map.get(sortKey) ?? {
        month: displayMonth, sortKey, qty: 0, revenue: 0, fees: 0,
        netRevenue: 0, cost: 0, profit: 0, margin: 0,
      };
      e.qty += v.quantitySold;
      e.revenue += v.grossRevenue;
      e.fees += v.feeAmount;
      e.netRevenue += v.netRevenue;
      e.cost += v.proportionalCost;
      e.profit += v.netProfit;
      map.set(sortKey, e);
    }

    return [...map.values()]
      .map(e => ({ ...e, margin: e.revenue > 0 ? e.profit / e.revenue : 0 }))
      .sort((a, b) => a.sortKey.localeCompare(b.sortKey));
  });

  protected readonly idleInventory = computed(() =>
    this.data.computedPurchases()
      .filter(c => c.currentStock > 0)
      .sort((a, b) => b.idleValue - a.idleValue)
  );

  protected marginClass(m: number): string {
    if (m < 0) return 'text-danger';
    const cfg = this.data.settings();
    if (cfg && m < cfg.minimumMargin) return 'text-warning';
    return 'text-success';
  }
}
