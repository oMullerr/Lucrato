import { ChangeDetectionStrategy, Component } from '@angular/core';

/** Item de menu — o host é o <button> nativo (role, foco e clique no lugar certo). */
@Component({
  selector: 'button[app-menu-item], a[app-menu-item]',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<ng-content />`,
  styleUrl: './menu-item.component.scss',
  host: {
    class: 'menu-item',
    role: 'menuitem',
    tabindex: '-1',
    type: 'button',
  },
})
export class MenuItemComponent {}
