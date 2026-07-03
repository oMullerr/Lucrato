import { ChangeDetectionStrategy, Component, TemplateRef, input, viewChild } from '@angular/core';

let nextTabId = 0;

/**
 * Painel de aba dentro de um <app-tabs>. O conteúdo é lazy: só renderiza
 * quando a aba está ativa.
 *
 *   <app-tab [label]="'x.tab1' | translate">…conteúdo…</app-tab>
 */
@Component({
  selector: 'app-tab',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<ng-template><ng-content /></ng-template>`,
})
export class TabComponent {
  readonly label = input.required<string>();

  readonly content = viewChild.required(TemplateRef);

  readonly tabId = `app-tab-${nextTabId++}`;
  readonly panelId = `${this.tabId}-panel`;
}
