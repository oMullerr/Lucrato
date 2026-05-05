import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';

export type KpiVariant = 'red' | 'amber' | 'blue' | 'green' | 'teal' | 'purple' | 'orange' | 'gray';

@Component({
  selector: 'app-kpi-card',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatIconModule, MatCardModule],
  template: `
    <mat-card class="kpi-card" [attr.data-variant]="variant()">
      <div class="kpi-header">
        <mat-icon class="icon">{{ icon() }}</mat-icon>
        <span class="title">{{ title() }}</span>
      </div>
      <div class="value">{{ value() }}</div>
      @if (note()) {
        <div class="note">{{ note() }}</div>
      }
    </mat-card>
  `,
  styles: [`
    .kpi-card {
      padding: 18px 20px !important;
      position: relative;
      overflow: hidden;
      transition: transform 0.2s, box-shadow 0.2s;
    }

    .kpi-card::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: 3px;
      background: var(--accent);
    }

    .kpi-card:hover {
      transform: translateY(-2px);
      box-shadow: var(--shadow-md) !important;
    }

    .kpi-card[data-variant="red"]    { --accent: var(--clr-red); }
    .kpi-card[data-variant="amber"]  { --accent: var(--clr-amber); }
    .kpi-card[data-variant="blue"]   { --accent: var(--clr-blue); }
    .kpi-card[data-variant="green"]  { --accent: var(--clr-green); }
    .kpi-card[data-variant="teal"]   { --accent: var(--clr-teal); }
    .kpi-card[data-variant="purple"] { --accent: var(--clr-purple); }
    .kpi-card[data-variant="orange"] { --accent: var(--clr-orange); }
    .kpi-card[data-variant="gray"]   { --accent: var(--txt-secondary); }

    .kpi-header {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 10px;
    }

    .icon {
      color: var(--accent);
      font-size: 18px;
      width: 18px;
      height: 18px;
    }

    .title {
      font-size: 11px;
      font-weight: 600;
      color: var(--txt-secondary);
      letter-spacing: 0.6px;
      text-transform: uppercase;
    }

    .value {
      font-size: 22px;
      font-weight: 700;
      color: var(--accent);
      letter-spacing: -0.5px;
      line-height: 1.1;
    }

    .note {
      font-size: 11px;
      color: var(--txt-muted);
      margin-top: 6px;
    }
  `]
})
export class KpiCardComponent {
  readonly title = input.required<string>();
  readonly value = input.required<string | number>();
  readonly icon = input<string>('analytics');
  readonly note = input<string>('');
  readonly variant = input<KpiVariant>('blue');
}
