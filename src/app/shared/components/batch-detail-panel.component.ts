import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { DataService } from '../../core/services/data.service';
import { QuickActionsService } from '../../core/services/quick-actions.service';
import { ComputedPurchase, ComputedSale } from '../../core/models/models';
import { BrlPipe } from '../pipes/brl.pipe';
import { BrDatePipe } from '../pipes/br-date.pipe';
import { StatusBadgeComponent } from './status-badge.component';

/**
 * Lateral detail sheet for a single purchase batch.
 * Opens on row click from Inventory / Purchases tables.
 */
@Component({
  selector: 'app-batch-detail-panel',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatIconModule, MatButtonModule, MatTooltipModule, BrlPipe, BrDatePipe, StatusBadgeComponent],
  template: `
    @if (batch(); as b) {
      <aside class="panel" role="dialog" aria-labelledby="bdp-title">
        <header class="panel-head">
          <div class="head-meta">
            <span class="batch-id mono">{{ b.id }}</span>
            <app-status-badge [status]="b.status" />
          </div>
          <button mat-icon-button class="close-btn" (click)="closed.emit()" aria-label="Fechar painel">
            <mat-icon>close</mat-icon>
          </button>
        </header>

        <h2 id="bdp-title" class="batch-title">{{ b.product }}</h2>
        <div class="batch-sub">
          <span>{{ b.category }}</span>
          <span class="bullet">·</span>
          <span>{{ b.supplier }}</span>
        </div>

        <section class="stats" aria-label="Estatísticas do lote">
          <div class="stat">
            <span class="stat-label">Estoque atual</span>
            <span class="stat-value mono" [class.text-success]="b.currentStock > 0" [class.text-muted]="b.currentStock <= 0">
              {{ b.currentStock }}
            </span>
            <span class="stat-hint">de {{ b.quantityPurchased }}</span>
          </div>
          <div class="stat">
            <span class="stat-label">Vendido</span>
            <span class="stat-value mono">{{ b.quantitySold }}</span>
            <span class="stat-hint">{{ percentSold() }}%</span>
          </div>
          <div class="stat">
            <span class="stat-label">Capital parado</span>
            <span class="stat-value mono" [class.text-warning]="b.idleValue > 0">{{ b.idleValue | brl }}</span>
          </div>
          <div class="stat">
            <span class="stat-label">Dias em estoque</span>
            <span class="stat-value mono">{{ b.daysInStock }}</span>
            <span class="stat-hint">dias</span>
          </div>
          <div class="stat">
            <span class="stat-label">Margem média</span>
            <span class="stat-value mono" [attr.data-tone]="marginTone()">
              @if (b.averageMargin != null) { {{ (b.averageMargin * 100).toFixed(1) }}% } @else { — }
            </span>
          </div>
          <div class="stat">
            <span class="stat-label">Custo unitário real</span>
            <span class="stat-value mono">{{ b.actualUnitCost | brl }}</span>
          </div>
        </section>

        @if (suggestion(); as s) {
          <section class="suggestion" [attr.data-tone]="s.tone" aria-live="polite">
            <mat-icon class="sugg-icon">{{ s.icon }}</mat-icon>
            <div class="sugg-body">
              <strong>{{ s.title }}</strong>
              <p>{{ s.message }}</p>
            </div>
          </section>
        }

        @if (batchSales().length > 0) {
          <section class="timeline">
            <div class="section-head">
              <span class="t-caption">Últimas vendas</span>
              <span class="count">{{ batchSales().length }}</span>
            </div>
            <ol class="sales-list">
              @for (s of recentSales(); track s.id) {
                <li class="sale-item">
                  <div class="sale-meta">
                    <span class="sale-id mono">{{ s.id }}</span>
                    <span class="sale-date">{{ s.saleDate | brDate }}</span>
                  </div>
                  <div class="sale-numbers">
                    <span class="sale-qty mono">{{ s.quantitySold }}× {{ s.unitPrice | brl }}</span>
                    <span class="sale-profit mono" [class.text-success]="s.netProfit >= 0" [class.text-danger]="s.netProfit < 0">
                      {{ s.netProfit | brl }}
                    </span>
                  </div>
                </li>
              }
            </ol>
          </section>
        } @else {
          <section class="empty-sales">
            <span class="t-caption">Nenhuma venda registrada para este lote ainda.</span>
          </section>
        }

        <footer class="panel-foot">
          <button mat-stroked-button (click)="editRequested.emit(b)">
            <mat-icon>edit</mat-icon>
            Editar lote
          </button>
          @if (b.status === 'Em trânsito') {
            <button mat-stroked-button class="receive-btn" (click)="markReceived()">
              <mat-icon>move_to_inbox</mat-icon>
              Marcar recebido
            </button>
          }
          <button
            mat-flat-button
            class="primary-cta"
            (click)="openNewSale()"
            [disabled]="b.currentStock <= 0"
            [matTooltip]="b.currentStock <= 0 ? 'Sem estoque disponível' : ''"
          >
            <mat-icon>sell</mat-icon>
            Nova venda
          </button>
        </footer>
      </aside>
    }
  `,
  styles: [`
    .panel {
      display: flex;
      flex-direction: column;
      width: 480px;
      max-width: 100vw;
      height: 100%;
      background: var(--bg-surface-1);
      border-left: 1px solid var(--border-default);
      padding: 24px 24px 16px;
      overflow-y: auto;
      gap: 16px;
    }

    .panel-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }

    .head-meta {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .batch-id {
      font-size: 13px;
      font-weight: 500;
      color: var(--text-muted);
      letter-spacing: 0.02em;
    }

    .close-btn {
      color: var(--text-muted);
    }

    .batch-title {
      font-family: 'Geist', 'Inter', sans-serif;
      font-size: 1.5rem;
      font-weight: 600;
      letter-spacing: -0.025em;
      line-height: 1.2;
      margin: 0;
      color: var(--text-primary);
    }

    .batch-sub {
      display: flex;
      gap: 6px;
      font-size: 13px;
      color: var(--text-muted);
    }

    .bullet { opacity: 0.5; }

    .stats {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 12px;
      padding: 14px;
      background: var(--bg-surface-2);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-lg);
    }

    .stat {
      display: flex;
      flex-direction: column;
      gap: 2px;
      min-width: 0;
    }

    .stat-label {
      font-size: var(--fs-caption);
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: var(--text-muted);
      font-weight: 500;
    }

    .stat-value {
      font-family: 'Geist', 'Inter', sans-serif;
      font-size: 1.0625rem;
      font-weight: 600;
      letter-spacing: -0.02em;
      color: var(--text-primary);
    }

    .stat-value[data-tone="positive"] { color: var(--color-success); }
    .stat-value[data-tone="negative"] { color: var(--color-danger); }

    .stat-hint {
      font-size: 11px;
      color: var(--text-muted);
    }

    .suggestion {
      display: flex;
      gap: 12px;
      padding: 14px;
      border-radius: var(--radius-lg);
      align-items: flex-start;
      background: var(--tint-accent);
      border: 1px solid color-mix(in srgb, var(--brand-accent) 30%, transparent);
    }

    .suggestion[data-tone="warning"] {
      background: var(--tint-warning);
      border-color: color-mix(in srgb, var(--color-warning) 30%, transparent);
    }

    .suggestion[data-tone="danger"] {
      background: var(--tint-danger);
      border-color: color-mix(in srgb, var(--color-danger) 30%, transparent);
    }

    .suggestion[data-tone="success"] {
      background: var(--tint-success);
      border-color: color-mix(in srgb, var(--color-success) 30%, transparent);
    }

    .suggestion[data-tone="info"] {
      background: var(--tint-info);
      border-color: color-mix(in srgb, var(--color-info) 30%, transparent);
    }

    .sugg-icon {
      font-size: 20px;
      width: 20px;
      height: 20px;
      flex-shrink: 0;
      color: var(--brand-accent-2);
    }

    .suggestion[data-tone="warning"] .sugg-icon { color: var(--color-warning); }
    .suggestion[data-tone="danger"] .sugg-icon  { color: var(--color-danger); }
    .suggestion[data-tone="success"] .sugg-icon { color: var(--color-success); }
    .suggestion[data-tone="info"] .sugg-icon    { color: var(--color-info); }

    .sugg-body {
      flex: 1;
      min-width: 0;

      strong {
        display: block;
        font-size: 13px;
        font-weight: 600;
        color: var(--text-primary);
        margin-bottom: 2px;
      }

      p {
        margin: 0;
        font-size: 13px;
        color: var(--text-secondary);
        line-height: 1.5;
      }
    }

    .timeline { display: flex; flex-direction: column; gap: 10px; }

    .section-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .count {
      font-size: 11px;
      font-weight: 600;
      color: var(--text-muted);
      padding: 2px 8px;
      border-radius: var(--radius-full);
      background: var(--bg-surface-2);
    }

    .sales-list {
      list-style: none;
      padding: 0;
      margin: 0;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .sale-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 10px 12px;
      border-radius: var(--radius-md);
      transition: background var(--dur-fast) var(--ease-out);

      &:hover { background: var(--bg-surface-2); }
    }

    .sale-meta { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
    .sale-id { font-size: 12px; color: var(--text-muted); }
    .sale-date { font-size: 13px; color: var(--text-primary); }

    .sale-numbers { display: flex; flex-direction: column; gap: 2px; text-align: right; }
    .sale-qty { font-size: 12px; color: var(--text-muted); }
    .sale-profit { font-size: 14px; font-weight: 600; }

    .empty-sales {
      padding: 24px;
      text-align: center;
      background: var(--bg-surface-2);
      border-radius: var(--radius-lg);
      border: 1px dashed var(--border-default);
    }

    .panel-foot {
      margin-top: auto;
      padding-top: 16px;
      border-top: 1px solid var(--border-subtle);
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      justify-content: flex-end;
    }

    .primary-cta {
      --mdc-filled-button-container-color: var(--brand-primary);
      --mdc-filled-button-label-text-color: #FFFFFF;
    }

    .receive-btn {
      --mdc-outlined-button-label-text-color: var(--color-success);
      --mdc-outlined-button-outline-color: color-mix(in srgb, var(--color-success) 40%, transparent);
    }

    @media (max-width: 600px) {
      .panel {
        width: 100vw;
        padding: 20px 16px 16px;
      }
      .stats { grid-template-columns: repeat(2, 1fr); }
    }
  `]
})
export class BatchDetailPanelComponent {
  private readonly dataService = inject(DataService);
  private readonly quick = inject(QuickActionsService);

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
    const b = this.batch();
    if (!b) return null;
    const settings = this.dataService.settings();
    if (!settings) return null;

