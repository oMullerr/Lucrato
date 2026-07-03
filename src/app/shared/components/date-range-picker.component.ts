import { ChangeDetectionStrategy, Component, computed, effect, inject, input, model, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { LanguageService } from '../../core/services/language.service';
import { IconComponent } from '../ui/icon/icon.component';
import { MenuComponent } from '../ui/menu/menu.component';
import { MenuItemComponent } from '../ui/menu/menu-item.component';
import { MenuTriggerDirective } from '../ui/menu/menu-trigger.directive';
import { DateInputComponent } from '../ui/date-input/date-input.component';
import { ButtonComponent } from '../ui/button/button.component';

export type RangeKey = '7d' | '30d' | '90d' | '12m' | 'all' | 'custom';

export interface RangeBounds { start: Date; end: Date; }

/** Payload emitido sempre que o período efetivo muda. */
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
 * Seletor de período reutilizável — pills de presets (7d/30d/90d/12m/Tudo) +
 * período personalizado com dois campos de data nativos (editor inline nas
 * pills; embutido no painel na variante menu). Dono de todo o estado; emite os
 * bounds efetivos via `selectionChange`. `range`/`customStart`/`customEnd` são
 * two-way para o host (dashboard) derivar rótulos próprios.
 */
@Component({
  selector: 'app-date-range-picker',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.variant-menu]': "variant() === 'menu'" },
  imports: [
    FormsModule, TranslateModule,
    IconComponent, MenuComponent, MenuItemComponent, MenuTriggerDirective,
    DateInputComponent, ButtonComponent,
  ],
  templateUrl: './date-range-picker.component.html',
  styleUrl: './date-range-picker.component.scss',
})
export class DateRangePickerComponent {
  private readonly t = inject(TranslateService);
  private readonly lang = inject(LanguageService);

  /** Período ativo. Two-way; padrão 'all' (nada filtrado). */
  readonly range = model<RangeKey>('all');
  /** Extremos do período personalizado. Two-way para o host ler/restaurar. */
  readonly customStart = model<Date | null>(null);
  readonly customEnd = model<Date | null>(null);
  /** Renderiza as pills de preset junto com o personalizado. */
  readonly showPresets = input<boolean>(true);
  /** Limite superior do calendário. */
  readonly max = input<Date>(new Date());
  /** Apresentação: 'pills' (segmentado, dashboard) ou 'menu' (dropdown compacto, listagens). */
  readonly variant = input<'pills' | 'menu'>('pills');

  /** Emite os bounds efetivos (+ key/label) a cada mudança de seleção. */
  readonly selectionChange = output<RangeChange>();

  protected readonly rangeOptions = RANGE_OPTIONS;

  /** Editor inline do período personalizado (variante pills). */
  protected readonly customEditorOpen = signal(false);

  /** Rascunho do editor — só commita no Aplicar. */
  protected readonly draftStart = signal<Date | null>(null);
  protected readonly draftEnd = signal<Date | null>(null);
  protected readonly draftValid = computed(() => {
    const s = this.draftStart();
    const e = this.draftEnd();
    return !!s && !!e && s.getTime() <= e.getTime();
  });

  /** Bounds [start, end] do período ativo, ou null para "tudo"/personalizado incompleto. */
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

  /** Rótulo compacto do período personalizado (DD/MM – DD/MM). */
  readonly customRangeLabel = computed(() => {
    const s = this.customStart();
    const e = this.customEnd();
    if (!s || !e) return '';
    const fmt = (d: Date) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
    return `${fmt(s)} – ${fmt(e)}`;
  });

  /** Rótulo maiúsculo do período ativo (ex.: "30 DIAS", "PERSONALIZADO · 01/05 – 10/05"). */
  protected readonly effectiveLabel = computed(() => {
    this.lang.lang(); // reavalia quando o idioma muda
    const r = this.range();
    if (r === 'custom' && this.customStart() && this.customEnd()) {
      return `${this.t.instant('dateRange.customUpper')} · ${this.customRangeLabel()}`;
    }
    const opt = RANGE_OPTIONS.find(o => o.key === r);
    return opt ? (this.t.instant(opt.labelKey) as string).toUpperCase() : '';
  });

  /** Rótulo amigável do gatilho compacto (ex.: "Tudo", "30 dias", "01/05 – 10/05"). */
  protected readonly triggerLabel = computed(() => {
    this.lang.lang(); // reavalia quando o idioma muda
    const r = this.range();
    if (r === 'custom' && this.customStart() && this.customEnd()) {
      return this.customRangeLabel();
    }
    const opt = RANGE_OPTIONS.find(o => o.key === r);
    return opt ? (this.t.instant(opt.labelKey) as string) : '';
  });

  constructor() {
    // Empurra o período efetivo ao host a cada mudança (reativo, sem viewChild).
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
    this.customEditorOpen.set(false);
  }

  /** Limpa qualquer período ativo — volta a "tudo" (sem filtro de data). */
  protected clear(): void {
    this.customStart.set(null);
    this.customEnd.set(null);
    this.range.set('all');
    this.customEditorOpen.set(false);
  }

  /** Abre/fecha o editor inline, semeando o rascunho com o valor atual. */
  protected toggleCustomEditor(): void {
    if (!this.customEditorOpen()) {
      this.draftStart.set(this.customStart());
      this.draftEnd.set(this.customEnd());
    }
    this.customEditorOpen.update(v => !v);
  }

  /** Commita o rascunho como período personalizado. */
  protected applyCustom(): void {
    if (!this.draftValid()) return;
    this.customStart.set(this.draftStart());
    this.customEnd.set(this.draftEnd());
    this.range.set('custom');
    this.customEditorOpen.set(false);
  }
}
