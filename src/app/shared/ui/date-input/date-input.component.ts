import { ChangeDetectionStrategy, Component, computed, forwardRef, input, signal } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

/**
 * Campo de data sobre <input type="date"> nativo (CVA).
 * Valor do modelo: Date | null. No mobile abre o picker do sistema —
 * a melhor UX de data que existe em telefone, de graça.
 *
 *   <app-field [label]="…"><app-date-input [(ngModel)]="data" [max]="hoje" /></app-field>
 */
@Component({
  selector: 'app-date-input',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './date-input.component.html',
  styleUrl: './date-input.component.scss',
  providers: [
    { provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => DateInputComponent), multi: true },
  ],
})
export class DateInputComponent implements ControlValueAccessor {
  readonly min = input<Date | null>(null);
  readonly max = input<Date | null>(null);
  readonly disabled = input(false);

  protected readonly isoValue = signal('');
  private readonly cvaDisabled = signal(false);

  protected readonly isDisabled = computed(() => this.disabled() || this.cvaDisabled());
  protected readonly minIso = computed(() => toIso(this.min()));
  protected readonly maxIso = computed(() => toIso(this.max()));

  private onChange: (v: Date | null) => void = () => {};
  protected onTouched: () => void = () => {};

  writeValue(v: Date | string | null): void {
    if (v instanceof Date && !isNaN(v.getTime())) {
      this.isoValue.set(toIso(v));
    } else if (typeof v === 'string') {
      this.isoValue.set(v.slice(0, 10));
    } else {
      this.isoValue.set('');
    }
  }

  registerOnChange(fn: (v: Date | null) => void): void { this.onChange = fn; }
  registerOnTouched(fn: () => void): void { this.onTouched = fn; }
  setDisabledState(disabled: boolean): void { this.cvaDisabled.set(disabled); }

  protected onInput(iso: string): void {
    this.isoValue.set(iso);
    this.onChange(fromIso(iso));
  }
}

/** Date local → 'yyyy-MM-dd' (sem sustos de fuso: componentes locais). */
function toIso(d: Date | null): string {
  if (!d || isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** 'yyyy-MM-dd' → Date local (meia-noite local, não UTC). */
function fromIso(iso: string): Date | null {
  if (!iso) return null;
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}
