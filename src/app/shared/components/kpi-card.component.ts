import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { SparklineComponent, SparklineTone } from './sparkline.component';
import { IconComponent } from '../ui/icon/icon.component';
import { IconName } from '../ui/icon/icons';

/* Só o vocabulário semântico. Os apelidos de cor (`red`, `teal`, `amber`…)
   ficaram sem nenhum chamador quando as telas migraram, e manter os dois
   vocabulários vivos era garantir que voltassem a divergir: `teal` apontava
   para a marca numa época em que a marca era verde-petróleo. Como o tipo é uma
   união, um apelido novo agora é erro de compilação, não cor errada. */
export type KpiVariant = 'success' | 'danger' | 'warning' | 'info' | 'neutral' | 'brand';
export type KpiSize = 'compact' | 'default' | 'hero';

@Component({
  selector: 'app-kpi-card',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent, SparklineComponent],
  templateUrl: './kpi-card.component.html',
  styleUrl: './kpi-card.component.scss',
})
export class KpiCardComponent {
  readonly title = input.required<string>();
  readonly value = input.required<string | number>();
  readonly icon = input<IconName | ''>('');
  readonly note = input<string>('');
  readonly variant = input<KpiVariant>('neutral');
  readonly size = input<KpiSize>('default');
  readonly delta = input<number | null>(null);
  readonly deltaLabel = input<string>('');
  readonly sparkline = input<number[] | null>(null);

  protected readonly deltaDir = computed<'up' | 'down' | 'flat'>(() => {
    const d = this.delta();
    if (d === null || d === 0) return 'flat';
    return d > 0 ? 'up' : 'down';
  });

  protected readonly deltaIcon = computed<IconName>(() => {
    const dir = this.deltaDir();
    if (dir === 'up') return 'trending-up';
    if (dir === 'down') return 'trending-down';
    return 'minus';
  });

  protected readonly formattedDelta = computed(() => {
    const d = this.delta();
    if (d === null) return '';
    const abs = Math.abs(d * 100).toFixed(1);
    return `${abs}%`;
  });

  /** Tom do sparkline — cai para a variante ou autodetecção. */
  protected readonly sparklineTone = computed<SparklineTone>(() => {
    const v = this.variant();
    if (v === 'success' || v === 'danger' || v === 'warning' || v === 'brand' || v === 'neutral') return v;
    return 'auto';
  });
}
