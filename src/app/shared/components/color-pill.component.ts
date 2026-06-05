import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { DataService } from '../../core/services/data.service';

type PillKind = 'category' | 'supplier' | 'channel';

/** Pílula colorida para categoria/fornecedor/canal — usa a cor cadastrada (ou a padrão). */
@Component({
  selector: 'app-color-pill',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './color-pill.component.html',
  styleUrl: './color-pill.component.scss',
})
export class ColorPillComponent {
  private readonly data = inject(DataService);

  readonly name = input.required<string>();
  readonly kind = input<PillKind>('category');

  protected readonly color = computed(() => this.data.entityColor(this.kind(), this.name()));
  protected readonly bg = computed(() => `color-mix(in srgb, ${this.color()} 14%, transparent)`);
}
