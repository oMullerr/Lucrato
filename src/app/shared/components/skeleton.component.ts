import { ChangeDetectionStrategy, Component, input } from '@angular/core';

export type SkeletonVariant = 'kpi' | 'table-row' | 'chart' | 'text' | 'card';

@Component({
  selector: 'app-skeleton',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './skeleton.component.html',
  styleUrl: './skeleton.component.scss',
})
export class SkeletonComponent {
  readonly variant = input<SkeletonVariant>('text');
  readonly count = input<number>(1);

  protected readonly items = () => Array.from({ length: this.count() });
}
