import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { InventoryStatus, SaleStatus } from '../../core/models/models';

type StatusType = InventoryStatus | SaleStatus;
type Variant = 'success' | 'info' | 'warning' | 'danger' | 'neutral';

interface StatusConfig {
  label: string;
  variant: Variant;
}

const STATUS_MAP: Record<StatusType, StatusConfig> = {
  // Estoque
  'Em Estoque':  { label: 'Em Estoque',  variant: 'success' },
  'Vendido':     { label: 'Vendido',     variant: 'neutral' },
  'Atenção':     { label: 'Atenção',     variant: 'warning' },
  'Parado':      { label: 'Parado',      variant: 'danger' },
  'Em trânsito': { label: 'Em trânsito', variant: 'info' },
  // Venda
  'Concluída':   { label: 'Concluída',   variant: 'success' },
  'Cancelada':   { label: 'Cancelada',   variant: 'danger' },
  'Devolvida':   { label: 'Devolvida',   variant: 'warning' },
  'Em disputa':  { label: 'Em disputa',  variant: 'info' },
};

@Component({
  selector: 'app-status-badge',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './status-badge.component.html',
  styleUrl: './status-badge.component.scss',
})
export class StatusBadgeComponent {
  readonly status = input.required<StatusType>();
  /** Use 'high' for filled pill background; defaults to minimalist dot+label. */
  readonly emphasis = input<'low' | 'high'>('low');
  readonly config = computed(() => STATUS_MAP[this.status()]);
}
