import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';
import { InventoryStatus, SaleStatus } from '../../core/models/models';

type StatusType = InventoryStatus | SaleStatus;
type Variant = 'success' | 'info' | 'warning' | 'danger' | 'neutral';

/** Maps each status value to its badge color. The label is the status value
 *  itself, resolved as the i18n key `status.<value>` in the template. */
const STATUS_VARIANT: Record<StatusType, Variant> = {
  // Estoque
  'Em Estoque':  'success',
  'Vendido':     'neutral',
  'Atenção':     'warning',
  'Parado':      'danger',
  'Em trânsito': 'info',
  // Venda
  'Concluída':   'success',
  'Cancelada':   'danger',
  'Devolvida':   'warning',
  'Em disputa':  'info',
};

@Component({
  selector: 'app-status-badge',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslateModule],
  templateUrl: './status-badge.component.html',
  styleUrl: './status-badge.component.scss',
})
export class StatusBadgeComponent {
  readonly status = input.required<StatusType>();
  /** Use 'high' for filled pill background; defaults to minimalist dot+label. */
  readonly emphasis = input<'low' | 'high'>('low');
  readonly variant = computed(() => STATUS_VARIANT[this.status()]);
}
