/**
 * Leitura da página do anúncio.
 *
 * O HTML do Mercado Livre muda sem aviso, então o que estes testes travam é o
 * comportamento na falha: quando o seletor não casa mais, o painel tem de
 * devolver zero e pedir o preço, nunca inventar um.
 */
import { lerPagina, lerPreco, lerTitulo, precoBr } from './page';

function pagina(html: string): Document {
  return new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
}

describe('preco escrito como o Brasil escreve', () => {
  it('ponto e separador de milhar, virgula e decimal', () => {
    // `parseFloat('1.234,56')` daria 1.234 — erro de mil vezes.
    expect(precoBr('1.234,56')).toBeCloseTo(1234.56, 10);
    expect(precoBr('R$ 12.999,90')).toBeCloseTo(12999.9, 10);
    expect(precoBr('89,90')).toBeCloseTo(89.9, 10);
    expect(precoBr('350')).toBeCloseTo(350, 10);
  });

  it('milhao nao vira mil', () => {
    expect(precoBr('1.234.567,89')).toBeCloseTo(1234567.89, 10);
  });

  it('texto sem numero vira zero', () => {
    expect(precoBr('')).toBe(0);
    expect(precoBr('Consulte')).toBe(0);
    expect(precoBr('R$')).toBe(0);
  });
});

describe('preco da pagina', () => {
  it('prefere o dado estruturado', () => {
    const doc = pagina(`
      <meta itemprop="price" content="1799.90">
      <div class="ui-pdp-price__second-line">
        <span class="andes-money-amount__fraction">1</span>
      </div>
    `);
    expect(lerPreco(doc)).toBeCloseTo(1799.9, 10);
  });

  it('cai para o bloco visivel juntando reais e centavos', () => {
    const doc = pagina(`
      <div class="ui-pdp-price__second-line">
        <span class="andes-money-amount__fraction">1.799</span>
        <span class="andes-money-amount__cents">90</span>
      </div>
    `);
    expect(lerPreco(doc)).toBeCloseTo(1799.9, 10);
  });

  it('preco redondo, sem centavos na marcacao', () => {
    const doc = pagina(`
      <div class="ui-pdp-price__second-line">
        <span class="andes-money-amount__fraction">350</span>
      </div>
    `);
    expect(lerPreco(doc)).toBeCloseTo(350, 10);
  });

  it('seletor que deixou de existir devolve zero, nao um chute', () => {
    expect(lerPreco(pagina('<div class="algo-novo">R$ 350</div>'))).toBe(0);
  });

  it('meta invalida nao envenena a leitura', () => {
    const doc = pagina(`
      <meta itemprop="price" content="">
      <div class="ui-pdp-price__second-line">
        <span class="andes-money-amount__fraction">99</span>
      </div>
    `);
    expect(lerPreco(doc)).toBeCloseTo(99, 10);
  });
});

describe('titulo', () => {
  it('vem do dado estruturado quando existe', () => {
    expect(lerTitulo(pagina('<meta itemprop="name" content="Furadeira Bosch"><h1>Outro</h1>')))
      .toBe('Furadeira Bosch');
  });

  it('cai para o h1 do anuncio', () => {
    expect(lerTitulo(pagina('<h1 class="ui-pdp-title">Furadeira Bosch</h1>')))
      .toBe('Furadeira Bosch');
  });
});

describe('pagina inteira', () => {
  const html = `
    <meta itemprop="name" content="Furadeira Bosch GSB 450">
    <meta itemprop="price" content="289.90">
  `;

  it('o id vem da URL, que e o unico lugar estavel', () => {
    const d = lerPagina(pagina(html), 'https://produto.mercadolivre.com.br/MLB-4931831037-furadeira-_JM');
    expect(d.itemId).toBe('MLB4931831037');
    expect(d.titulo).toBe('Furadeira Bosch GSB 450');
    expect(d.preco).toBeCloseTo(289.9, 10);
  });

  it('pagina que nao e de anuncio nao vira analise vazia com preco', () => {
    // Sem isso o painel apareceria na busca e no carrinho, medindo nada.
    const d = lerPagina(pagina(html), 'https://www.mercadolivre.com.br/ofertas');
    expect(d).toEqual({ itemId: '', titulo: '', preco: 0 });
  });
});
