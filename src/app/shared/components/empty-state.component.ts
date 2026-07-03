import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { IconComponent } from '../ui/icon/icon.component';
import { IconName } from '../ui/icon/icons';

@Component({
  selector: 'app-empty-state',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
  templateUrl: './empty-state.component.html',
  styleUrl: './empty-state.component.scss',
})
export class EmptyStateComponent {
  readonly icon = input<IconName | ''>('');
  readonly title = input.required<string>();
  readonly description = input<string>('');

  protected readonly grid = Array.from({ length: 7 });
}
