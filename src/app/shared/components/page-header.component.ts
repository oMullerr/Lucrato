import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'app-page-header',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="page-header">
      <div class="header-inner">
        <div class="header-text">
          @if (eyebrow()) {
            <div class="eyebrow">{{ eyebrow() }}</div>
          }
          <h1 class="h-display">{{ title() }}</h1>
          @if (subtitle()) {
            <p class="subtitle">{{ subtitle() }}</p>
          }
        </div>
        <div class="actions">
          <ng-content></ng-content>
        </div>
      </div>
    </header>
  `,
  styles: [`
    .page-header {
      background: transparent;
    }

    .header-inner {
      max-width: var(--content-max);
      margin-inline: auto;
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      gap: 24px;
      padding: 28px var(--content-pad-x) 22px;
    }

    .header-text {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .eyebrow {
      font-size: var(--fs-caption);
      font-weight: 600;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--text-muted);
      line-height: 1;
    }

    h1.h-display {
      margin: 0;
      font-family: 'Geist', 'Inter', sans-serif;
      font-size: var(--fs-display-lg);
      font-weight: 600;
      letter-spacing: -0.03em;
      line-height: 1.05;
      color: var(--text-primary);
    }

    .subtitle {
      color: var(--text-secondary);
      font-size: 14px;
      max-width: 60ch;
      margin: 2px 0 0;
      line-height: 1.5;
    }

    .actions {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      align-items: center;
      flex-shrink: 0;
    }

    @media (max-width: 768px) {
      .header-inner {
        flex-direction: column;
        align-items: flex-start;
        padding: 20px var(--content-pad-x-sm) 18px;
      }
      .actions { width: 100%; }
    }

    @media (max-width: 480px) {
      .subtitle { font-size: 13px; }
    }
  `]
})
export class PageHeaderComponent {
  readonly title = input.required<string>();
  readonly subtitle = input<string>('');
  /** Tiny uppercased label above the title (eg. "PANORAMA · ATUALIZADO 14:32"). */
  readonly eyebrow = input<string>('');
  /** Kept for backwards compatibility — ignored visually in the new design. */
  readonly icon = input<string>('');
}
