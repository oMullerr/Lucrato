import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-page-header',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatIconModule],
  template: `
    <header class="page-header">
      <div class="header-inner">
        <div class="header-text">
          <div class="title-row">
            <div class="icon-badge" aria-hidden="true">
              <mat-icon>{{ icon() }}</mat-icon>
            </div>
            <div class="title-text">
              <h1 class="h-display">{{ title() }}</h1>
              @if (subtitle()) {
                <p class="subtitle">{{ subtitle() }}</p>
              }
            </div>
          </div>
        </div>
        <div class="actions">
          <ng-content></ng-content>
        </div>
      </div>
    </header>
  `,
  styles: [`
    .page-header {
      background: var(--bg-surface);
      border-bottom: 1px solid var(--brd-default);
    }

    .header-inner {
      max-width: var(--content-max);
      margin-inline: auto;
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 24px;
      padding: 24px var(--content-pad-x) 20px;
    }

    .header-text { flex: 1; min-width: 0; }

    .title-row {
      display: flex;
      align-items: center;
      gap: 14px;
    }

    .icon-badge {
      flex-shrink: 0;
      width: 40px;
      height: 40px;
      display: grid;
      place-items: center;
      border-radius: 11px;
      background: color-mix(in srgb, var(--clr-blue) 10%, transparent);
      color: var(--clr-blue);
    }

    .icon-badge mat-icon {
      font-size: 22px;
      width: 22px;
      height: 22px;
    }

    .title-text h1 {
      margin: 0;
      color: var(--txt-primary);
    }

    .subtitle {
      color: var(--txt-secondary);
      font-size: 13px;
      margin: 3px 0 0;
    }

    .actions {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      align-items: center;
    }

    @media (max-width: 768px) {
      .header-inner {
        flex-direction: column;
        padding: 20px var(--content-pad-x-sm) 16px;
      }
      .actions { width: 100%; }
    }

    @media (max-width: 480px) {
      .icon-badge { width: 36px; height: 36px; }
      .icon-badge mat-icon { font-size: 20px; width: 20px; height: 20px; }
      .subtitle { font-size: 12px; }
    }
  `]
})
export class PageHeaderComponent {
  readonly title = input.required<string>();
  readonly subtitle = input<string>('');
  readonly icon = input<string>('dashboard');
}
