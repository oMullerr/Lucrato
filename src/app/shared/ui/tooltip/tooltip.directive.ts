import {
  DestroyRef,
  Directive,
  ElementRef,
  OnDestroy,
  effect,
  inject,
  input,
} from '@angular/core';
import { AriaDescriber } from '@angular/cdk/a11y';
import {
  ConnectedPosition,
  Overlay,
  OverlayRef,
} from '@angular/cdk/overlay';
import { ComponentPortal } from '@angular/cdk/portal';
import { TooltipPanelComponent } from './tooltip-panel.component';

export type TooltipPosition = 'above' | 'below' | 'left' | 'right';

const POSITIONS: Record<TooltipPosition, ConnectedPosition> = {
  above: { originX: 'center', originY: 'top', overlayX: 'center', overlayY: 'bottom', offsetY: -8 },
  below: { originX: 'center', originY: 'bottom', overlayX: 'center', overlayY: 'top', offsetY: 8 },
  left:  { originX: 'start', originY: 'center', overlayX: 'end', overlayY: 'center', offsetX: -8 },
  right: { originX: 'end', originY: 'center', overlayX: 'start', overlayY: 'center', offsetX: 8 },
};

/**
 * Tooltip do design system.
 *
 *   <button appTooltip="Excluir" tooltipPosition="above">…</button>
 *
 * - String vazia desativa (padrão comum: [appTooltip]="cond ? texto : ''").
 * - Suprimido em toque (o long-press mobile atrapalha mais do que ajuda).
 * - A11y: o texto vira descrição via AriaDescriber mesmo sem hover.
 */
@Directive({
  selector: '[appTooltip]',
  standalone: true,
  host: {
    '(mouseenter)': 'scheduleShow()',
    '(mouseleave)': 'scheduleHide()',
    '(focusin)': 'scheduleShow()',
    '(focusout)': 'scheduleHide()',
    '(touchstart)': 'suppress()',
  },
})
export class TooltipDirective implements OnDestroy {
  readonly appTooltip = input<string>('');
  readonly tooltipPosition = input<TooltipPosition>('above');
  readonly tooltipDisabled = input(false);

  private readonly overlay = inject(Overlay);
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly describer = inject(AriaDescriber);
  private readonly destroyRef = inject(DestroyRef);

  private overlayRef: OverlayRef | null = null;
  private showTimer: ReturnType<typeof setTimeout> | null = null;
  private hideTimer: ReturnType<typeof setTimeout> | null = null;
  private touched = false;
  private described = '';

  constructor() {
    /* Mantém a descrição acessível em sincronia com o texto. */
    effect(() => {
      const msg = this.appTooltip();
      if (this.described) this.describer.removeDescription(this.host.nativeElement, this.described);
      if (msg) this.describer.describe(this.host.nativeElement, msg);
      this.described = msg;
    });
    this.destroyRef.onDestroy(() => this.hide());
  }

  protected suppress(): void {
    this.touched = true;
    this.hide();
  }

  protected scheduleShow(): void {
    if (this.touched || this.tooltipDisabled() || !this.appTooltip()) return;
    this.clearTimers();
    this.showTimer = setTimeout(() => this.show(), 400);
  }

  protected scheduleHide(): void {
    this.clearTimers();
    this.hideTimer = setTimeout(() => this.hide(), 80);
  }

  private show(): void {
    if (this.overlayRef?.hasAttached()) return;
    const position = this.overlay
      .position()
      .flexibleConnectedTo(this.host)
      .withPositions([
        POSITIONS[this.tooltipPosition()],
        POSITIONS.above, POSITIONS.below, POSITIONS.right, POSITIONS.left,
      ])
      .withViewportMargin(8);

    this.overlayRef ??= this.overlay.create({
      positionStrategy: position,
      scrollStrategy: this.overlay.scrollStrategies.close(),
      panelClass: 'app-tooltip-overlay',
    });
    const ref = this.overlayRef.attach(new ComponentPortal(TooltipPanelComponent));
    ref.setInput('text', this.appTooltip());
  }

  private hide(): void {
    this.clearTimers();
    this.overlayRef?.detach();
  }

  private clearTimers(): void {
    if (this.showTimer) clearTimeout(this.showTimer);
    if (this.hideTimer) clearTimeout(this.hideTimer);
    this.showTimer = this.hideTimer = null;
  }

  ngOnDestroy(): void {
    this.overlayRef?.dispose();
    if (this.described) this.describer.removeDescription(this.host.nativeElement, this.described);
  }
}
