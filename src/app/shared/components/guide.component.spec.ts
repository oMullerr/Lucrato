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
import { InstructionsComponent } from '../../features/instructions/instructions.component';
import { MlGuideComponent } from '../../features/ml-guide/ml-guide.component';

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

describe('as duas páginas que usam o guia', () => {
  it('Instruções continua com os seus 10 tópicos', () => {
    // Guarda contra a extração ter comido uma seção no caminho.
    const el = montar(InstructionsComponent).nativeElement as HTMLElement;
    expect(el.querySelectorAll('.inst-section')).toHaveLength(10);
  });

  it('o guia do Mercado Livre cobre as 13 telas e regras', () => {
    const el = montar(MlGuideComponent).nativeElement as HTMLElement;
    expect(el.querySelectorAll('.inst-section')).toHaveLength(13);
    expect(el.querySelectorAll('.toc-link')).toHaveLength(13);
  });
});
