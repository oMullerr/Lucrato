import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { InventoryStatus, SaleStatus } from '../../core/models/models';

type StatusType = InventoryStatus | SaleStatus;

interface StatusConfig {
  label: string;
  icon: string;
  variant: 'success' | 'info' | 'warning' | 'danger';
}

const STATUS_MAP: Record<StatusType, StatusConfig> = {
  // Estoque
  'Em Estoque': { label: 'Em Estoque', icon: 'inventory_2', variant: 'info' },
  'Vendido':    { label: 'Vendido',    icon: 'check_circle', variant: 'success' },
  'Atenção':    { label: 'Atenção',    icon: 'warning',      variant: 'warning' },
  'Parado':     { label: 'Parado',     icon: 'error',        variant: 'danger' },
  // Venda
  'Concluída':  { label: 'Concluída',  icon: 'check_circle', variant: 'success' },
  'Cancelada':  { label: 'Cancelada',  icon: 'cancel',       variant: 'danger' },
  'Devolvida':  { label: 'Devolvida',  icon: 'undo',         variant: 'warning' },
  'Em disputa': { label: 'Em disputa', icon: 'gavel',        variant: 'info' },
};

@Component({
  selector: 'app-status-badge',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatIconModule],
  template: `
    <span class="badge" [attr.data-variant]="config().variant">
      <mat-icon class="icon">{{ config().icon }}</mat-icon>
      {{ config().label }}
    </span>
  `,
  styles: [`
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 4px 10px;
      border-radius: 12px;
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.3px;
      white-space: nowrap;
    }

    .icon {
      font-size: 14px;
      width: 14px;
      height: 14px;
    }

    .badge[data-variant="success"] {
      background: var(--bg-green);
      color: var(--clr-green);
    }
    .badge[data-variant="warning"] {
      background: var(--bg-amber);
      color: var(--clr-amber);
    }
    .badge[data-variant="danger"] {
      background: var(--bg-red);
      color: var(--clr-red);
    }
    .badge[data-variant="info"] {
      background: var(--bg-blue);
      color: var(--clr-blue);
    }
  `]
})
export class StatusBadgeComponent {
  readonly status = input.required<StatusType>();
  readonly config = computed(() => STATUS_MAP[this.status()]);
}
