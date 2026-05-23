import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';

export type KpiVariant = 'red' | 'amber' | 'blue' | 'green' | 'teal' | 'purple' | 'orange' | 'gray';
export type KpiSize = 'default' | 'hero' | 'compact';

@Component({
  selector: 'app-kpi-card',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatIconModule, MatCardModule],
  template: `
    <mat-card class="kpi-card" [attr.data-variant]="variant()" [attr.data-size]="size()">
      <div class="kpi-row">
        <div class="kpi-icon" aria-hidden="true">
          <mat-icon>{{ icon() }}</mat-icon>
        </div>
        <div class="kpi-body">
          <span class="kpi-title">{{ title() }}</span>
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
      </div>
    </mat-card>
  `,
  styles: [`
    .kpi-card {
      padding: 16px 18px;
      border: 1px solid var(--brd-default);
      transition: transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease;
    }

    .kpi-card:hover {
      transform: translateY(-1px);
      box-shadow: var(--shadow-md);
      border-color: color-mix(in srgb, var(--accent) 35%, var(--brd-default));
    }

    .kpi-card[data-variant="red"]    { --accent: var(--clr-red); }
    .kpi-card[data-variant="amber"]  { --accent: var(--clr-amber); }
    .kpi-card[data-variant="blue"]   { --accent: var(--clr-blue); }
    .kpi-card[data-variant="green"]  { --accent: var(--clr-green); }
    .kpi-card[data-variant="teal"]   { --accent: var(--clr-teal); }
    .kpi-card[data-variant="purple"] { --accent: var(--clr-purple); }
    .kpi-card[data-variant="orange"] { --accent: var(--clr-orange); }
    .kpi-card[data-variant="gray"]   { --accent: var(--txt-secondary); }

    .kpi-row {
      display: flex;
      gap: 12px;
      align-items: flex-start;
    }

    .kpi-icon {
      flex-shrink: 0;
      width: 38px;
      height: 38px;
      display: grid;
      place-items: center;
      border-radius: 10px;
      background: color-mix(in srgb, var(--accent) 14%, transparent);
      color: var(--accent);

      mat-icon {
        font-size: 20px;
        width: 20px;
        height: 20px;
      }
    }

    .kpi-body {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .kpi-title {
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.6px;
      text-transform: uppercase;
      color: var(--txt-secondary);
    }

    .kpi-value {
      font-size: 22px;
      font-weight: 700;
      color: var(--txt-primary);
      letter-spacing: -0.4px;
      line-height: 1.15;
      font-variant-numeric: tabular-nums;
      font-feature-settings: "tnum";
    }

    .kpi-note {
      font-size: 11px;
      color: var(--txt-muted);
      margin-top: 2px;
    }

    .kpi-delta {
      display: inline-flex;
      align-items: center;
      gap: 3px;
      font-size: 11.5px;
      font-weight: 600;
      margin-top: 2px;

      &.up   { color: var(--clr-green); }
      &.down { color: var(--clr-red); }
      &.flat { color: var(--txt-muted); }

      .delta-icon {
        font-size: 14px;
        width: 14px;
        height: 14px;
      }
    }

    .kpi-card[data-size="compact"] {
      padding: 12px 14px;

      .kpi-icon { width: 32px; height: 32px; border-radius: 8px; }
      .kpi-icon mat-icon { font-size: 17px; width: 17px; height: 17px; }
      .kpi-value { font-size: 18px; }
      .kpi-note, .kpi-delta { display: none; }
    }

    .kpi-card[data-size="hero"] {
      padding: 22px 24px;

      .kpi-icon { width: 48px; height: 48px; border-radius: 12px; }
      .kpi-icon mat-icon { font-size: 26px; width: 26px; height: 26px; }
      .kpi-value { font-size: clamp(22px, 4vw, 36px); letter-spacing: -0.8px; }
      .kpi-title { font-size: 12px; }
    }
  `]
})
export class KpiCardComponent {
  readonly title = input.required<string>();
  readonly value = input.required<string | number>();
  readonly icon = input<string>('analytics');
  readonly note = input<string>('');
  readonly variant = input<KpiVariant>('blue');
  readonly size = input<KpiSize>('default');
  readonly delta = input<number | null>(null);
  readonly deltaLabel = input<string>('');

  protected readonly deltaDir = computed<'up' | 'down' | 'flat'>(() => {
    const d = this.delta();
    if (d === null || d === 0) return 'flat';
    return d > 0 ? 'up' : 'down';
  });

  protected readonly deltaIcon = computed(() => {
    const dir = this.deltaDir();
    if (dir === 'up') return 'arrow_drop_up';
    if (dir === 'down') return 'arrow_drop_down';
    return 'remove';
  });

  protected readonly formattedDelta = computed(() => {
    const d = this.delta();
    if (d === null) return '';
    const abs = Math.abs(d * 100).toFixed(1);
    return `${abs}%`;
  });
}
