import { Directive, ElementRef, HostListener, forwardRef, inject } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

@Directive({
  selector: 'input[appCurrencyInput]',
  standalone: true,
  providers: [{
    provide: NG_VALUE_ACCESSOR,
    useExisting: forwardRef(() => CurrencyInputDirective),
    multi: true,
  }],
})
export class CurrencyInputDirective implements ControlValueAccessor {
  private readonly el = inject<ElementRef<HTMLInputElement>>(ElementRef);
  private onChange: (value: number) => void = () => {};
  private onTouched: () => void = () => {};

  writeValue(value: number | null): void {
    const cents = Math.round(((value ?? 0) as number) * 100);
    this.el.nativeElement.value = this.format(cents);
  }

  registerOnChange(fn: (value: number) => void): void { this.onChange = fn; }
  registerOnTouched(fn: () => void): void { this.onTouched = fn; }

  setDisabledState(isDisabled: boolean): void {
    this.el.nativeElement.disabled = isDisabled;
  }

  @HostListener('input', ['$event'])
  onInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    const digits = input.value.replace(/\D/g, '');
    const cents = digits ? parseInt(digits, 10) : 0;
    input.value = this.format(cents);
    const len = input.value.length;
    input.setSelectionRange(len, len);
    this.onChange(cents / 100);
  }

  @HostListener('focus')
  onFocus(): void {
    const input = this.el.nativeElement;
    queueMicrotask(() => {
      const len = input.value.length;
      input.setSelectionRange(len, len);
    });
  }

  @HostListener('blur')
  onBlur(): void { this.onTouched(); }

  private format(cents: number): string {
    return (cents / 100).toLocaleString('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }
}
