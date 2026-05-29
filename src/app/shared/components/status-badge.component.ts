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
  template: `
    <span class="badge" [attr.data-variant]="config().variant" [attr.data-emphasis]="emphasis()">
      <span class="dot" aria-hidden="true"></span>
      <span class="label">{{ config().label }}</span>
    </span>
  `,
  styles: [`
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 3px 9px 3px 8px;
      border-radius: var(--radius-full);
      font-size: 11px;
      font-weight: 500;
      letter-spacing: 0.01em;
      white-space: nowrap;
      line-height: 1.5;
      color: var(--text-secondary);
      transition: background var(--dur-fast) var(--ease-out);
    }

    .dot {
      width: 6px;
      height: 6px;
      border-radius: var(--radius-full);
      flex-shrink: 0;
      background: currentColor;
      box-shadow: 0 0 0 3px color-mix(in srgb, currentColor 14%, transparent);
    }

    .label {
      color: var(--text-primary);
    }

    /* Variants — minimal style (just colored dot + text) */
    .badge[data-variant="success"] { color: var(--color-success); }
    .badge[data-variant="warning"] { color: var(--color-warning); }
    .badge[data-variant="danger"]  { color: var(--color-danger); }
    .badge[data-variant="info"]    { color: var(--color-info); }
    .badge[data-variant="neutral"] { color: var(--text-muted); }

    /* High emphasis — colored pill background for critical states */
    .badge[data-emphasis="high"] {
      background: color-mix(in srgb, currentColor 12%, transparent);

      .label { color: currentColor; }
      .dot { box-shadow: none; }
    }
  `]
})
export class StatusBadgeComponent {
  readonly status = input.required<StatusType>();
  /** Use 'high' for filled pill background; defaults to minimalist dot+label. */
  readonly emphasis = input<'low' | 'high'>('low');
  readonly config = computed(() => STATUS_MAP[this.status()]);
}
