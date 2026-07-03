import { ChangeDetectionStrategy, Component, computed, forwardRef, input, signal } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

/**
 * Interruptor (CVA, role="switch").
 *
 *   <app-switch [(ngModel)]="freteIncluso">Frete incluso</app-switch>
 */
@Component({
  selector: 'app-switch',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './switch.component.html',
  styleUrl: './switch.component.scss',
  providers: [
    { provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => SwitchComponent), multi: true },
  ],
})
export class SwitchComponent implements ControlValueAccessor {
  readonly disabled = input(false);

  protected readonly checked = signal(false);
  private readonly cvaDisabled = signal(false);
  protected readonly isDisabled = computed(() => this.disabled() || this.cvaDisabled());

  private onChange: (v: boolean) => void = () => {};
  protected onTouched: () => void = () => {};

  writeValue(v: boolean): void { this.checked.set(!!v); }
  registerOnChange(fn: (v: boolean) => void): void { this.onChange = fn; }
  registerOnTouched(fn: () => void): void { this.onTouched = fn; }
  setDisabledState(disabled: boolean): void { this.cvaDisabled.set(disabled); }

  protected toggle(): void {
    if (this.isDisabled()) return;
    this.checked.update((v) => !v);
    this.onChange(this.checked());
    this.onTouched();
  }
}
