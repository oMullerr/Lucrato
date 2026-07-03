import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Indicador de progresso indeterminado (arco SVG).
 * Com reduced-motion, a animação global é congelada e o arco vira glifo estático.
 */
@Component({
  selector: 'app-spinner',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './spinner.component.html',
  styleUrl: './spinner.component.scss',
  host: {
    role: 'progressbar',
    '[style.--spinner-size.px]': 'size()',
    '[attr.aria-label]': 'label() || null',
  },
})
export class SpinnerComponent {
  readonly size = input(20);
  readonly label = input('');
}
