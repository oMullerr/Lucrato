import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import type { Alerta, Severidade, TipoAlerta } from '../../core/ml/alerts';
import { IconComponent } from '../ui/icon/icon.component';
import { IconName } from '../ui/icon/icons';

/** Ícone e destino de cada tipo de alerta. O texto vem do i18n. */
const APARENCIA: Record<TipoAlerta, { icone: IconName; rota: string }> = {
  ativo_sem_estoque: { icone: 'package', rota: '/purchases' },
  pausado_com_estoque: { icone: 'tags', rota: '/anuncios' },
  /* Leva aos Anúncios, e não a Vendas: o conserto é o preço que está no ar
     agora, não a venda que já passou. */
  preco_abaixo_do_minimo: { icone: 'calculator', rota: '/anuncios' },
  margem_baixa: { icone: 'trending-up', rota: '/sales' },
  sem_conversao: { icone: 'chart-spline', rota: '/anuncios' },
};

const TOM: Record<Severidade, string> = { alta: 'danger', media: 'warning', baixa: 'info' };

/**
 * Lista de alertas de operação.
 *
 * O motor (`core/ml/alerts.ts`) existia desde a feature de métricas — puro,
 * testado, e **sem nenhum consumidor**: só a constante `JANELA_DIAS` era
 * importada, e o comentário na tela de Anúncios admitia que o resto estava lá
 * "esperando o painel voltar num commit só". Este é o commit.
 *
 * O componente não decide nada: recebe a lista pronta e desenha. Toda regra de
 * "o que é alerta" continua no módulo puro, onde dá para testar sem tela.
 */
@Component({
  selector: 'app-alert-list',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, IconComponent, TranslateModule],
  template: `
    @if (visiveis().length > 0) {
      <ul class="alert-list" [attr.aria-label]="'alerts.listLabel' | translate">
        @for (a of visiveis(); track a.tipo + a.itemId) {
          <li class="alert-row" [class]="'tone-' + tom(a)">
            <span class="alert-icon" aria-hidden="true"><app-icon [name]="icone(a)" [size]="17" /></span>
            <div class="alert-text">
              <p class="alert-msg">{{ 'alerts.' + a.tipo | translate:a.dados }}</p>
              <p class="alert-item" [title]="a.titulo">{{ a.titulo }}</p>
            </div>
            <a class="alert-go" [routerLink]="rota(a)" [attr.aria-label]="'alerts.resolve' | translate">
              {{ 'alerts.resolve' | translate }}
              <app-icon name="chevron-right" [size]="15" />
            </a>
          </li>
        }
      </ul>

      @if (escondidos() > 0) {
        <p class="alert-more">{{ 'alerts.andMore' | translate:{ total: escondidos() } }}</p>
      }
    }
  `,
  styleUrl: './alert-list.component.scss',
})
export class AlertListComponent {
  readonly alertas = input.required<readonly Alerta[]>();

  /**
   * Teto de linhas. Uma lista de trinta alertas não é uma pauta — é outra
   * tabela para rolar, e ninguém age sobre ela. Os cortados viram contagem.
   */
  readonly limite = input(5);

  protected readonly visiveis = computed(() => this.alertas().slice(0, this.limite()));
  protected readonly escondidos = computed(() => Math.max(0, this.alertas().length - this.limite()));

  protected icone(a: Alerta): IconName { return APARENCIA[a.tipo].icone; }
  protected rota(a: Alerta): string { return APARENCIA[a.tipo].rota; }
  protected tom(a: Alerta): string { return TOM[a.severidade]; }
}
