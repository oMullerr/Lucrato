import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  TemplateRef,
  ViewContainerRef,
  computed,
  contentChildren,
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
import { IconComponent } from '../icon/icon.component';
import { OptionComponent } from './option.component';

/**
 * Select do design system (padrão combobox + listbox), ControlValueAccessor —
 * os call sites continuam usando [(ngModel)].
 *
 *   <app-select [(ngModel)]="categoria" [placeholder]="…">
 *     @for (c of categorias; track c) { <app-option [value]="c">{{ c }}</app-option> }
 *   </app-select>
 *
 * `searchable` adiciona campo de busca no painel (filtra pelo texto da opção)
 * — cobre o select-com-busca de lotes do formulário de venda.
 */
@Component({
  selector: 'app-select',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent, TranslateModule],
  templateUrl: './select.component.html',
  styleUrl: './select.component.scss',
  providers: [
    { provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => SelectComponent), multi: true },
  ],
})
export class SelectComponent<T = unknown> implements ControlValueAccessor {
  readonly placeholder = input('');
  readonly searchable = input(false);
  readonly searchPlaceholder = input('');
  readonly disabled = input(false);

  private readonly overlay = inject(Overlay);
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly vcr = inject(ViewContainerRef);
  private readonly destroyRef = inject(DestroyRef);

  private readonly options = contentChildren(OptionComponent, { descendants: true });
  private readonly panelTemplate = viewChild.required('panelTpl', { read: TemplateRef });
  private readonly trigger = viewChild.required<ElementRef<HTMLElement>>('triggerBtn');

  protected readonly value = signal<T | null>(null);
  protected readonly isOpen = signal(false);
  protected readonly searchText = signal('');
  readonly activeOptionId = signal('');
  private readonly cvaDisabled = signal(false);

  protected readonly isDisabled = computed(() => this.disabled() || this.cvaDisabled());

  /** Rótulo do gatilho: opção selecionada ou placeholder. */
  protected readonly triggerLabel = computed(() => {
    const current = this.value();
    const opt = this.options().find((o) => this.sameValue(o.value() as T, current));
    return opt?.displayLabel ?? '';
  });

  private overlayRef: OverlayRef | null = null;
  private onChange: (v: T | null) => void = () => {};
  private onTouched: () => void = () => {};

  constructor() {
    this.destroyRef.onDestroy(() => this.overlayRef?.dispose());
  }

  /* ---------- ControlValueAccessor ---------- */
  writeValue(v: T | null): void { this.value.set(v); }
  registerOnChange(fn: (v: T | null) => void): void { this.onChange = fn; }
  registerOnTouched(fn: () => void): void { this.onTouched = fn; }
  setDisabledState(disabled: boolean): void { this.cvaDisabled.set(disabled); }

  /* ---------- API interna para as opções ---------- */
  isSelected(v: unknown): boolean {
    return this.sameValue(v as T, this.value());
  }

  selectOption(option: OptionComponent): void {
    this.value.set(option.value() as T);
    this.onChange(this.value());
    this.close();
  }

  private sameValue(a: T | null, b: T | null): boolean {
    return a === b;
  }

  /* ---------- Abertura/fechamento ---------- */
  protected toggle(): void {
    if (this.isDisabled()) return;
    this.isOpen() ? this.close() : this.open();
  }

  private open(): void {
    const width = this.host.nativeElement.getBoundingClientRect().width;
    this.overlayRef = this.overlay.create({
      positionStrategy: this.overlay
        .position()
        .flexibleConnectedTo(this.host)
        .withPositions([
          { originX: 'start', originY: 'bottom', overlayX: 'start', overlayY: 'top', offsetY: 6 },
          { originX: 'start', originY: 'top', overlayX: 'start', overlayY: 'bottom', offsetY: -6 },
        ])
        .withViewportMargin(8),
      scrollStrategy: this.overlay.scrollStrategies.reposition(),
      hasBackdrop: true,
      backdropClass: 'cdk-overlay-transparent-backdrop',
      minWidth: Math.max(width, 220),
    });
    this.overlayRef.backdropClick().subscribe(() => this.close());
    this.overlayRef.keydownEvents().subscribe((e) => {
      if (e.key === 'Escape') { e.stopPropagation(); this.close(); }
    });
    this.overlayRef.attach(new TemplatePortal(this.panelTemplate(), this.vcr));
    this.isOpen.set(true);
    this.searchText.set('');
    this.setActive(this.selectedOrFirstIndex());

    queueMicrotask(() => {
      const search = this.overlayRef?.overlayElement.querySelector<HTMLElement>('.select-search input');
      (search ?? this.overlayRef?.overlayElement.querySelector<HTMLElement>('.select-listbox'))?.focus();
      this.scrollActiveIntoView();
    });
  }

  protected close(): void {
    this.overlayRef?.dispose();
    this.overlayRef = null;
    this.isOpen.set(false);
    this.onTouched();
    this.trigger().nativeElement.focus();
  }

  /* ---------- Busca ---------- */
  protected onSearch(term: string): void {
    this.searchText.set(term);
    /* Esconde/mostra opções direto no DOM do painel (conteúdo projetado). */
    const t = term.trim().toLowerCase();
    for (const opt of this.options()) {
      const el = opt.element.nativeElement;
      const match = !t || (el.textContent ?? '').toLowerCase().includes(t);
      el.style.display = match ? '' : 'none';
    }
    this.setActive(this.visibleOptions().length ? 0 : -1);
  }

  protected readonly hasVisibleOptions = computed(() => {
    this.searchText();
    return this.visibleOptions().length > 0;
  });

  private visibleOptions(): OptionComponent[] {
    return this.options().filter(
      (o) => !o.disabled() && o.element.nativeElement.style.display !== 'none',
    );
  }

  /* ---------- Teclado (aria-activedescendant) ---------- */
  private setActive(index: number): void {
    const visible = this.visibleOptions();
    this.activeOptionId.set(index >= 0 && visible[index] ? visible[index].optionId : '');
  }

  private selectedOrFirstIndex(): number {
    const visible = this.visibleOptions();
    const idx = visible.findIndex((o) => this.isSelected(o.value()));
    return idx >= 0 ? idx : visible.length ? 0 : -1;
  }

  protected onPanelKeydown(event: KeyboardEvent): void {
    const visible = this.visibleOptions();
    if (!visible.length) return;
    const activeIdx = visible.findIndex((o) => o.optionId === this.activeOptionId());
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        this.setActive(Math.min(activeIdx + 1, visible.length - 1));
        this.scrollActiveIntoView();
        break;
      case 'ArrowUp':
        event.preventDefault();
        this.setActive(Math.max(activeIdx - 1, 0));
        this.scrollActiveIntoView();
        break;
      case 'Home':
        event.preventDefault();
        this.setActive(0);
        this.scrollActiveIntoView();
        break;
      case 'End':
        event.preventDefault();
        this.setActive(visible.length - 1);
        this.scrollActiveIntoView();
        break;
      case 'Enter':
        event.preventDefault();
        if (activeIdx >= 0) this.selectOption(visible[activeIdx]);
        break;
      case 'Tab':
        this.close();
        break;
    }
  }

  private scrollActiveIntoView(): void {
    const id = this.activeOptionId();
    if (!id) return;
    this.overlayRef?.overlayElement
      .querySelector(`#${id}`)
      ?.scrollIntoView({ block: 'nearest' });
  }

  /* Teclado no gatilho fechado: setas/Enter/Espaço abrem. */
  protected onTriggerKeydown(event: KeyboardEvent): void {
    if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key) && !this.isOpen()) {
      event.preventDefault();
      this.open();
    }
  }
}
