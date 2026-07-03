import { Directive, inject } from '@angular/core';
import { FieldComponent } from './field.component';

/**
 * Input nativo dentro de um app-field. Liga id/aria ao field pai e
 * notifica mudanças de estado (blur/input) para o feedback por campo.
 */
@Directive({
  selector: 'input[appInput], textarea[appInput], select[appInput]',
  standalone: true,
  host: {
    class: 'app-input',
    '[id]': 'field?.fieldId',
    '[attr.aria-invalid]': "field?.showError() ? 'true' : null",
    '[attr.aria-describedby]': 'describedBy',
    '(blur)': 'field?.bumpState()',
    '(input)': 'field?.bumpState()',
  },
})
export class InputDirective {
  protected readonly field = inject(FieldComponent, { optional: true });

  protected get describedBy(): string | null {
    if (!this.field) return null;
    if (this.field.showError()) return `${this.field.fieldId}-error`;
    return `${this.field.fieldId}-hint`;
  }
}
