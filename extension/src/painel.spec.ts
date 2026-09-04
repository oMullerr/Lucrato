/**
 * O painel injetado no anúncio.
 *
 * Ele vive dentro da página de um terceiro, então o que estes testes protegem é
 * o isolamento e a honestidade: o título do anúncio não pode virar HTML, o
 * estilo não pode vazar, e um número estimado precisa aparecer marcado como
 * estimado.
 */
import { AnaliseDoMl, PADRAO, SeusNumeros } from './analise';
import { Painel, lerNumero } from './painel';

const analise = (over: Partial<AnaliseDoMl> = {}): AnaliseDoMl => ({
  item: {
    id: 'MLB1',
    title: 'Furadeira',
    price: 300,
    listingTypeId: 'gold_special',
    freeShipping: true,
  },
  comissoes: [
    { listingTypeId: 'gold_special', percentageFee: 0.1332, fixedFee: 6, saleFeeAmount: 45.96 },
  ],
  freteEstimado: 23.25,
  ...over,
});

function montar(over: {
  analise?: AnaliseDoMl | null;
  motivo?: 'sem_sessao' | 'sem_conta' | 'falhou';
  seus?: Partial<SeusNumeros>;
  preco?: number;
  titulo?: string;
} = {}) {
  const painel = new Painel({
    pagina: {
      itemId: 'MLB1',
      titulo: over.titulo ?? 'Furadeira Bosch GSB 450',
      preco: over.preco ?? 300,
    },
    analise: over.analise === undefined ? analise() : over.analise,
    motivo: over.motivo,
    seus: { ...PADRAO, custoProduto: 100, freteManual: 0, ...over.seus },
  });

  // O shadow root é fechado, então o teste chega nele pelo mesmo caminho que o
  // painel usa internamente: o elemento hospedeiro no documento.
  const host = document.getElementById('lucrato-painel')!;
  return { painel, host };
}

/** O shadow é fechado de propósito; o teste lê o que o painel expõe. */
function raiz(painel: Painel): ShadowRoot {
  return (painel as unknown as { raiz: ShadowRoot }).raiz;
}

const texto = (painel: Painel): string => raiz(painel).textContent ?? '';

afterEach(() => {
  document.getElementById('lucrato-painel')?.remove();
});

describe('numero digitado em portugues', () => {
  it('aceita virgula, que e como se digita aqui', () => {
    // Com `type="number"` o navegador descartaria "7,5" e o custo viraria zero
    // sem aviso nenhum — por isso os campos são de texto.
    expect(lerNumero('7,5')).toBeCloseTo(7.5, 10);
    expect(lerNumero('1.234,56')).toBeCloseTo(1234.56, 10);
  });

  it('aceita o ponto do teclado numerico quando nao ha virgula', () => {
    expect(lerNumero('7.5')).toBeCloseTo(7.5, 10);
    expect(lerNumero('350')).toBeCloseTo(350, 10);
  });

  it('vazio e null, nao zero', () => {
    // No frete, "vazio" significa usar o estimado; zero é retirada em mãos.
    expect(lerNumero('')).toBeNull();
    expect(lerNumero('   ')).toBeNull();
    expect(lerNumero('0')).toBe(0);
  });

  it('lixo e negativo nao viram numero', () => {
    expect(lerNumero('abc')).toBeNull();
    expect(lerNumero('-5')).toBeNull();
  });
});

describe('o painel se instala sem invadir a pagina', () => {
  it('todo o conteudo fica dentro de um shadow root', () => {
    const { painel, host } = montar();
    // Sem shadow, o CSS do Mercado Livre entraria e o nosso vazaria.
    expect(raiz(painel)).toBeTruthy();
    expect(host.innerHTML).toBe('');
    painel.destruir();
  });

  it('fechar remove o elemento da pagina', () => {
    const { painel } = montar();
    raiz(painel).querySelector<HTMLButtonElement>('.fechar')!.click();
    expect(document.getElementById('lucrato-painel')).toBeNull();
    painel.destruir();
  });
});

