import {
  DestroyRef,
  Directive,
  ElementRef,
  ViewContainerRef,
  inject,
  input,
  signal,
} from '@angular/core';
import { ConnectedPosition, Overlay, OverlayRef } from '@angular/cdk/overlay';
import { TemplatePortal } from '@angular/cdk/portal';
import { MenuComponent } from './menu.component';

/**
 * Gatilho de menu: abre o app-menu associado em um CDK Overlay ancorado ao
 * elemento. Gerencia aria-haspopup/expanded, teclado (setas/Home/End/ESC),
 * fechamento por backdrop/clique e devolução de foco.
 */
@Directive({
  selector: '[appMenuTrigger]',
  standalone: true,
  host: {
    'aria-haspopup': 'menu',
    '[attr.aria-expanded]': "isOpen() ? 'true' : 'false'",
    '(click)': 'toggle()',
    '(keydown.arrowdown)': 'openAndFocus($event)',
  },
})
export class MenuTriggerDirective {
  readonly appMenuTrigger = input.required<MenuComponent>();

  private readonly overlay = inject(Overlay);
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly vcr = inject(ViewContainerRef);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly isOpen = signal(false);
  private overlayRef: OverlayRef | null = null;

  constructor() {
    this.destroyRef.onDestroy(() => this.overlayRef?.dispose());
  }

  protected toggle(): void {
    this.isOpen() ? this.close() : this.open();
  }

  protected openAndFocus(event: Event): void {
    event.preventDefault();
    if (!this.isOpen()) this.open();
  }

  private open(): void {
    const menu = this.appMenuTrigger();
    const positions = this.buildPositions(menu);

    this.overlayRef = this.overlay.create({
      positionStrategy: this.overlay
        .position()
        .flexibleConnectedTo(this.host)
        .withPositions(positions)
        .withViewportMargin(8),
      scrollStrategy: this.overlay.scrollStrategies.reposition(),
      hasBackdrop: true,
      backdropClass: 'cdk-overlay-transparent-backdrop',
    });

    this.overlayRef.backdropClick().subscribe(() => this.close());
    this.overlayRef.keydownEvents().subscribe((e) => {
      if (e.key === 'Escape') { e.stopPropagation(); this.close(); }
    });

    this.overlayRef.attach(new TemplatePortal(menu.template(), this.vcr));
    this.isOpen.set(true);

    queueMicrotask(() => this.setupPanel());
  }

  /** Foco no primeiro item + navegação por teclado + fecha ao clicar em item. */
  private setupPanel(): void {
    const panel = this.overlayRef?.overlayElement.querySelector<HTMLElement>('.menu-panel');
    if (!panel) return;

    const items = () =>
      Array.from(panel.querySelectorAll<HTMLElement>('.menu-item:not([disabled])'));

    items()[0]?.focus();

    panel.addEventListener('keydown', (e: KeyboardEvent) => {
      const list = items();
      if (!list.length) return;
      const idx = list.indexOf(document.activeElement as HTMLElement);
      switch (e.key) {
        case 'ArrowDown': e.preventDefault(); list[(idx + 1) % list.length].focus(); break;
        case 'ArrowUp':   e.preventDefault(); list[(idx - 1 + list.length) % list.length].focus(); break;
        case 'Home':      e.preventDefault(); list[0].focus(); break;
        case 'End':       e.preventDefault(); list[list.length - 1].focus(); break;
        case 'Tab':       this.close(); break;
      }
    });

    /* Item clicado (após o handler do próprio item rodar) fecha o menu. */
    panel.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('.menu-item')) this.close();
    });
  }

  private close(): void {
    this.overlayRef?.dispose();
    this.overlayRef = null;
    this.isOpen.set(false);
    this.host.nativeElement.focus();
  }

  private buildPositions(menu: MenuComponent): ConnectedPosition[] {
    const x = menu.xPosition();
    const y = menu.yPosition();
    const primary: ConnectedPosition = {
      originX: x === 'before' ? 'end' : 'start',
      overlayX: x === 'before' ? 'end' : 'start',
      originY: y === 'above' ? 'top' : 'bottom',
      overlayY: y === 'above' ? 'bottom' : 'top',
      offsetY: y === 'above' ? -6 : 6,
    };
    /* Fallback: inverte o eixo vertical se não couber. */
    const flipped: ConnectedPosition = {
      ...primary,
      originY: y === 'above' ? 'bottom' : 'top',
      overlayY: y === 'above' ? 'top' : 'bottom',
      offsetY: y === 'above' ? 6 : -6,
    };
    return [primary, flipped];
  }
}
