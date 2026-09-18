/**
 * Guia numerado com índice.
 *
 * O layout saiu da página de Instruções para ser reaproveitado pelo guia do
 * Mercado Livre. Estes testes existem principalmente por causa disso: provam
 * que a extração não mudou o que a tela antiga desenhava, e que o índice e as
 * seções continuam apontando um para o outro.
 */
import { Component, Type } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';
import { GuideComponent, GuideItem } from './guide.component';
import { GuidePageComponent } from '../../features/guide/guide-page.component';

@Component({
  standalone: true,
  imports: [GuideComponent],
  template: '<app-guide [items]="items" tocTitle="t" indexAria="a" />',
})
class Hospedeiro {
  items: GuideItem[] = [
    { titleKey: 'um', bodyKey: 'corpo-um' },
    { titleKey: 'dois', bodyKey: 'corpo-dois' },
  ];
}

function montar<T>(componente: Type<T>): ComponentFixture<T> {
  TestBed.configureTestingModule({
    imports: [componente, TranslateModule.forRoot()],
  });
  const f = TestBed.createComponent(componente);
  f.detectChanges();
  return f;
}

afterEach(() => TestBed.resetTestingModule());

describe('o guia desenha o que recebe', () => {
  it('uma seção e um item de índice por tópico', () => {
    const f = montar(Hospedeiro);
    const el = f.nativeElement as HTMLElement;
    expect(el.querySelectorAll('.inst-section')).toHaveLength(2);
    expect(el.querySelectorAll('.toc-link')).toHaveLength(2);
  });

  it('cada link do índice aponta para a seção correspondente', () => {
    // Se os ids saíssem de contadores diferentes, o índice levaria ao lugar
    // errado — e ninguém percebe isso lendo o código.
    const el = montar(Hospedeiro).nativeElement as HTMLElement;
    const alvos = Array.from(el.querySelectorAll('.toc-link')).map(a => a.getAttribute('href'));
    const ids = Array.from(el.querySelectorAll('.inst-section')).map(
      s => `#${s.getAttribute('id')}`,
    );
    expect(alvos).toEqual(ids);
  });

  it('numera com zero à esquerda até o nono', () => {
    // Sem o zero, o índice dança de largura entre 9 e 10.
    const f = montar(Hospedeiro);
    (f.componentInstance as Hospedeiro).items = Array.from({ length: 11 }, (_, i) => ({
      titleKey: `t${i}`,
      bodyKey: `b${i}`,
    }));
    f.detectChanges();

    const nums = Array.from((f.nativeElement as HTMLElement).querySelectorAll('.inst-num')).map(
      n => n.textContent?.trim(),
    );
    expect(nums[0]).toBe('01');
    expect(nums[8]).toBe('09');
    expect(nums[9]).toBe('10');
  });

  it('lista vazia não quebra a tela', () => {
    const f = montar(Hospedeiro);
    (f.componentInstance as Hospedeiro).items = [];
    f.detectChanges();
    expect((f.nativeElement as HTMLElement).querySelectorAll('.inst-section')).toHaveLength(0);
  });
});

/**
 * As duas telas viraram uma em setembro/2026 (Instruções + Guia do ML).
 *
 * As contagens continuam sendo a guarda que importa: a fusão não podia comer
 * seção no caminho, e é o tipo de perda que ninguém nota lendo o diff — 23
 * chaves de i18n continuam existindo, só param de ser renderizadas.
 */
describe('o guia unificado', () => {
  it('traz os 13 tópicos da integração e os 10 do uso manual', () => {
    const el = montar(GuidePageComponent).nativeElement as HTMLElement;
    expect(el.querySelectorAll('.inst-section')).toHaveLength(23);
    expect(el.querySelectorAll('.toc-link')).toHaveLength(23);
  });

  it('mantém dois índices, um por bloco', () => {
    // Um índice único de 23 linhas não ajuda ninguém a achar nada.
    const el = montar(GuidePageComponent).nativeElement as HTMLElement;
    expect(el.querySelectorAll('app-guide')).toHaveLength(2);
    expect(el.querySelectorAll('.toc')).toHaveLength(2);
  });

  it('a integração vem antes do manual', () => {
    // A ordem é a do uso real: o que acontece sozinho primeiro. Inverter faria
    // quem conectou a conta ler dez seções que não valem mais para ele.
    const el = montar(GuidePageComponent).nativeElement as HTMLElement;
    const ids = Array.from(el.querySelectorAll('.inst-section')).map(s => s.getAttribute('id'));
    expect(ids[0]).toBe('ml-0');
    expect(ids[13]).toBe('man-0');
  });

  it('nenhum id de seção se repete entre os dois blocos', () => {
    // `id` duplicado é HTML inválido: âncora e leitor de tela passam a apontar
    // sempre para o primeiro, que é o guia errado.
    const el = montar(GuidePageComponent).nativeElement as HTMLElement;
    const ids = Array.from(el.querySelectorAll('.inst-section')).map(s => s.getAttribute('id'));
    expect(new Set(ids).size).toBe(ids.length);
  });
});
