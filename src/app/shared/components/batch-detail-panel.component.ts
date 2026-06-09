import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { DataService } from '../../core/services/data.service';
import { QuickActionsService } from '../../core/services/quick-actions.service';
import { LanguageService } from '../../core/services/language.service';
import { ComputedPurchase, ComputedSale } from '../../core/models/models';
import { BrlPipe } from '../pipes/brl.pipe';
import { BrDatePipe } from '../pipes/br-date.pipe';
import { StatusBadgeComponent } from './status-badge.component';
import { ColorPillComponent } from './color-pill.component';

/**
 * Lateral detail sheet for a single purchase batch.
 * Opens on row click from Inventory / Purchases tables.
 */
@Component({
  selector: 'app-batch-detail-panel',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatIconModule, MatButtonModule, MatTooltipModule, TranslateModule, BrlPipe, BrDatePipe, StatusBadgeComponent, ColorPillComponent],
  templateUrl: './batch-detail-panel.component.html',
  styleUrl: './batch-detail-panel.component.scss',
})
export class BatchDetailPanelComponent {
  private readonly dataService = inject(DataService);
  private readonly quick = inject(QuickActionsService);
  private readonly t = inject(TranslateService);
  private readonly lang = inject(LanguageService);

  readonly batch = input.required<ComputedPurchase | null>();
  readonly closed = output<void>();
  readonly editRequested = output<ComputedPurchase>();

  protected readonly batchSales = computed<ComputedSale[]>(() => {
    const b = this.batch();
    if (!b) return [];
    return this.dataService.computedSales()
      .filter(s => s.batchId === b.id)
      .sort((a, c) => c.saleDate.localeCompare(a.saleDate));
  });

  protected readonly recentSales = computed(() => this.batchSales().slice(0, 5));

  protected readonly percentSold = computed(() => {
    const b = this.batch();
    if (!b || b.quantityPurchased === 0) return 0;
    return Math.round((b.quantitySold / b.quantityPurchased) * 100);
  });

  protected readonly marginTone = computed<'positive' | 'negative' | ''>(() => {
    const b = this.batch();
    if (!b || b.averageMargin == null) return '';
    const settings = this.dataService.settings();
    if (!settings) return '';
    if (b.averageMargin < 0) return 'negative';
    if (b.averageMargin < settings.minimumMargin) return 'negative';
    return 'positive';
  });

  protected readonly suggestion = computed(() => {
    this.lang.lang(); // re-evaluate when the language changes
    const b = this.batch();
    if (!b) return null;
    const settings = this.dataService.settings();
    if (!settings) return null;

    if (b.status === 'Vendido') {
      return {
        tone: 'success' as const,
        icon: 'check_circle',
        title: this.t.instant('batchPanel.completedTitle'),
        message: this.t.instant('batchPanel.completedMsg'),
      };
    }

    if (b.status === 'Em trânsito') {
      return {
        tone: 'info' as const,
        icon: 'local_shipping',
        title: this.t.instant('batchPanel.inTransitTitle'),
        message: this.t.instant('batchPanel.inTransitMsg'),
      };
    }

    if (b.status === 'Parado') {
      const suggestedReduction = Math.round((b.daysInStock - settings.redAlertDays) / 5 + 5);
      return {
        tone: 'danger' as const,
        icon: 'priority_high',
        title: this.t.instant('batchPanel.staleTitle', { days: b.daysInStock }),
        message: this.t.instant('batchPanel.staleMsg', {
          value: formatCurrency(b.idleValue),
          pct: suggestedReduction,
        }),
      };
    }

    if (b.averageMargin != null && b.averageMargin < settings.minimumMargin) {
      return {
        tone: 'warning' as const,
        icon: 'trending_down',
        title: this.t.instant('batchPanel.lowMarginTitle'),
        message: this.t.instant('batchPanel.lowMarginMsg', {
          margin: (b.averageMargin * 100).toFixed(1),
          min: (settings.minimumMargin * 100).toFixed(0),
        }),
      };
    }

    if (b.status === 'Atenção') {
      return {
        tone: 'warning' as const,
        icon: 'schedule',
        title: this.t.instant('batchPanel.attentionTitle'),
        message: this.t.instant('batchPanel.attentionMsg', { days: b.daysInStock }),
      };
    }

    return null;
  });

  protected openNewSale(): void {
    const b = this.batch();
    if (!b || b.currentStock <= 0) return;
    this.quick.openNewSale();
  }

  protected markReceived(): void {
    const b = this.batch();
    if (!b || b.receiptDate) return;
    this.quick.markReceivedToday(b);
  }
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
  }).format(value);
}
