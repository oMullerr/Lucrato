import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import type { Pendencia, TipoPendencia } from '../../core/pendencias';
import type { Severidade } from '../../core/ml/alerts';
import { IconComponent } from '../ui/icon/icon.component';
import { IconName } from '../ui/icon/icons';
import { BrlPipe } from '../pipes/brl.pipe';

/**
 * Para onde cada pendência leva, e com que cara. O texto vem do i18n.
 *
 * `estoque_parado` aponta para a própria tela inicial — e por isso leva o
 * filtro na query: sem ele, "Resolver" seria um link que não faz nada, que é
 * pior que não ter link.
 */
const APARENCIA: Record<
  TipoPendencia,
  { icone: IconName; rota: string; params?: Record<string, string> }
> = {
  ml_reconectar: { icone: 'store', rota: '/integracoes' },
  caixa_esperando: { icone: 'download', rota: '/caixa-ml' },
  estoque_parado: { icone: 'package', rota: '/inventory', params: { status: 'Parado' } },
  devolucao_aberta: { icone: 'rotate-ccw', rota: '/returns' },
  mei_teto: { icone: 'landmark', rota: '/fiscal' },
};

const TOM: Record<Severidade, string> = { alta: 'danger', media: 'warning', baixa: 'info' };

/**
 * "Precisa de você" — a pauta do dia.
 *
 * A rota inicial do app é o Estoque, que é um panorama: responde "como vai o
 * negócio", não "o que eu faço agora". Toda informação acionável estava
 * espalhada por cinco telas, e nenhuma delas é a primeira que se abre.
 *
 * Este bloco não calcula nada — `core/pendencias.ts` decide o que merece
 * aparecer, e é lá que isso é testado.
 */
@Component({
  selector: 'app-pendencias-card',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, IconComponent, BrlPipe, TranslateModule],
  template: `
    @if (pendencias().length > 0) {
      <section class="pauta" [attr.aria-label]="'alerts.title' | translate">
        <header class="pauta-head">
          <h2>
            <app-icon name="triangle-alert" [size]="17" />
            {{ 'alerts.title' | translate }}
          </h2>
          <span class="pauta-count">{{ pendencias().length }}</span>
        </header>

        <ul class="pauta-list">
          @for (p of visiveis(); track p.tipo) {
            <li class="pauta-row" [class]="'tone-' + tom(p)">
              <span class="pauta-icon" aria-hidden="true">
                <app-icon [name]="icone(p)" [size]="17" />
              </span>
              <p class="pauta-msg">{{ 'pendencias.' + p.tipo | translate:textos(p) }}</p>
              <a class="pauta-go" [routerLink]="rota(p)" [queryParams]="params(p)">
                {{ 'alerts.resolve' | translate }}
                <app-icon name="chevron-right" [size]="15" />
              </a>
            </li>
          }
        </ul>
      </section>
    }
  `,
  styleUrl: './pendencias-card.component.scss',
})
export class PendenciasCardComponent {
  readonly pendencias = input.required<readonly Pendencia[]>();

  /** Teto de linhas; o resto continua nas telas de origem. */
  readonly limite = input(5);

  protected readonly visiveis = computed(() => this.pendencias().slice(0, this.limite()));

  protected icone(p: Pendencia): IconName { return APARENCIA[p.tipo].icone; }
  protected rota(p: Pendencia): string { return APARENCIA[p.tipo].rota; }
  protected params(p: Pendencia): Record<string, string> | null {
    return APARENCIA[p.tipo].params ?? null;
  }
  protected tom(p: Pendencia): string { return TOM[p.severidade]; }

  /**
   * Formata o dinheiro ANTES do i18n.
   *
   * O `translate` interpola texto cru; sem isto, `valor` chegaria como
   * `12905.03` no meio da frase — ponto decimal e tudo, num app que fala real.
   */
  protected textos(p: Pendencia): Record<string, string | number> {
    const dados = { ...p.dados };
    if (typeof dados['valor'] === 'number') {
      dados['valor'] = this.brl.transform(dados['valor']);
    }
    return dados;
  }

  private readonly brl = new BrlPipe();
}
