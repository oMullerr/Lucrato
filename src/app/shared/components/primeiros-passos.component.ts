import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { IconComponent } from '../ui/icon/icon.component';

export interface EstadoDosPassos {
  /** Conta do Mercado Livre autorizada. */
  conectado: boolean;
  /** Ao menos um anúncio vinculado a um produto. */
  vinculado: boolean;
  /** Ao menos um lote cadastrado. */
  temLotes: boolean;
}

interface Passo {
  chave: 'conectar' | 'vincular' | 'lotes';
  rota: string;
  feito: boolean;
}

/**
 * Primeiros passos, numa base ainda vazia.
 *
 * O que havia era um único botão "cadastrar lote". Não estava errado, estava
 * incompleto: quem entra numa base zerada não descobre por ali que o caminho
 * começa em conectar o Mercado Livre — e sem isso vai digitar à mão um mês
 * inteiro de vendas que a integração traria sozinha.
 *
 * A ORDEM É A DO TRABALHO, e o terceiro passo não é opcional: o Mercado Livre
 * sabe o que você vendeu e por quanto, mas NÃO sabe quanto você pagou ao
 * fornecedor. Sem lote não há custo, e sem custo não há lucro — o app mostraria
 * faturamento e chamaria de resultado.
 *
 * Cada passo se marca sozinho a partir do estado real, e não de um checklist
 * guardado: um passo que diz "feito" porque alguém clicou, e não porque
 * aconteceu, é pior que passo nenhum.
 */
@Component({
  selector: 'app-primeiros-passos',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, IconComponent, TranslateModule],
  template: `
    <section class="passos" [attr.aria-label]="'onboarding.title' | translate">
      <header class="passos-head">
        <h2>{{ 'onboarding.title' | translate }}</h2>
        <p>{{ 'onboarding.subtitle' | translate }}</p>
      </header>

      <ol class="passos-list">
        @for (p of passos(); track p.chave; let i = $index) {
          <li class="passo" [class.feito]="p.feito">
            <span class="passo-num" aria-hidden="true">
              @if (p.feito) {
                <app-icon name="check" [size]="16" />
              } @else {
                {{ i + 1 }}
              }
            </span>

            <div class="passo-texto">
              <p class="passo-titulo">{{ 'onboarding.' + p.chave + 'Title' | translate }}</p>
              <p class="passo-desc">{{ 'onboarding.' + p.chave + 'Desc' | translate }}</p>
            </div>

            @if (p.feito) {
              <span class="passo-ok">{{ 'onboarding.done' | translate }}</span>
            } @else {
              <a class="passo-go" [routerLink]="p.rota">
                {{ 'onboarding.' + p.chave + 'Cta' | translate }}
                <app-icon name="chevron-right" [size]="15" />
              </a>
            }
          </li>
        }
      </ol>
    </section>
  `,
  styleUrl: './primeiros-passos.component.scss',
})
export class PrimeirosPassosComponent {
  readonly estado = input.required<EstadoDosPassos>();

  protected readonly passos = computed<Passo[]>(() => {
    const e = this.estado();
    return [
      { chave: 'conectar', rota: '/integracoes', feito: e.conectado },
      { chave: 'vincular', rota: '/anuncios', feito: e.vinculado },
      { chave: 'lotes', rota: '/purchases', feito: e.temLotes },
    ];
  });
}