    if (b.status === 'Vendido') {
      return {
        tone: 'success' as const,
        icon: 'check_circle',
        title: 'Lote concluído',
        message: 'Esse lote foi totalmente vendido. Considere uma recompra se a margem foi saudável.',
      };
    }

    if (b.status === 'Em trânsito') {
      return {
        tone: 'info' as const,
        icon: 'local_shipping',
        title: 'Lote em trânsito',
        message: 'Marque como recebido quando ele chegar para começar a contar o tempo de estoque.',
      };
    }

    if (b.status === 'Parado') {
      const suggestedReduction = Math.round((b.daysInStock - settings.redAlertDays) / 5 + 5);
      return {
        tone: 'danger' as const,
        icon: 'priority_high',
        title: `Parado há ${b.daysInStock} dias`,
        message: `Capital de ${formatCurrency(b.idleValue)} parado. Considere reduzir o preço em ~${suggestedReduction}% para liberar estoque.`,
      };
    }

    if (b.averageMargin != null && b.averageMargin < settings.minimumMargin) {
      return {
        tone: 'warning' as const,
        icon: 'trending_down',
        title: 'Margem abaixo do mínimo',
        message: `Margem média de ${(b.averageMargin * 100).toFixed(1)}% está abaixo do mínimo configurado (${(settings.minimumMargin * 100).toFixed(0)}%).`,
      };
    }

    if (b.status === 'Atenção') {
      return {
        tone: 'warning' as const,
        icon: 'schedule',
        title: 'Atenção: giro lento',
        message: `Esse lote está em estoque há ${b.daysInStock} dias. Monitore antes que vire capital parado.`,
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
