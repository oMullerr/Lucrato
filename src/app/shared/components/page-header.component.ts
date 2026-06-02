import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'app-page-header',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './page-header.component.html',
  styleUrl: './page-header.component.scss',
})
export class PageHeaderComponent {
  readonly title = input.required<string>();
  readonly subtitle = input<string>('');
  /** Tiny uppercased label above the title (eg. "PANORAMA · ATUALIZADO 14:32"). */
  readonly eyebrow = input<string>('');
  /** Kept for backwards compatibility — ignored visually in the new design. */
  readonly icon = input<string>('');
}
