import { ChangeDetectionStrategy, Component, TemplateRef, input, viewChild } from '@angular/core';

export type MenuXPosition = 'before' | 'after';
export type MenuYPosition = 'above' | 'below';

/**
 * Declaração de um menu suspenso. O conteúdo só renderiza quando o gatilho
 * ([appMenuTrigger]) abre o overlay.
 *
 *   <button appBtn="ghost" iconOnly [appMenuTrigger]="menu" aria-label="…">…</button>
 *   <app-menu #menu xPosition="before">
 *     <button app-menu-item (click)="…">Item</button>
 *   </app-menu>
 */
@Component({
  selector: 'app-menu',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ng-template>
      <div class="menu-panel" role="menu">
        <ng-content />
      </div>
    </ng-template>
  `,
  styles: `:host { display: none; }`,
})
export class MenuComponent {
  readonly xPosition = input<MenuXPosition>('after');
  readonly yPosition = input<MenuYPosition>('below');

  readonly template = viewChild.required(TemplateRef);
}
