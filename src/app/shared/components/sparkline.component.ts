import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

export type SparklineTone = 'auto' | 'success' | 'danger' | 'warning' | 'neutral' | 'brand';

/**
 * Compact inline trend visualization rendered as a single SVG path.
 * No chart library — auto-detects tone from the data direction unless overridden.
 */
@Component({
  selector: 'app-sparkline',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (path()) {
      <svg
        class="spark"
        [attr.viewBox]="viewBox()"
        [attr.width]="width()"
        [attr.height]="height()"
        [attr.data-tone]="resolvedTone()"
        aria-hidden="true"
        preserveAspectRatio="none"
      >
        @if (fill()) {
          <path class="spark-fill" [attr.d]="areaPath()" />
        }
        <path class="spark-line" [attr.d]="path()" />
        @if (showDot()) {
          <circle class="spark-dot" [attr.cx]="lastX()" [attr.cy]="lastY()" r="2.5" />
        }
      </svg>
    }
  `,
  styles: [`
    :host {
      display: inline-block;
      line-height: 0;
    }

    .spark { display: block; overflow: visible; }

    .spark[data-tone="success"] { color: var(--color-success); }
    .spark[data-tone="danger"]  { color: var(--color-danger); }
    .spark[data-tone="warning"] { color: var(--color-warning); }
    .spark[data-tone="neutral"] { color: var(--text-muted); }
    .spark[data-tone="brand"]   { color: var(--brand-primary); }

    .spark-line {
      fill: none;
      stroke: currentColor;
      stroke-width: 1.5;
      stroke-linecap: round;
      stroke-linejoin: round;
      vector-effect: non-scaling-stroke;
    }

    .spark-fill {
      fill: currentColor;
      opacity: 0.10;
    }

    .spark-dot {
      fill: currentColor;
      stroke: var(--bg-surface-1);
      stroke-width: 1;
    }
  `]
})
export class SparklineComponent {
  readonly points = input.required<number[]>();
  readonly width = input<number>(64);
  readonly height = input<number>(22);
  readonly tone = input<SparklineTone>('auto');
  readonly fill = input<boolean>(false);
  readonly showDot = input<boolean>(true);

  protected readonly resolvedTone = computed<SparklineTone>(() => {
    const t = this.tone();
    if (t !== 'auto') return t;
    const p = this.points();
    if (!p || p.length < 2) return 'neutral';
    const first = p[0];
    const last = p[p.length - 1];
    if (Math.abs(last - first) < Math.abs(first) * 0.005) return 'neutral';
    return last >= first ? 'success' : 'danger';
  });

  /** Maps points to an SVG path in a normalized 0–100 × 0–100 viewBox. */
  private readonly normalized = computed(() => {
    const p = this.points();
    if (!p || p.length < 2) return null;
    const min = Math.min(...p);
    const max = Math.max(...p);
    const range = max - min || 1;
    const stepX = 100 / (p.length - 1);
    return p.map((v, i) => ({
      x: +(i * stepX).toFixed(2),
      y: +(100 - ((v - min) / range) * 100).toFixed(2),
    }));
  });

  protected readonly viewBox = computed(() => '0 0 100 100');

  protected readonly path = computed(() => {
    const n = this.normalized();
    if (!n) return '';
    return n.map((pt, i) => `${i === 0 ? 'M' : 'L'} ${pt.x} ${pt.y}`).join(' ');
  });

  protected readonly areaPath = computed(() => {
    const n = this.normalized();
    if (!n) return '';
    const line = n.map((pt, i) => `${i === 0 ? 'M' : 'L'} ${pt.x} ${pt.y}`).join(' ');
    return `${line} L 100 100 L 0 100 Z`;
  });

  protected readonly lastX = computed(() => {
    const n = this.normalized();
    return n ? n[n.length - 1].x : 0;
  });

  protected readonly lastY = computed(() => {
    const n = this.normalized();
    return n ? n[n.length - 1].y : 0;
  });
}
