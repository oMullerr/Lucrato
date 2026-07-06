import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  TemplateRef,
  ViewContainerRef,
  computed,
  forwardRef,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { Overlay, OverlayRef } from '@angular/cdk/overlay';
import { TemplatePortal } from '@angular/cdk/portal';
import { TranslateModule } from '@ngx-translate/core';
import { LanguageService } from '../../../core/services/language.service';
import { IconComponent } from '../icon/icon.component';
import { ButtonComponent } from '../button/button.component';

export interface DateCell {
  date: Date;
  day: number;
  iso: string;
  inMonth: boolean;
  isToday: boolean;
  isSelected: boolean;
  disabled: boolean;
}

/**
 * Grid fixo de 6 semanas (42 células), domingo como primeiro dia — evita o
 * layout "pular" de altura entre meses de 4/5/6 linhas.
 */
export function buildMonthGrid(
  year: number,
  month: number,
  selected: Date | null,
  min: Date | null,
  max: Date | null,
  today: Date,
): DateCell[][] {
  const first = new Date(year, month, 1);
  const start = new Date(year, month, 1 - first.getDay());
  const weeks: DateCell[][] = [];
  for (let w = 0; w < 6; w++) {
    const week: DateCell[] = [];
    for (let d = 0; d < 7; d++) {
      const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + w * 7 + d);
      week.push({
        date,
        day: date.getDate(),
        iso: toIso(date),
        inMonth: date.getMonth() === month,
        isToday: isSameDay(date, today),
        isSelected: isSameDay(date, selected),
        disabled: isOutOfRange(date, min, max),
      });
    }
    weeks.push(week);
  }
  return weeks;
}

export function addMonths(year: number, month: number, delta: number): { year: number; month: number } {
  const total = year * 12 + month + delta;
  return { year: Math.floor(total / 12), month: ((total % 12) + 12) % 12 };
}

