import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Chip de filtro/toggle. Componente de atributo: o host é o <button> nativo
 * (foco, teclado e aria-pressed no lugar certo).
 *
 *   <button appChip [active]="filter() === 'all'" (click)="…">Todos</button>
 *   <button appChip [active]="…" [dot]="'success'" [count]="12">Chegou</button>
 */
@Component({
  selector: 'button[appChip]',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './chip.component.html',
  styleUrl: './chip.component.scss',
  host: {
    class: 'chip',
    '[class.chip--active]': 'active()',
    '[attr.aria-pressed]': "active() ? 'true' : 'false'",
  },
})
export class ChipComponent {
  readonly active = input(false);
  /** Cor do dot de status (classe de .status-dot): success/danger/warning/info/neutral/brand */
  readonly dot = input<string>('');
  readonly count = input<number | null>(null);
}
