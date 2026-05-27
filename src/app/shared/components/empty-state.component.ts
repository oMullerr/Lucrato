import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-empty-state',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatIconModule],
  template: `
    <div class="empty-state">
      <div class="illustration" aria-hidden="true">
        <svg viewBox="0 0 96 96" width="96" height="96">
          <!-- 7×7 dot grid with center highlighted -->
          @for (row of grid; track $index; let r = $index) {
            @for (col of grid; track $index; let c = $index) {
              <circle
                [attr.cx]="8 + c * 13"
                [attr.cy]="8 + r * 13"
                [attr.r]="r === 3 && c === 3 ? 4 : 1.5"
                [attr.class]="r === 3 && c === 3 ? 'dot center' : 'dot'"
              />
            }
          }
          @if (icon()) {
            <foreignObject x="32" y="32" width="32" height="32">
              <div class="icon-wrap">
                <mat-icon>{{ icon() }}</mat-icon>
              </div>
            </foreignObject>
          }
        </svg>
      </div>
      <h3 class="title">{{ title() }}</h3>
      @if (description()) {
        <p class="description">{{ description() }}</p>
      }
      <div class="actions">
        <ng-content></ng-content>
      </div>
    </div>
  `,
  styles: [`
    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      padding: 56px 24px;
      background: var(--bg-surface-1);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-xl);
      gap: 14px;
    }

    .illustration {
      width: 96px;
      height: 96px;
      display: grid;
      place-items: center;
      margin-bottom: 4px;
    }

    .dot {
      fill: var(--text-muted);
      opacity: 0.18;
    }

    .dot.center {
      fill: var(--brand-primary);
      opacity: 0.9;
    }

    .icon-wrap {
      width: 32px;
      height: 32px;
      display: grid;
      place-items: center;
      color: var(--brand-primary);
    }

    .icon-wrap mat-icon {
      font-size: 20px;
      width: 20px;
      height: 20px;
    }

    .title {
      font-family: 'Geist', 'Inter', sans-serif;
      font-size: var(--fs-h2);
      font-weight: 600;
      color: var(--text-primary);
      margin: 4px 0 0;
      letter-spacing: -0.015em;
    }

    .description {
      font-size: var(--fs-body);
      color: var(--text-secondary);
      margin: 0;
      max-width: 440px;
      line-height: 1.55;
    }

    .actions {
      margin-top: 10px;
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      justify-content: center;
    }
  `]
})
export class EmptyStateComponent {
  readonly icon = input<string>('');
  readonly title = input.required<string>();
  readonly description = input<string>('');

  protected readonly grid = Array.from({ length: 7 });
}
