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
      background: var(--bg-elevated);
      border: 1px solid var(--brd-default);
      border-radius: var(--radius-md);
    }

    .skeleton::after {
      content: '';
      position: absolute;
      inset: 0;
      background: linear-gradient(
        90deg,
        transparent 0%,
        color-mix(in srgb, var(--bg-elevated-2) 80%, transparent) 50%,
        transparent 100%
      );
      background-size: 1000px 100%;
      animation: shimmer 1.4s linear infinite;
    }

    .skeleton[data-variant="kpi"] {
      height: 88px;
      border-radius: var(--radius-lg);
    }

    .skeleton[data-variant="table-row"] {
      height: 44px;
      border-radius: var(--radius-sm);
      margin-bottom: 6px;
    }

    .skeleton[data-variant="chart"] {
      height: 280px;
      border-radius: var(--radius-lg);
    }

    .skeleton[data-variant="text"] {
      height: 14px;
      border-radius: 4px;
      margin: 6px 0;
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