describe('o titulo vem de um terceiro e nunca entra como HTML', () => {
  it('marcacao no titulo do anuncio nao vira elemento', () => {
    const { painel } = montar({ titulo: '<img src=x onerror="alert(1)">Furadeira' });
    expect(raiz(painel).querySelector('img')).toBeNull();
    expect(texto(painel)).toContain('Furadeira');
    painel.destruir();
  });

  it('aspas no titulo nao quebram o atributo do campo', () => {
    const { painel } = montar({ titulo: 'Furadeira "Bosch" 1/2"' });
    expect(raiz(painel).querySelectorAll('input')).toHaveLength(4);
    painel.destruir();
  });
});

describe('os numeros na tela', () => {
  it('mostra o lucro calculado pelo motor do app', () => {
    // 300 − 13,32% − 6 de taxa fixa = 254,04; menos 100 de custo = 154,04.
    const { painel } = montar();
    expect(texto(painel)).toContain('154,04');
    painel.destruir();
  });

  it('prejuizo aparece marcado como prejuizo, nao so com sinal', () => {
    const { painel } = montar({ seus: { custoProduto: 400 } });
    expect(raiz(painel).querySelector('.valor')?.classList.contains('prejuizo')).toBe(true);
    painel.destruir();
  });

  it('lucro positivo nao usa a classe de prejuizo', () => {
    const { painel } = montar();
    expect(raiz(painel).querySelector('.valor')?.classList.contains('lucro')).toBe(true);
    painel.destruir();
  });
});

describe('diz quando esta estimando', () => {
  it('sem sessao, avisa que a comissao e estimada e como resolver', () => {
    const { painel } = montar({ analise: null, motivo: 'sem_sessao' });
    const t = texto(painel);
    expect(t).toContain('estimada');
    expect(t).toContain('Abra o Lucrato');
    painel.destruir();
  });

  it('sem conta do Mercado Livre ligada, o recado e outro', () => {
    const { painel } = montar({ analise: null, motivo: 'sem_conta' });
    expect(texto(painel)).toContain('Conecte sua conta');
    painel.destruir();
  });

  it('com a comissao real, nao ha aviso de estimativa', () => {
    const { painel } = montar();
    expect(raiz(painel).querySelector('.alerta')).toBeNull();
    painel.destruir();
  });

  it('preco ilegivel na pagina e dito, nao escondido', () => {
    const { painel } = montar({ preco: 0, analise: null });
    expect(texto(painel)).toContain('Não deu para ler o preço');
    painel.destruir();
  });
});

describe('editar os numeros', () => {
  it('mudar o custo recalcula sem refazer a tela', () => {
    const { painel } = montar();
    const raizP = raiz(painel);
    const custo = raizP.querySelector<HTMLInputElement>('input[name="custoProduto"]')!;

    custo.value = '200';
    custo.dispatchEvent(new Event('input'));

    // 254,04 − 200 = 54,04.
    expect(raizP.querySelector('.valor')?.textContent).toContain('54,04');
    // O mesmo campo continua na tela: redesenhar tudo tiraria o foco.
    expect(raizP.querySelector('input[name="custoProduto"]')).toBe(custo);
    painel.destruir();
  });

  it('avisa quem hospeda para persistir o que voce digitou', () => {
    const { painel } = montar();
    const mudancas: SeusNumeros[] = [];
    painel.onMudanca(s => mudancas.push(s));

    const extras = raiz(painel).querySelector<HTMLInputElement>('input[name="custosExtras"]')!;
    extras.value = '7,5';
    extras.dispatchEvent(new Event('input'));

    // Vírgula é como se digita em português; virar NaN zeraria o custo.
    expect(mudancas.at(-1)?.custosExtras).toBeCloseTo(7.5, 10);
    painel.destruir();
  });

  it('frete apagado volta a usar o estimado, e nao vira zero', () => {
    const { painel } = montar({ seus: { freteManual: 10 } });
    const raizP = raiz(painel);
    const frete = raizP.querySelector<HTMLInputElement>('input[name="freteManual"]')!;

    frete.value = '';
    frete.dispatchEvent(new Event('input'));

    // Estimado de 23,25: 254,04 − 23,25 − 100 = 130,79.
    expect(raizP.querySelector('.valor')?.textContent).toContain('130,79');
    painel.destruir();
  });
});
