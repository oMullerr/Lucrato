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
        <div class="ring ring-1"></div>
        <div class="ring ring-2"></div>
        <div class="icon-circle">
          <mat-icon>{{ icon() }}</mat-icon>
        </div>
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
      background: var(--bg-surface);
      border: 1px solid var(--brd-default);
      border-radius: var(--radius-lg);
      gap: 12px;
    }

    .illustration {
      position: relative;
      width: 100px;
      height: 100px;
      display: grid;
      place-items: center;
      margin-bottom: 4px;
    }

    .ring {
      position: absolute;
      inset: 0;
      border-radius: 50%;
      border: 1px solid color-mix(in srgb, var(--clr-blue) 22%, transparent);
    }

    .ring-1 {
      transform: scale(1);
      opacity: 0.5;
    }

    .ring-2 {
      transform: scale(0.78);
      opacity: 0.8;
      background: color-mix(in srgb, var(--clr-blue) 6%, transparent);
    }

    .icon-circle {
      position: relative;
      z-index: 1;
      width: 60px;
      height: 60px;
      border-radius: 50%;
      display: grid;
      place-items: center;
      background: linear-gradient(135deg,
        color-mix(in srgb, var(--clr-blue) 100%, transparent),
        color-mix(in srgb, var(--clr-green) 80%, var(--clr-blue))
      );
      color: #FFFFFF;
      box-shadow: var(--shadow-md);
    }

    .icon-circle mat-icon {
      font-size: 30px;
      width: 30px;
      height: 30px;
    }

    .title {
      font-size: 17px;
      font-weight: 600;
      color: var(--txt-primary);
      margin: 8px 0 0;
      letter-spacing: -0.2px;
    }

    .description {
      font-size: 13px;
      color: var(--txt-secondary);
      margin: 0;
      max-width: 420px;
      line-height: 1.5;
    }

    .actions {
      margin-top: 8px;
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      justify-content: center;
    }
  `]
})
export class EmptyStateComponent {
  readonly icon = input<string>('inbox');
  readonly title = input.required<string>();
  readonly description = input<string>('');
}
