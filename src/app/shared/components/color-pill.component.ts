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

  /**
   * A cor da etiqueta, puxada para o texto do tema até dar para ler.
   *
   * A cor aqui é ESCOLHIDA POR VOCÊ nas configurações, então nenhum token
   * garante contraste: uma categoria em cinza-claro virava texto cinza-claro
   * sobre um tint dele mesmo — 2.56:1, conferido na tela.
   *
   * Misturar com `--text-primary` resolve nos DOIS temas com a MESMA
   * expressão, e é por isso que ela é assim: no claro o texto do tema é quase
   * preto e a mistura escurece; no escuro é quase branco e ela clareia.
   *
   * Os 42% saíram de medir, não de chutar. O pior caso é uma cor pura de
   * luminância alta — o canal "Mercado Livre" está em `#ffe600` — e o amarelo
   * só cruza 4.5:1 a partir de 45% de tinta. 42% dá folga sem apagar o matiz
   * das cores que já são escuras, que é o motivo de a etiqueta ter cor.
   */
  protected readonly textColor = computed(
    () => `color-mix(in srgb, ${this.color()} 42%, var(--text-primary))`,
  );
}
