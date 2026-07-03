import {
  ChangeDetectionStrategy,
  Component,
  computed,
  contentChildren,
  model,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { TabComponent } from './tab.component';

/**
 * Abas do design system (roles tab/tablist/tabpanel, setas ←/→, Home/End).
 * Painéis são lazy — só a aba ativa renderiza.
 *
 *   <app-tabs [(selectedIndex)]="tab">
 *     <app-tab [label]="…">…</app-tab>
 *     <app-tab [label]="…">…</app-tab>
 *   </app-tabs>
 */
@Component({
  selector: 'app-tabs',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgTemplateOutlet],
  templateUrl: './tabs.component.html',
  styleUrl: './tabs.component.scss',
})
export class TabsComponent {
  readonly selectedIndex = model(0);

  protected readonly tabs = contentChildren(TabComponent);

  protected readonly activeTab = computed(() => {
    const list = this.tabs();
    const idx = Math.min(Math.max(0, this.selectedIndex()), list.length - 1);
    return list[idx] ?? null;
  });

  protected select(index: number): void {
    this.selectedIndex.set(index);
  }

  protected onKeydown(event: KeyboardEvent): void {
    const count = this.tabs().length;
    if (!count) return;
    const current = this.selectedIndex();
    let next: number | null = null;
    switch (event.key) {
      case 'ArrowRight': next = (current + 1) % count; break;
      case 'ArrowLeft':  next = (current - 1 + count) % count; break;
      case 'Home':       next = 0; break;
      case 'End':        next = count - 1; break;
      default: return;
    }
    event.preventDefault();
    this.select(next);
    /* Foco acompanha a seleção (padrão de tablist com seleção automática). */
    queueMicrotask(() => {
      const btn = document.getElementById(this.tabs()[next!]?.tabId ?? '');
      btn?.focus();
    });
  }
}
