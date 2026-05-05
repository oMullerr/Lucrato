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
      padding: 28px 32px 20px;
      background: var(--bg-surface);
      border-bottom: 1px solid var(--brd-default);
    }

    .header-text { flex: 1; min-width: 0; }

    .title {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .title .icon {
      font-size: 28px;
      width: 28px;
      height: 28px;
      color: var(--clr-blue);
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
      margin: 6px 0 0 40px;
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
