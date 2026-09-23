/**
 * Primeiros passos, numa base ainda vazia.
 *
 * O bloco é desenhado só quando não há lote nenhum — ou seja, na única
 * situação em que ninguém consegue abri-lo de novo para conferir. Por isso ele
 * é montado de verdade aqui: é a única forma de provar que os três passos
 * aparecem, que se marcam sozinhos e que cada botão leva ao lugar certo.
 */
import { Component, Type, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { EstadoDosPassos, PrimeirosPassosComponent } from './primeiros-passos.component';

@Component({
  standalone: true,
  imports: [PrimeirosPassosComponent],
  template: '<app-primeiros-passos [estado]="estado()" />',
})
class Hospedeiro {
  readonly estado = signal<EstadoDosPassos>({
    conectado: false,
    vinculado: false,
    temLotes: false,
  });
}

function montar<T>(componente: Type<T>): ComponentFixture<T> {
  TestBed.configureTestingModule({
    imports: [componente, TranslateModule.forRoot()],
    providers: [provideRouter([])],
  });
  const f = TestBed.createComponent(componente);
  f.detectChanges();
  return f;
}

const passos = (f: ComponentFixture<unknown>): HTMLElement[] =>
  Array.from((f.nativeElement as HTMLElement).querySelectorAll<HTMLElement>('.passo'));

afterEach(() => TestBed.resetTestingModule());

describe('os três passos', () => {
  it('desenha os três, na ordem do trabalho', () => {
    const f = montar(Hospedeiro);
    const titulos = passos(f).map(p => p.querySelector('.passo-titulo')?.textContent?.trim());

    expect(titulos).toEqual([
      'onboarding.conectarTitle',
      'onboarding.vincularTitle',
      'onboarding.lotesTitle',
    ]);
  });

  it('cada passo leva ao lugar que resolve aquele passo', () => {
    const f = montar(Hospedeiro);
    const destinos = passos(f).map(p => p.querySelector('a')?.getAttribute('href'));

    expect(destinos).toEqual(['/integracoes', '/anuncios', '/purchases']);
  });

  it('nada feito: três botões, nenhum selo de concluído', () => {
    const f = montar(Hospedeiro);
    const el = f.nativeElement as HTMLElement;

    expect(el.querySelectorAll('.passo-go')).toHaveLength(3);
    expect(el.querySelectorAll('.passo-ok')).toHaveLength(0);
  });
});

describe('cada passo se marca a partir do estado real', () => {
  it('conectado marca o primeiro e some com o botão dele', () => {
    const f = montar(Hospedeiro);
    f.componentInstance.estado.set({ conectado: true, vinculado: false, temLotes: false });
    f.detectChanges();

    const lista = passos(f);
    expect(lista[0].classList).toContain('feito');
    expect(lista[0].querySelector('a')).toBeNull();
    expect(lista[1].classList).not.toContain('feito');
  });

  it('a ordem dos passos não muda quando um é concluído fora de ordem', () => {
    /* Cadastrar lote sem conectar é caminho legítimo — quem importa planilha
       antiga faz isso. O passo cumprido se marca, mas a lista continua
       contando a mesma história. */
    const f = montar(Hospedeiro);
    f.componentInstance.estado.set({ conectado: false, vinculado: false, temLotes: true });
    f.detectChanges();

    const lista = passos(f);
    expect(lista.map(p => p.classList.contains('feito'))).toEqual([false, false, true]);
    expect(lista[2].querySelector('.passo-ok')).not.toBeNull();
  });

  it('tudo feito: três selos e nenhum botão', () => {
    const f = montar(Hospedeiro);
    f.componentInstance.estado.set({ conectado: true, vinculado: true, temLotes: true });
    f.detectChanges();

    const el = f.nativeElement as HTMLElement;
    expect(el.querySelectorAll('.passo-ok')).toHaveLength(3);
    expect(el.querySelectorAll('.passo-go')).toHaveLength(0);
  });
});
