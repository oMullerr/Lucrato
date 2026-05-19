import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-page-header',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatIconModule],
  template: `
    <header class="page-header">
      <div class="header-text">
        <div class="title">
          <mat-icon class="icon">{{ icon() }}</mat-icon>
          <h1>{{ title() }}</h1>
        </div>
        @if (subtitle()) {
          <p class="subtitle">{{ subtitle() }}</p>
        }
      </div>
      <div class="actions">
        <ng-content></ng-content>
      </div>
    </header>
  `,
  styles: [`
    .page-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 24px;
      padding: 24px 32px 20px;
      background: linear-gradient(
        to bottom,
        color-mix(in srgb, var(--clr-blue) 5%, var(--bg-surface)),
        var(--bg-surface)
      );
      border-bottom: 1px solid var(--brd-default);
      position: relative;
    }

    .page-header::before {
      content: '';
      position: absolute;
      left: 0;
      top: 25%;
      bottom: 25%;
      width: 3px;
      background: var(--clr-blue);
      border-radius: 0 2px 2px 0;
      opacity: 0.7;
    }

    .header-text { flex: 1; min-width: 0; }

    .title {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .title .icon {
      font-size: 22px;
      width: 44px !important;
      height: 44px !important;
      line-height: 44px !important;
      text-align: center;
      color: var(--clr-blue);
      background: color-mix(in srgb, var(--clr-blue) 11%, transparent);
      border-radius: 11px;
      border: 1px solid color-mix(in srgb, var(--clr-blue) 18%, transparent);
      flex-shrink: 0;
    }

    .title h1 {
      font-size: 22px;
      font-weight: 700;
      color: var(--txt-primary);
      letter-spacing: -0.4px;
      margin: 0;
    }

    .subtitle {
      color: var(--txt-secondary);
      font-size: 13px;
      margin: 5px 0 0 58px;
    }

    .actions {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }

    @media (max-width: 768px) {
      .page-header { padding: 20px 16px 16px; flex-direction: column; }
      .actions { width: 100%; }
    }
  `]
})
export class PageHeaderComponent {
  readonly title = input.required<string>();
  readonly subtitle = input<string>('');
  readonly icon = input<string>('dashboard');
}
