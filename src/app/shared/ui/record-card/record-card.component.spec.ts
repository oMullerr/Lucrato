/**
 * Cartão de registro do celular.
 *
 * Ele nasceu como botão — em Vendas, Compras e Estoque a linha abre um
 * detalhe. Análises e Faturamento só têm o que ler, e um `<button>` que não faz
 * nada é anunciado como botão pelo leitor de tela. Estes testes seguram as duas
 * formas: a que abre continua abrindo, e a de leitura não finge que abre.
 */
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RecordCardComponent, RecordCardFigure } from './record-card.component';

function montar(entradas: Record<string, unknown>): ComponentFixture<RecordCardComponent> {
  TestBed.configureTestingModule({ imports: [RecordCardComponent] });
  const f = TestBed.createComponent(RecordCardComponent);
  for (const [k, v] of Object.entries(entradas)) f.componentRef.setInput(k, v);
  f.detectChanges();
  return f;
}

afterEach(() => TestBed.resetTestingModule());

describe('o cartão que abre', () => {
  it('é um botão, e o toque emite `pressed`', () => {
    const f = montar({ title: 'Furadeira' });
    let emitiu = 0;
    f.componentInstance.pressed.subscribe(() => emitiu++);

    const botao = (f.nativeElement as HTMLElement).querySelector('button.record-card');
    expect(botao).not.toBeNull();
    (botao as HTMLButtonElement).click();
    expect(emitiu).toBe(1);
  });

  it('é o padrão: as cinco telas que já usavam o cartão não mudam', () => {
    const el = montar({ title: 'Furadeira' }).nativeElement as HTMLElement;
    expect(el.querySelector('button.record-card')).not.toBeNull();
    expect(el.querySelector('.record-card--parado')).toBeNull();
  });
});

describe('o cartão de leitura', () => {
  it('não tem botão nenhum', () => {
    const el = montar({ title: 'Eletrodomésticos', interactive: false }).nativeElement as HTMLElement;
    expect(el.querySelector('button')).toBeNull();
    expect(el.querySelector('div.record-card.record-card--parado')).not.toBeNull();
  });

  it('desenha o mesmo conteúdo do cartão que abre', () => {
    // O corpo é um só `ng-template`: se as duas formas divergissem, o celular
    // mostraria números diferentes conforme a tela.
    const figuras: RecordCardFigure[] = [
      { label: 'Lotes', text: '31' },
      { label: 'Parado', text: 'R$ 2.300,74', textClass: 'text-warning' },
    ];
    const entradas = { title: 'Eletrodomésticos', code: 'C001', status: '22.6%', meta: '19 dias', figures: figuras };
    const leitura = montar({ ...entradas, interactive: false }).nativeElement as HTMLElement;
    const textoLeitura = leitura.textContent?.replace(/\s+/g, ' ').trim();
    TestBed.resetTestingModule();
    const abre = montar(entradas).nativeElement as HTMLElement;

    expect(textoLeitura).toBe(abre.textContent?.replace(/\s+/g, ' ').trim());
    expect(textoLeitura).toContain('C001');
    expect(textoLeitura).toContain('19 dias');
  });

  it('pinta a cifra de texto com a classe pedida', () => {
    const el = montar({
      title: 'Abr/2026',
      interactive: false,
      figures: [{ label: 'Taxas', text: 'R$ 253,97', textClass: 'text-warning' }],
    }).nativeElement as HTMLElement;
    const cifra = el.querySelector('.record-figure-text');
    expect(cifra?.classList.contains('text-warning')).toBe(true);
    // `[class]` substitui a lista inteira: as classes do template não podem sumir.
    expect(cifra?.classList.contains('record-figure-text')).toBe(true);
  });
});
