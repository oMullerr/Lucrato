import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { SortDirective } from './sort.directive';
import { IconComponent } from '../icon/icon.component';
import { IconName } from '../icon/icons';

/**
 * Header ordenável — componente de atributo no <th>. Renderiza um botão real
 * (teclado de graça) e expõe aria-sort no th.
 *
 *   <th app-sort-header="qty" class="text-center">{{ 'x.qty' | translate }}</th>
 */
@Component({
  selector: 'th[app-sort-header]',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
  templateUrl: './sort-header.component.html',
  styleUrl: './sort-header.component.scss',
  host: {
    '[attr.aria-sort]': 'ariaSort()',
  },
})
export class SortHeaderComponent {
  private readonly sort = inject(SortDirective);

  readonly key = input.required<string>({ alias: 'app-sort-header' });

  protected readonly state = computed(() => this.sort.stateFor(this.key()));

  protected readonly ariaSort = computed(() => {
    const s = this.state();
    return s === 'asc' ? 'ascending' : s === 'desc' ? 'descending' : null;
  });

  protected readonly icon = computed<IconName>(() => {
    const s = this.state();
    return s === 'asc' ? 'arrow-up' : s === 'desc' ? 'arrow-down' : 'chevrons-up-down';
  });

  protected toggle(): void {
    this.sort.toggle(this.key());
  }
}
