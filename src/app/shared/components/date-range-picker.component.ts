import { ChangeDetectionStrategy, Component, computed, effect, inject, input, model, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatMenuModule } from '@angular/material/menu';
import { MatDividerModule } from '@angular/material/divider';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { LanguageService } from '../../core/services/language.service';

export type RangeKey = '7d' | '30d' | '90d' | '12m' | 'all' | 'custom';

export interface RangeBounds { start: Date; end: Date; }

/** Payload emitted whenever the effective range changes. */
export interface RangeChange { bounds: RangeBounds | null; key: RangeKey; label: string; }

interface RangeOption { key: RangeKey; labelKey: string; }

const RANGE_OPTIONS: RangeOption[] = [
  { key: '7d',  labelKey: 'dateRange.range7d' },
  { key: '30d', labelKey: 'dateRange.range30d' },
  { key: '90d', labelKey: 'dateRange.range90d' },
  { key: '12m', labelKey: 'dateRange.range12m' },
  { key: 'all', labelKey: 'dateRange.rangeAll' },
];

/**
 * Reusable period selector — quick-preset pills (7d/30d/90d/12m/All) plus a
 * custom calendar range. Owns all range state; emits the effective bounds via
 * `selectionChange`. Also exposes `range`/`customStart`/`customEnd` as two-way
 * models so a host (the dashboard) can keep deriving its own labels from them.
 * (The output is NOT named `rangeChange` — that name is reserved by the `range`
 * model's two-way binding.)
 */
@Component({
  selector: 'app-date-range-picker',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.variant-menu]': "variant() === 'menu'" },
  imports: [
    FormsModule,
    MatIconModule, MatFormFieldModule, MatInputModule, MatDatepickerModule,
    MatMenuModule, MatDividerModule,
    TranslateModule,
  ],
  templateUrl: './date-range-picker.component.html',
  styleUrl: './date-range-picker.component.scss',
})
export class DateRangePickerComponent {
  private readonly t = inject(TranslateService);
  private readonly lang = inject(LanguageService);

  /** Active range key. Two-way; defaults to 'all' so nothing is filtered out by default. */
  readonly range = model<RangeKey>('all');
  /** Custom range endpoints. Two-way so a host can read/restore them. */
  readonly customStart = model<Date | null>(null);
  readonly customEnd = model<Date | null>(null);
  /** Render the preset pills alongside the custom range. */
  readonly showPresets = input<boolean>(true);
  /** Upper bound for the calendar. */
  readonly max = input<Date>(new Date());
  /** Presentation: 'pills' (segmented, dashboard) or 'menu' (compact dropdown, listings). */
  readonly variant = input<'pills' | 'menu'>('pills');

  /** Emits the effective bounds (+ key/label) whenever the selection changes. */
  readonly selectionChange = output<RangeChange>();

  protected readonly rangeOptions = RANGE_OPTIONS;

  /** Bounds [start, end] for the active range, or null for "all"/incomplete custom. */
  readonly rangeBounds = computed<RangeBounds | null>(() => {
    const r = this.range();
    if (r === 'custom') {
      const s = this.customStart();
      const e = this.customEnd();
      if (!s || !e) return null;
      const start = new Date(s); start.setHours(0, 0, 0, 0);
      const end = new Date(e); end.setHours(23, 59, 59, 999);
      return { start, end };
    }
    if (r === 'all') return null;
    const end = new Date(); end.setHours(23, 59, 59, 999);
    const start = new Date(); start.setHours(0, 0, 0, 0);
    switch (r) {
      case '7d':  start.setDate(start.getDate() - 7); break;
      case '30d': start.setDate(start.getDate() - 30); break;
      case '90d': start.setDate(start.getDate() - 90); break;
      case '12m': start.setMonth(start.getMonth() - 12); break;
    }
    return { start, end };
  });

  /** Compact label for the custom pill (DD/MM – DD/MM). */
  readonly customRangeLabel = computed(() => {
    const s = this.customStart();
    const e = this.customEnd();
    if (!s || !e) return '';
    const fmt = (d: Date) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
    return `${fmt(s)} – ${fmt(e)}`;
  });

  /** Uppercased label for the active range (eg. "30 DIAS", "PERSONALIZADO · 01/05 – 10/05"). */
  protected readonly effectiveLabel = computed(() => {
    this.lang.lang(); // re-evaluate when the language changes
    const r = this.range();
    if (r === 'custom' && this.customStart() && this.customEnd()) {
      return `${this.t.instant('dateRange.customUpper')} · ${this.customRangeLabel()}`;
    }
    const opt = RANGE_OPTIONS.find(o => o.key === r);
    return opt ? (this.t.instant(opt.labelKey) as string).toUpperCase() : '';
  });

  /** Friendly label for the compact dropdown trigger (eg. "Tudo", "30 dias", "01/05 – 10/05"). */
  protected readonly triggerLabel = computed(() => {
    this.lang.lang(); // re-evaluate when the language changes
    const r = this.range();
    if (r === 'custom' && this.customStart() && this.customEnd()) {
      return this.customRangeLabel();
    }
    const opt = RANGE_OPTIONS.find(o => o.key === r);
    return opt ? (this.t.instant(opt.labelKey) as string) : '';
  });

  constructor() {
    // Push the effective range to the host whenever it changes (timing-safe: runs
    // reactively, never reads an uninitialized viewChild).
    effect(() => {
      this.selectionChange.emit({
        bounds: this.rangeBounds(),
        key: this.range(),
        label: this.effectiveLabel(),
      });
    });
  }

  protected setRange(r: RangeKey): void {
    this.range.set(r);
  }

  /** Clears any active period (preset or custom) — back to "all" (no date filtering). */
  protected clear(): void {
    this.customStart.set(null);
    this.customEnd.set(null);
    this.range.set('all');
  }

  /** Called when the date-range picker closes. Only commits if both dates are set. */
  protected onPickerClosed(): void {
    if (this.customStart() && this.customEnd()) {
      this.range.set('custom');
    }
  }
}
