import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';
import type { SugestaoDeCompra, Urgencia } from '../../core/reposicao';
import { IconComponent } from '../ui/icon/icon.component';

const TOM: Record<Urgencia, string> = {
  atrasado: 'danger',
  critico: 'warning',
  atencao: 'info',
};

/**
 * "Repor" — o que comprar, quanto, e até quando.
 *
 * O app respondia "o que eu tenho" e "o que eu ganhei", mas não a pergunta que
 * vem depois e custa dinheiro nas duas direções: repor cedo demais empata
 * capital, repor tarde demais perde venda com o anúncio no ar.
 *
 * Este bloco não calcula nada — `core/reposicao.ts` decide o que merece
 * aparecer, e é lá que isso é testado. Aqui só se desenha.
 *
 * O rodapé de cada linha diz em quantas vendas o ritmo se apoia, de propósito:
 * uma sugestão tirada de duas vendas em três meses não merece a mesma
 * confiança que uma tirada de quarenta, e esconder isso faria o número parecer
 * mais firme do que é.
 */
@Component({
  selector: 'app-reposicao-card',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent, TranslateModule],
  template: `
    @if (sugestoes().length > 0) {
      <section class="repor" [attr.aria-label]="'restock.title' | translate">
        <header class="repor-head">
          <h2>
            <app-icon name="shopping-cart" [size]="17" />
            {{ 'restock.title' | translate }}
          </h2>
          <span class="repor-count">{{ sugestoes().length }}</span>
        </header>

        <ul class="repor-list">
          @for (s of visiveis(); track s.produto) {
            <li class="repor-row" [class]="'tone-' + tom(s)">
              <div class="repor-main">
                <p class="repor-produto">{{ s.produto }}</p>
                <p class="repor-quando">
                  {{ 'restock.' + s.urgencia | translate:{ dias: absDias(s) } }}
                  <span class="repor-sep">·</span>
                  {{ 'restock.lead' | translate:{ dias: s.prazoDias, fornecedor: s.fornecedor } }}
                  @if (!s.prazoMedido) {
                    <span class="repor-estimado">{{ 'restock.leadGuess' | translate }}</span>
                  }
                </p>
                <p class="repor-base">
                  {{ 'restock.basis' | translate:{
                       unidades: s.base.unidades, vendas: s.base.vendas, dias: s.base.dias } }}
                </p>
              </div>

              <div class="repor-numeros">
                <span class="repor-qtd">{{ s.quantidade }}</span>
                <span class="repor-qtd-label">{{ 'restock.units' | translate }}</span>
                <span class="repor-estoque">
                  {{ 'restock.onHand' | translate:{ estoque: s.estoque } }}
                </span>
              </div>
            </li>
          }
        </ul>
      </section>
    }
  `,
  styleUrl: './reposicao-card.component.scss',
})
export class ReposicaoCardComponent {
  readonly sugestoes = input.required<readonly SugestaoDeCompra[]>();

  /** Teto de linhas; o resto continua na lista de lotes logo abaixo. */
  readonly limite = input(5);

  protected readonly visiveis = computed(() => this.sugestoes().slice(0, this.limite()));

  protected tom(s: SugestaoDeCompra): string { return TOM[s.urgencia]; }

  /**
   * O sinal de `diasParaPedir` já está na urgência ('atrasado'), e a frase de
   * cada caso traz a palavra certa. Mandar o número negativo junto produziria
   * "atrasado há -4 dias".
   */
  protected absDias(s: SugestaoDeCompra): number {
    return Math.abs(s.diasParaPedir);
  }
}
