import { AfterViewInit, Directive, ElementRef, OnDestroy, inject } from '@angular/core';
import { prefereMenosMovimento } from '../../../core/anim/contar';

/**
 * Revela ao rolar os blocos que começam ABAIXO da dobra.
 *
 * Vai no contêiner da página (`.page-content`) e cuida dos filhos diretos. O
 * que já está na tela ao carregar fica com a entrada escalonada de sempre (ver
 * `_components.scss`); só o que o usuário ainda não viu espera para entrar
 * quando chegar à vista. Antes, esses blocos faziam a entrada deles longe dos
 * olhos, e quem rolava encontrava tudo parado.
 *
 * Uma vez por bloco, e nunca por linha de tabela: o alvo é o bloco inteiro.
 *
 * Os filhos que chegam DEPOIS (o dado do Firestore costuma chegar depois da
 * primeira pintura, trocando o esqueleto pelos blocos) são tratados por um
 * `MutationObserver`. O callback dele roda antes da próxima pintura, então o
 * bloco ganha a marca antes de aparecer — sem piscar pronto e sumir.
 *
 * Sem `IntersectionObserver`, ou com movimento reduzido, não faz nada: o
 * conteúdo fica visível. Nenhum caminho deixa um bloco escondido para sempre.
 */
@Directive({
  selector: '[appRevelar]',
  standalone: true,
})
export class RevelarDirective implements AfterViewInit, OnDestroy {
  private readonly raiz = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private visao?: IntersectionObserver;
  private mutacoes?: MutationObserver;

  ngAfterViewInit(): void {
    if (typeof IntersectionObserver === 'undefined' || prefereMenosMovimento()) return;

    this.visao = new IntersectionObserver(
      (entradas) => {
        for (const e of entradas) {
          if (!e.isIntersecting) continue;
          e.target.classList.add(REVELADO);
          this.visao?.unobserve(e.target);
        }
      },
      // Limiar 0 com margem, e não um limiar em fração: num bloco mais alto que
      // a tela, "10% visível" deixaria as primeiras centenas de pixels na tela
      // e ainda invisíveis. Assim revela quando 40px dele entram, qualquer altura.
      { threshold: 0, rootMargin: '0px 0px -40px 0px' },
    );

    this.marcarFilhos();
    this.mutacoes = new MutationObserver(() => this.marcarFilhos());
    this.mutacoes.observe(this.raiz, { childList: true });
  }

  ngOnDestroy(): void {
    this.visao?.disconnect();
    this.mutacoes?.disconnect();
  }

  private marcarFilhos(): void {
    const dobra = window.innerHeight;
    for (const filho of Array.from(this.raiz.children)) {
      if (filho.classList.contains(A_REVELAR)) continue;
      // Acima da dobra, a entrada escalonada já cuida dele.
      if (filho.getBoundingClientRect().top < dobra) continue;
      filho.classList.add(A_REVELAR);
      this.visao?.observe(filho);
    }
  }
}

/** Classes que o CSS de `_components.scss` lê. Mudou aqui, mude lá. */
export const A_REVELAR = 'a-revelar';
export const REVELADO = 'revelado';
