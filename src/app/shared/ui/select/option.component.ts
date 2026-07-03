import { ChangeDetectionStrategy, Component, ElementRef, inject, input } from '@angular/core';
import { SelectComponent } from './select.component';

let nextOptionId = 0;

/**
 * Opção de um app-select. Conteúdo rico é permitido (linhas de detalhe etc.);
 * `label` define o texto do gatilho quando selecionada (senão, textContent).
 */
@Component({
  selector: 'app-option',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<ng-content />`,
  styleUrl: './option.component.scss',
  host: {
    role: 'option',
    '[id]': 'optionId',
    '[attr.aria-selected]': "isSelected ? 'true' : 'false'",
    '[attr.aria-disabled]': "disabled() ? 'true' : null",
    '[class.option--selected]': 'isSelected',
    '[class.option--active]': 'isActive',
    '[class.option--disabled]': 'disabled()',
    '(click)': 'pick()',
  },
})
export class OptionComponent<T = unknown> {
  private readonly select = inject(SelectComponent);
  readonly element = inject(ElementRef<HTMLElement>);

  readonly value = input.required<T>();
  readonly disabled = input(false);
  readonly label = input('');

  readonly optionId = `app-option-${nextOptionId++}`;

  get isSelected(): boolean {
    return this.select.isSelected(this.value());
  }

  get isActive(): boolean {
    return this.select.activeOptionId() === this.optionId;
  }

  /** Texto usado no gatilho quando esta opção está selecionada. */
  get displayLabel(): string {
    return this.label() || this.element.nativeElement.textContent?.trim() || '';
  }

  protected pick(): void {
    if (this.disabled()) return;
    this.select.selectOption(this as unknown as OptionComponent);
  }
}
