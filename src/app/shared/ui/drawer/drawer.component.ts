import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  inject,
  input,
  model,
} from '@angular/core';
import { A11yModule } from '@angular/cdk/a11y';

export type DrawerMode = 'over' | 'side';
export type DrawerPosition = 'start' | 'end';

/**
 * Drawer/painel lateral do design system.
 *
 * - mode="side": participa do layout (shell desktop, drawers de detalhe wide).
 * - mode="over": flutua sobre a página com backdrop, focus trap e scroll-lock
 *   (nav mobile, drawers de detalhe em telas menores).
 *
 *   <app-drawer [(open)]="aberto" [mode]="bp.isMobile() ? 'over' : 'side'"
 *               width="clamp(360px, 42vw, 520px)" position="end">…</app-drawer>
 */
@Component({
  selector: 'app-drawer',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [A11yModule],
  templateUrl: './drawer.component.html',
  styleUrl: './drawer.component.scss',
  host: {
    '[class.is-over]': "mode() === 'over'",
    '[class.is-side]': "mode() === 'side'",
    '[class.is-open]': 'open()',
    '[class.pos-end]': "position() === 'end'",
    '(keydown.escape)': 'onEscape()',
  },
})
export class DrawerComponent {
  readonly open = model(false);
  readonly mode = input<DrawerMode>('over');
  readonly position = input<DrawerPosition>('start');
  /** Largura CSS do painel (ex.: 'var(--sidebar-width)', 'clamp(360px, 42vw, 520px)'). */
  readonly width = input('280px');
  readonly backdropClose = input(true);
  readonly ariaLabel = input('');

  private readonly destroyRef = inject(DestroyRef);

  constructor() {
    /* Scroll-lock do body enquanto um drawer over estiver aberto. */
    effect(() => {
      const locked = this.mode() === 'over' && this.open();
      document.body.classList.toggle('drawer-scroll-lock', locked);
    });
    this.destroyRef.onDestroy(() => document.body.classList.remove('drawer-scroll-lock'));
  }

  protected onEscape(): void {
    if (this.mode() === 'over' && this.open()) this.open.set(false);
  }

  protected onBackdrop(): void {
    if (this.backdropClose()) this.open.set(false);
  }
}
