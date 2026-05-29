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
  template: `
    <article class="kpi-card" [attr.data-variant]="resolvedVariant()" [attr.data-size]="size()">
      <header class="kpi-head">
        <span class="kpi-title">{{ title() }}</span>
        @if (icon(); as ic) {
          <mat-icon class="kpi-icon" aria-hidden="true">{{ ic }}</mat-icon>
        }
      </header>

      <div class="kpi-row">
        <div class="kpi-value-wrap">
          <div class="kpi-value">{{ value() }}</div>
          @if (delta() !== null) {
            <div class="kpi-delta" [class.up]="deltaDir() === 'up'" [class.down]="deltaDir() === 'down'" [class.flat]="deltaDir() === 'flat'">
              <mat-icon class="delta-icon">{{ deltaIcon() }}</mat-icon>
              <span>{{ deltaLabel() || formattedDelta() }}</span>
            </div>
          } @else if (note()) {
            <div class="kpi-note">{{ note() }}</div>
          }
        </div>

        @if (sparkline() && sparkline()!.length > 1) {
          <div class="kpi-spark">
            <app-sparkline
              [points]="sparkline()!"
              [width]="size() === 'hero' ? 96 : 64"
              [height]="size() === 'hero' ? 32 : 22"
              [tone]="sparklineTone()"
              [fill]="size() === 'hero'"
            />
          </div>
        }
      </div>
    </article>
  `,
  styles: [`
    .kpi-card {
      position: relative;
      display: flex;
      flex-direction: column;
      gap: 12px;
      padding: 18px;
      background: var(--bg-surface-1);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-lg);
      transition: border-color var(--dur-fast) var(--ease-out), background var(--dur-fast) var(--ease-out);
    }

    .kpi-card[data-variant="success"] { --accent: var(--color-success); }
    .kpi-card[data-variant="danger"]  { --accent: var(--color-danger); }
    .kpi-card[data-variant="warning"] { --accent: var(--color-warning); }
    .kpi-card[data-variant="info"]    { --accent: var(--color-info); }
    .kpi-card[data-variant="neutral"] { --accent: var(--text-muted); }
    .kpi-card[data-variant="brand"]   { --accent: var(--brand-primary); }

    .kpi-card:hover {
      border-color: var(--border-default);
    }

    .kpi-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }

    .kpi-title {
      font-size: var(--fs-caption);
      font-weight: 600;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--text-muted);
    }

    .kpi-icon {
      font-size: 16px;
      width: 16px;
      height: 16px;
      color: var(--accent);
      opacity: 0.8;
    }

    .kpi-row {
      display: flex;
      align-items: flex-end;
      justify-content: space-between;
      gap: 12px;
    }

    .kpi-value-wrap {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .kpi-value {
      font-family: 'Geist', 'Inter', sans-serif;
      font-size: var(--fs-display-md);
      font-weight: 600;
      color: var(--text-primary);
      letter-spacing: -0.025em;
      line-height: 1.1;
      font-variant-numeric: tabular-nums;
      font-feature-settings: 'tnum';
    }

    .kpi-note {
      font-size: var(--fs-caption);
      color: var(--text-muted);
      letter-spacing: 0.02em;
    }

    .kpi-delta {
      display: inline-flex;
      align-items: center;
      gap: 3px;
      font-size: var(--fs-caption);
      font-weight: 600;
      font-variant-numeric: tabular-nums;

      &.up   { color: var(--color-success); }
      &.down { color: var(--color-danger); }
      &.flat { color: var(--text-muted); }

      .delta-icon { font-size: 13px; width: 13px; height: 13px; }
    }

    .kpi-spark {
      flex-shrink: 0;
      align-self: center;
    }

    .kpi-card[data-size="compact"] {
      padding: 14px;
      gap: 8px;

      .kpi-value { font-size: 1.125rem; }
      .kpi-note, .kpi-delta { display: none; }
      .kpi-spark { display: none; }
    }

    .kpi-card[data-size="hero"] {
      padding: 28px;
      gap: 18px;
      background: linear-gradient(135deg, var(--bg-surface-1) 0%, var(--bg-surface-2) 100%);
      border-color: var(--border-default);

      .kpi-title { font-size: 0.75rem; }

      .kpi-value {
        font-size: var(--fs-display-xl);
        font-weight: 700;
        letter-spacing: -0.035em;
        line-height: 1;
      }

      &:hover {
        border-color: color-mix(in srgb, var(--accent) 30%, var(--border-default));
        transform: translateY(-1px);
        box-shadow: var(--shadow-md);
      }

      transition: border-color var(--dur-base) var(--ease-out),
                  transform var(--dur-base) var(--ease-out),
                  box-shadow var(--dur-base) var(--ease-out);
    }
  `]
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
