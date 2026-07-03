import { Directive, input, model, output } from '@angular/core';

export type SortDirection = 'asc' | 'desc' | '';

/** Shape-compatible com o `Sort` do Material — specs e páginas não mudam. */
export interface SortState {
  active: string;
  direction: SortDirection;
}

/**
 * Container de ordenação de tabela.
 *
 *   <table appSort [appSortActive]="sort().active" [appSortDirection]="sort().direction"
 *          (appSortChange)="onSort($event)">
 *     <th app-sort-header="qty">Qtd</th>
 *   </table>
 *
 * Ciclo por coluna: asc → desc → sem ordenação (paridade com MatSort).
 */
@Directive({
  selector: '[appSort]',
  standalone: true,
})
export class SortDirective {
  readonly appSortActive = model<string>('');
  readonly appSortDirection = model<SortDirection>('');
  readonly appSortChange = output<SortState>();

  /** Chamado pelos headers filhos. */
  toggle(key: string): void {
    let direction: SortDirection = 'asc';
    if (this.appSortActive() === key) {
      direction = this.appSortDirection() === 'asc' ? 'desc'
        : this.appSortDirection() === 'desc' ? '' : 'asc';
    }
    this.appSortActive.set(direction ? key : '');
    this.appSortDirection.set(direction);
    this.appSortChange.emit({ active: this.appSortActive(), direction });
  }

  stateFor(key: string): SortDirection {
    return this.appSortActive() === key ? this.appSortDirection() : '';
  }
}
