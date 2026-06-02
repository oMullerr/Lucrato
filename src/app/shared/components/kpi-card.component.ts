import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { SparklineComponent, SparklineTone } from './sparkline.component';

export type KpiVariant =
  | 'success' | 'danger' | 'warning' | 'info' | 'neutral' | 'brand'
  /* Legacy aliases — kept until all screens migrate */
  | 'red' | 'amber' | 'blue' | 'green' | 'teal' | 'purple' | 'orange' | 'gray';
export type KpiSize = 'compact' | 'default' | 'hero';

const VARIANT_MAP: Record<string, string> = {
  red: 'danger',
  amber: 'warning',
  blue: 'info',
  green: 'success',
  teal: 'brand',
  purple: 'info',
  orange: 'warning',
  gray: 'neutral',
};

@Component({
  selector: 'app-kpi-card',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatIconModule, SparklineComponent],
  templateUrl: './kpi-card.component.html',
  styleUrl: './kpi-card.component.scss',
})
export class KpiCardComponent {
  readonly title = input.required<string>();
  readonly value = input.required<string | number>();
  readonly icon = input<string>('');
  readonly note = input<string>('');
  readonly variant = input<KpiVariant>('neutral');
  readonly size = input<KpiSize>('default');
  readonly delta = input<number | null>(null);
  readonly deltaLabel = input<string>('');
  readonly sparkline = input<number[] | null>(null);

  /** Normalizes legacy variant names to the new semantic palette. */
  protected readonly resolvedVariant = computed(() => {
    const v = this.variant() as string;
    return VARIANT_MAP[v] ?? v;
  });

  protected readonly deltaDir = computed<'up' | 'down' | 'flat'>(() => {
    const d = this.delta();
    if (d === null || d === 0) return 'flat';
    return d > 0 ? 'up' : 'down';
  });

  protected readonly deltaIcon = computed(() => {
    const dir = this.deltaDir();
    if (dir === 'up') return 'trending_up';
    if (dir === 'down') return 'trending_down';
    return 'trending_flat';
  });

  protected readonly formattedDelta = computed(() => {
    const d = this.delta();
    if (d === null) return '';
    const abs = Math.abs(d * 100).toFixed(1);
    return `${abs}%`;
  });

  /** Sparkline tone — falls back to the resolved variant or to auto-detection. */
  protected readonly sparklineTone = computed<SparklineTone>(() => {
    const v = this.resolvedVariant();
    if (v === 'success' || v === 'danger' || v === 'warning' || v === 'brand' || v === 'neutral') return v;
    return 'auto';
  });
}
