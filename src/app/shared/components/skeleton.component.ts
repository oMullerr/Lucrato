import { ChangeDetectionStrategy, Component, input } from '@angular/core';

export type SkeletonVariant = 'kpi' | 'table-row' | 'chart' | 'text' | 'card';

@Component({
  selector: 'app-skeleton',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @for (_ of items(); track $index) {
      <div class="skeleton" [attr.data-variant]="variant()" aria-hidden="true"></div>
    }
  `,
  styles: [`
    :host {
      display: contents;
    }

    .skeleton {
      position: relative;
      overflow: hidden;
      background: var(--bg-surface-2);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-md);
    }

    .skeleton::after {
      content: '';
      position: absolute;
      inset: 0;
      background: linear-gradient(
        90deg,
        transparent 0%,
        color-mix(in srgb, var(--bg-surface-3) 90%, transparent) 50%,
        transparent 100%
      );
      background-size: 1000px 100%;
      animation: shimmer 1.6s linear infinite;
    }

    .skeleton[data-variant="kpi"] {
      height: 96px;
      border-radius: var(--radius-lg);
    }

    .skeleton[data-variant="table-row"] {
      height: 48px;
      border-radius: var(--radius-sm);
      margin-bottom: 6px;
      border: none;
      background: var(--bg-surface-2);
    }

    .skeleton[data-variant="chart"] {
      height: 280px;
      border-radius: var(--radius-lg);
    }

    .skeleton[data-variant="text"] {
      height: 14px;
      border-radius: var(--radius-xs);
      margin: 6px 0;
      border: none;
    }

    .skeleton[data-variant="card"] {
      height: 160px;
      border-radius: var(--radius-lg);
    }
  `]
})
export class SkeletonComponent {
  readonly variant = input<SkeletonVariant>('text');
  readonly count = input<number>(1);

  protected readonly items = () => Array.from({ length: this.count() });
}