export function isSameDay(a: Date | null, b: Date | null): boolean {
  if (!a || !b) return false;
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function isOutOfRange(d: Date, min: Date | null, max: Date | null): boolean {
  const t = stripTime(d).getTime();
  if (min && t < stripTime(min).getTime()) return true;
  if (max && t > stripTime(max).getTime()) return true;
  return false;
}

function stripTime(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

function addMonthsClamped(d: Date, n: number): Date {
  const { year, month } = addMonths(d.getFullYear(), d.getMonth(), n);
  const lastDay = new Date(year, month + 1, 0).getDate();
  return new Date(year, month, Math.min(d.getDate(), lastDay));
}

function toIso(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** dd/mm/aaaa — datas de negócio ficam em BR independente do idioma da UI (ver brDate pipe). */
export function formatBr(d: Date): string {
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;
}

/**
 * Campo de data com calendário próprio (CDK Overlay) — o popup nativo do
 * navegador não é estilizável (sem API de CSS pras cores internas), então
 * substituímos por um grid de dias na paleta do sistema.
 *
 *   <app-field [label]="…"><app-date-input [(ngModel)]="data" [max]="hoje" /></app-field>
 */
@Component({
  selector: 'app-date-input',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent, ButtonComponent, TranslateModule],
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

  private readonly overlay = inject(Overlay);
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly vcr = inject(ViewContainerRef);
  private readonly destroyRef = inject(DestroyRef);
  private readonly lang = inject(LanguageService);

  private readonly panelTemplate = viewChild.required('panelTpl', { read: TemplateRef });
  private readonly triggerBtn = viewChild.required<ElementRef<HTMLElement>>('triggerBtn');

  protected readonly value = signal<Date | null>(null);
  protected readonly isOpen = signal(false);
  protected readonly viewYear = signal(0);
  protected readonly viewMonth = signal(0);
  protected readonly activeDate = signal<Date | null>(null);
  private readonly cvaDisabled = signal(false);

  protected readonly isDisabled = computed(() => this.disabled() || this.cvaDisabled());

  protected readonly displayValue = computed(() => {
    const v = this.value();
    return v ? formatBr(v) : '';
  });

  protected readonly monthLabel = computed(() => {
    const lang = this.lang.lang();
    const label = new Date(this.viewYear(), this.viewMonth(), 1)
      .toLocaleDateString(lang, { month: 'long', year: 'numeric' });
    return label.charAt(0).toUpperCase() + label.slice(1);
  });

  /** Domingo..sábado — mesma convenção usada no BR e no en-US, sem depender de Intl.Locale.getWeekInfo (suporte de browser incerto). */
  protected readonly weekdayLabels = computed(() => {
    const lang = this.lang.lang();
    const fmt = new Intl.DateTimeFormat(lang, { weekday: 'short' });
    const sunday = new Date(2023, 0, 1); // 2023-01-01 é domingo.
    return Array.from({ length: 7 }, (_, i) => fmt.format(addDays(sunday, i)).replace('.', ''));
  });

  protected readonly weeks = computed(() =>
    buildMonthGrid(this.viewYear(), this.viewMonth(), this.value(), this.min(), this.max(), new Date()),
  );

  private overlayRef: OverlayRef | null = null;
  private onChange: (v: Date | null) => void = () => {};
  protected onTouched: () => void = () => {};

  constructor() {
    this.destroyRef.onDestroy(() => this.overlayRef?.dispose());
  }

  /* ---------- ControlValueAccessor ---------- */
  writeValue(v: Date | string | null): void {
    if (v instanceof Date && !isNaN(v.getTime())) {
      this.value.set(v);
    } else if (typeof v === 'string' && v) {
      const [y, m, d] = v.slice(0, 10).split('-').map(Number);
      this.value.set(y && m && d ? new Date(y, m - 1, d) : null);
    } else {
      this.value.set(null);
    }
  }
  registerOnChange(fn: (v: Date | null) => void): void { this.onChange = fn; }
  registerOnTouched(fn: () => void): void { this.onTouched = fn; }
  setDisabledState(disabled: boolean): void { this.cvaDisabled.set(disabled); }

  /* ---------- Abertura/fechamento ---------- */
  protected toggle(): void {
    if (this.isDisabled()) return;
    this.isOpen() ? this.close() : this.open();
  }

  private open(): void {
    const base = this.value() ?? new Date();
    this.viewYear.set(base.getFullYear());
    this.viewMonth.set(base.getMonth());
    this.activeDate.set(base);

    this.overlayRef = this.overlay.create({
      positionStrategy: this.overlay
        .position()
        .flexibleConnectedTo(this.host)
        .withPositions([
          { originX: 'start', originY: 'bottom', overlayX: 'start', overlayY: 'top', offsetY: 6 },
          { originX: 'start', originY: 'top', overlayX: 'start', overlayY: 'bottom', offsetY: -6 },
          { originX: 'end', originY: 'bottom', overlayX: 'end', overlayY: 'top', offsetY: 6 },
          { originX: 'end', originY: 'top', overlayX: 'end', overlayY: 'bottom', offsetY: -6 },
        ])
        .withViewportMargin(8),
      scrollStrategy: this.overlay.scrollStrategies.reposition(),
      hasBackdrop: true,
      backdropClass: 'cdk-overlay-transparent-backdrop',
    });
    this.overlayRef.backdropClick().subscribe(() => this.close());
    this.overlayRef.keydownEvents().subscribe((e) => {
      if (e.key === 'Escape') { e.stopPropagation(); this.close(); }
    });
    this.overlayRef.attach(new TemplatePortal(this.panelTemplate(), this.vcr));
    this.isOpen.set(true);

    queueMicrotask(() => this.focusActiveCell());
  }

  protected close(): void {
    this.overlayRef?.dispose();
    this.overlayRef = null;
    this.isOpen.set(false);
    this.onTouched();
    this.triggerBtn().nativeElement.focus();
  }

  /* ---------- Seleção ---------- */
  protected pick(cell: DateCell): void {
    if (cell.disabled) return;
    this.commit(cell.date);
  }

  protected pickToday(): void {
    const today = new Date();
    if (isOutOfRange(today, this.min(), this.max())) return;
    this.commit(today);
  }

  protected clear(): void {
    this.value.set(null);
    this.onChange(null);
    this.close();
  }

  private commit(date: Date): void {
    this.value.set(date);
    this.onChange(date);
    this.close();
  }

  /* ---------- Navegação de mês ---------- */
  protected prevMonth(): void { this.shiftMonth(-1); }
  protected nextMonth(): void { this.shiftMonth(1); }

  private shiftMonth(delta: number): void {
    const { year, month } = addMonths(this.viewYear(), this.viewMonth(), delta);
    this.viewYear.set(year);
    this.viewMonth.set(month);
    const active = this.activeDate();
    if (active) this.activeDate.set(addMonthsClamped(active, delta));
    queueMicrotask(() => this.focusActiveCell());
  }

  /* ---------- Teclado ---------- */
  protected onTriggerKeydown(event: KeyboardEvent): void {
    if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key) && !this.isOpen()) {
      event.preventDefault();
      this.open();
    }
  }

  protected onPanelKeydown(event: KeyboardEvent): void {
    const active = this.activeDate() ?? new Date(this.viewYear(), this.viewMonth(), 1);
    let next: Date | null = null;
    switch (event.key) {
      case 'ArrowLeft':  next = addDays(active, -1); break;
      case 'ArrowRight': next = addDays(active, 1); break;
      case 'ArrowUp':    next = addDays(active, -7); break;
      case 'ArrowDown':  next = addDays(active, 7); break;
      case 'Home':       next = addDays(active, -active.getDay()); break;
      case 'End':        next = addDays(active, 6 - active.getDay()); break;
      case 'PageUp':     next = addMonthsClamped(active, -1); break;
      case 'PageDown':   next = addMonthsClamped(active, 1); break;
      case 'Enter':
      case ' ':
        event.preventDefault();
        if (!isOutOfRange(active, this.min(), this.max())) this.commit(active);
        return;
      default:
        return;
    }
    event.preventDefault();
    this.activeDate.set(next);
    if (next.getMonth() !== this.viewMonth() || next.getFullYear() !== this.viewYear()) {
      this.viewYear.set(next.getFullYear());
      this.viewMonth.set(next.getMonth());
    }
    queueMicrotask(() => this.focusActiveCell());
  }

  private focusActiveCell(): void {
    const active = this.activeDate();
    if (!active) return;
    this.overlayRef?.overlayElement
      .querySelector<HTMLElement>(`[data-iso="${toIso(active)}"]`)
      ?.focus();
  }

  protected isActive(cell: DateCell): boolean {
    return isSameDay(cell.date, this.activeDate());
  }
}
