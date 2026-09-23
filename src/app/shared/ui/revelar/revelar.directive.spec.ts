/**
 * Revelação ao rolar.
 *
 * O risco desta diretiva não é deixar de animar — é deixar um bloco ESCONDIDO.
 * Um bloco marcado que nunca recebe o `revelado` é conteúdo sumido da tela, e
 * num app de dinheiro isso é um número que o dono não vê. Metade destes testes
 * existe para os caminhos em que ela não deve esconder nada.
 */
import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { A_REVELAR, REVELADO, RevelarDirective } from './revelar.directive';

@Component({
  standalone: true,
  imports: [RevelarDirective],
  template: `
    <div class="page-content" appRevelar>
      <section id="heroi" data-top="80"></section>
      <section id="grade" data-top="500"></section>
      <section id="tabela" data-top="1400"></section>
      @if (mostrarAtrasado) {
        <section id="atrasado" data-top="2200"></section>
      }
    </div>
  `,
})
class Pagina {
  mostrarAtrasado = false;
}

/** IntersectionObserver de mentira: guarda o callback para o teste disparar. */
class VisaoFalsa {
  static ultima: VisaoFalsa | null = null;
  observados = new Set<Element>();
  desligada = false;
  constructor(readonly aoCruzar: IntersectionObserverCallback) {
    VisaoFalsa.ultima = this;
  }
  observe(el: Element): void { this.observados.add(el); }
  unobserve(el: Element): void { this.observados.delete(el); }
  disconnect(): void { this.desligada = true; this.observados.clear(); }
  cruzar(el: Element): void {
    this.aoCruzar(
      [{ target: el, isIntersecting: true } as unknown as IntersectionObserverEntry],
      this as unknown as IntersectionObserver,
    );
  }
}

const ALTURA_DA_TELA = 768;
let restaurar: Array<() => void> = [];

function simularMovimentoReduzido(reduzido: boolean): void {
  const original = window.matchMedia;
  window.matchMedia = ((q: string) => ({
    matches: reduzido && q.includes('reduce'),
    media: q,
  })) as unknown as typeof window.matchMedia;
  restaurar.push(() => { window.matchMedia = original; });
}

function montar(): ComponentFixture<Pagina> {
  TestBed.configureTestingModule({ imports: [Pagina] });
  const f = TestBed.createComponent(Pagina);
  f.detectChanges();
  return f;
}

const bloco = (f: ComponentFixture<Pagina>, id: string) =>
  (f.nativeElement as HTMLElement).querySelector(`#${id}`) as HTMLElement;

beforeEach(() => {
  // jsdom não tem layout: a posição de cada bloco vem do `data-top`.
  const posicao = jest
    .spyOn(Element.prototype, 'getBoundingClientRect')
    .mockImplementation(function (this: Element) {
      const top = Number(this.getAttribute('data-top') ?? 0);
      return { top, bottom: top + 200, left: 0, right: 0, width: 0, height: 200, x: 0, y: top } as DOMRect;
    });
  // No jsdom `innerHeight` é valor, não getter: não dá para espiar, só trocar.
  const alturaOriginal = window.innerHeight;
  Object.defineProperty(window, 'innerHeight', { value: ALTURA_DA_TELA, configurable: true, writable: true });
  const io = (window as unknown as { IntersectionObserver?: unknown }).IntersectionObserver;
  (window as unknown as { IntersectionObserver: unknown }).IntersectionObserver = VisaoFalsa;
  restaurar.push(
    () => posicao.mockRestore(),
    () => { Object.defineProperty(window, 'innerHeight', { value: alturaOriginal, configurable: true, writable: true }); },
    () => { (window as unknown as { IntersectionObserver?: unknown }).IntersectionObserver = io; },
  );
  VisaoFalsa.ultima = null;
});

afterEach(() => {
  restaurar.reverse().forEach((r) => r());
  restaurar = [];
  TestBed.resetTestingModule();
});

describe('o que está na tela ao carregar', () => {
  it('não é marcado — a entrada escalonada já cuida dele', () => {
    const f = montar();
    expect(bloco(f, 'heroi').classList.contains(A_REVELAR)).toBe(false);
    expect(bloco(f, 'grade').classList.contains(A_REVELAR)).toBe(false);
  });
});

describe('o que está abaixo da dobra', () => {
  it('espera, e é observado', () => {
    const f = montar();
    const tabela = bloco(f, 'tabela');
    expect(tabela.classList.contains(A_REVELAR)).toBe(true);
    expect(VisaoFalsa.ultima!.observados.has(tabela)).toBe(true);
  });

  it('aparece quando chega à vista, e deixa de ser observado', () => {
    const f = montar();
    const tabela = bloco(f, 'tabela');
    VisaoFalsa.ultima!.cruzar(tabela);

    expect(tabela.classList.contains(REVELADO)).toBe(true);
    // Uma vez só: rolar para cima e para baixo não repete a entrada.
    expect(VisaoFalsa.ultima!.observados.has(tabela)).toBe(false);
  });

  it('o bloco que chega depois (dado do Firestore) também espera a vez', async () => {
    const f = montar();
    f.componentInstance.mostrarAtrasado = true;
    f.detectChanges();
    await Promise.resolve(); // o MutationObserver entrega numa microtarefa

    const atrasado = bloco(f, 'atrasado');
    expect(atrasado.classList.contains(A_REVELAR)).toBe(true);
    expect(VisaoFalsa.ultima!.observados.has(atrasado)).toBe(true);
  });
});

describe('caminhos em que nada pode ficar escondido', () => {
  it('movimento reduzido: não marca nada', () => {
    simularMovimentoReduzido(true);
    const f = montar();
    expect((f.nativeElement as HTMLElement).querySelectorAll(`.${A_REVELAR}`)).toHaveLength(0);
  });

  it('navegador sem IntersectionObserver: não marca nada', () => {
    delete (window as unknown as { IntersectionObserver?: unknown }).IntersectionObserver;
    const f = montar();
    expect((f.nativeElement as HTMLElement).querySelectorAll(`.${A_REVELAR}`)).toHaveLength(0);
  });

  it('ao sair da tela, desliga os observadores', () => {
    const f = montar();
    const visao = VisaoFalsa.ultima!;
    f.destroy();
    expect(visao.desligada).toBe(true);
  });
});
