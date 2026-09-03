/**
 * Motor da calculadora.
 *
 * Dois compromissos são travados aqui:
 *   1. os números da referência (a calculadora do Hunter Spy, que o usuário
 *      mandou como alvo) batem exatamente;
 *   2. a simulação concorda com o motor de vendas do app — se divergissem, a
 *      calculadora estaria prometendo um lucro que o painel não confirmaria.
 */
import {
  EntradaCalculo,
  calcular,
  custoMaximo,
  precoDeEquilibrio,
  precoParaMargem,
} from './pricing';
import { calculateSale } from '../services/calculations';
import { makePurchase, makeSale } from '../../../testing/fixtures';

function entrada(over: Partial<EntradaCalculo> = {}): EntradaCalculo {
  return {
    precoVenda: 365,
    custoProduto: 0,
    custosExtras: 0,
    impostoPct: 0,
    comissaoPct: 0.12,
    taxaFixa: 0,
    frete: 23.25,
    quantidade: 1,
    ...over,
  };
}

describe('cenario da referencia', () => {
  // Escova Oral-B iO2: preço 365, comissão 12% (43,80), frete 23,25.
  const r = calcular(entrada());

  it('valor recebido bate com a referencia', () => {
    expect(r.valorRecebido).toBeCloseTo(365 - 43.8 - 23.25, 2);
    expect(r.valorRecebido).toBeCloseTo(297.95, 2);
  });

  it('comissao bate com a referencia', () => {
    expect(r.comissao).toBeCloseTo(43.8, 2);
  });

  it('margem de contribuicao bate com a referencia', () => {
    expect(r.margemContribuicao).toBeCloseTo(297.95 / 365, 4);
    expect(r.margemContribuicao * 100).toBeCloseTo(81.63, 1);
  });

  it('sem custo informado, ROI e zero em vez de infinito', () => {
    expect(r.roi).toBe(0);
    expect(r.markup).toBe(0);
  });
});

describe('com custo e imposto', () => {
  const r = calcular(entrada({ custoProduto: 120, custosExtras: 5, impostoPct: 0.06 }));

  it('desconta imposto sobre o preco, nao sobre o recebido', () => {
    expect(r.imposto).toBeCloseTo(365 * 0.06, 2);
  });

  it('lucro desconta comissao, frete, imposto e custo', () => {
    expect(r.lucroLiquido).toBeCloseTo(365 - 43.8 - 23.25 - 21.9 - 125, 2);
  });

  it('ROI e sobre o que foi investido', () => {
    expect(r.roi).toBeCloseTo(r.lucroLiquido / 125, 6);
  });

  it('markup e preco sobre custo unitario', () => {
    expect(r.markup).toBeCloseTo(365 / 125, 6);
  });
});

describe('quantidade', () => {
  it('multiplica tudo, e a margem nao muda', () => {
    const um = calcular(entrada({ custoProduto: 100 }));
    const dez = calcular(entrada({ custoProduto: 100, quantidade: 10 }));
    expect(dez.lucroLiquido).toBeCloseTo(um.lucroLiquido * 10, 6);
    expect(dez.receitaBruta).toBeCloseTo(um.receitaBruta * 10, 6);
    expect(dez.margemContribuicao).toBeCloseTo(um.margemContribuicao, 10);
  });

  it('quantidade zero zera tudo', () => {
    expect(calcular(entrada({ quantidade: 0 })).lucroLiquido).toBe(0);
  });
});

describe('entradas invalidas nao viram NaN', () => {
  it('preco zero', () => {
    expect(calcular(entrada({ precoVenda: 0 })).lucroLiquido).toBe(0);
  });

  it('numeros negativos sao tratados como zero', () => {
    const r = calcular(entrada({ frete: -50, comissaoPct: -0.5, custoProduto: -10 }));
    expect(r.freteTotal).toBe(0);
    expect(r.comissao).toBe(0);
    expect(r.lucroLiquido).toBeCloseTo(365, 2);
  });

  it('valores nao finitos', () => {
    const r = calcular(entrada({ precoVenda: Number.NaN }));
    expect(r.lucroLiquido).toBe(0);
  });
});

describe('prejuizo aparece como prejuizo', () => {
  it('custo maior que o recebido da lucro negativo', () => {
    const r = calcular(entrada({ custoProduto: 400 }));
    expect(r.lucroLiquido).toBeLessThan(0);
    expect(r.margemContribuicao).toBeLessThan(0);
  });
});

describe('preco de equilibrio', () => {
  it('e o preco em que o lucro zera', () => {
    const base = entrada({ custoProduto: 100, impostoPct: 0.06 });
    const p = precoDeEquilibrio(base)!;
    expect(calcular({ ...base, precoVenda: p }).lucroLiquido).toBeCloseTo(0, 6);
  });

  it('inclui taxa fixa e frete', () => {
    const p = precoDeEquilibrio(entrada({ custoProduto: 0, frete: 20, taxaFixa: 6, comissaoPct: 0 }))!;
    expect(p).toBeCloseTo(26, 6);
  });

  it('sem preco possivel, devolve nulo em vez de numero errado', () => {
    expect(precoDeEquilibrio(entrada({ comissaoPct: 0.7, impostoPct: 0.35 }))).toBeNull();
  });
});

describe('preco para uma margem alvo', () => {
  it('devolve o preco que entrega exatamente a margem', () => {
    const base = entrada({ custoProduto: 100, impostoPct: 0.06 });
    const p = precoParaMargem(base, 0.25)!;
    expect(calcular({ ...base, precoVenda: p }).margemContribuicao).toBeCloseTo(0.25, 6);
  });

  it('margem alta demais nao tem preco possivel', () => {
    expect(precoParaMargem(entrada({ comissaoPct: 0.17 }), 0.9)).toBeNull();
  });

  it('margem zero equivale ao preco de equilibrio', () => {
    const base = entrada({ custoProduto: 100 });
    expect(precoParaMargem(base, 0)).toBeCloseTo(precoDeEquilibrio(base)!, 6);
  });
});

describe('custo maximo para negociar com o fornecedor', () => {
  it('pagando esse custo, a margem sai exata', () => {
    const base = entrada({ impostoPct: 0.06 });
    const custo = custoMaximo(base, 0.3);
    expect(calcular({ ...base, custoProduto: custo }).margemContribuicao).toBeCloseTo(0.3, 6);
  });

  it('nunca devolve custo negativo', () => {
    expect(custoMaximo(entrada({ precoVenda: 10, frete: 50 }), 0.3)).toBe(0);
  });
});

/**
 * Paridade com o motor de vendas: o mesmo cenário, montado como venda de
 * verdade, tem de dar o mesmo lucro. Sem isso, a calculadora prometeria um
 * número que o painel não confirmaria depois.
 */
describe('paridade com calculateSale', () => {
  const cenarios: { nome: string; e: EntradaCalculo }[] = [
    { nome: 'simples', e: entrada({ custoProduto: 120 }) },
    { nome: 'com imposto e taxa fixa', e: entrada({ custoProduto: 120, impostoPct: 0.06, taxaFixa: 6 }) },
    { nome: 'com custos extras', e: entrada({ custoProduto: 120, custosExtras: 4.5 }) },
    { nome: 'quantidade maior', e: entrada({ custoProduto: 120, quantidade: 7 }) },
    { nome: 'prejuizo', e: entrada({ custoProduto: 400 }) },
  ];

  it.each(cenarios)('mesmo lucro no cenario $nome', ({ e }) => {
    const lote = makePurchase({
      id: 'C001',
      quantityPurchased: e.quantidade,
      unitCost: e.custoProduto,
      purchaseShipping: 0,
      otherCosts: e.custosExtras * e.quantidade,
    });
    const venda = makeSale({
      id: 'V001',
      batchId: 'C001',
      quantitySold: e.quantidade,
      unitPrice: e.precoVenda,
      feePercentage: e.comissaoPct,
      shippingType: 'correios',
      sellerShipping: e.frete * e.quantidade,
      discount: 0,
      // O motor de vendas não tem campo de imposto nem de taxa fixa: os dois
      // entram como "outros custos", que é onde eles caem numa venda real.
      otherCosts: (e.taxaFixa + e.precoVenda * e.impostoPct) * e.quantidade,
    });

    const daVenda = calculateSale(venda, [lote], []);
    expect(calcular(e).lucroLiquido).toBeCloseTo(daVenda.netProfit, 6);
  });

  it('margem tambem bate', () => {
    const e = entrada({ custoProduto: 120, impostoPct: 0.06 });
    const lote = makePurchase({ id: 'C001', quantityPurchased: 1, unitCost: 120, purchaseShipping: 0, otherCosts: 0 });
    const venda = makeSale({
      id: 'V001', batchId: 'C001', quantitySold: 1, unitPrice: e.precoVenda,
      feePercentage: e.comissaoPct, shippingType: 'correios', sellerShipping: e.frete,
      discount: 0, otherCosts: e.precoVenda * e.impostoPct,
    });
    expect(calcular(e).margemContribuicao).toBeCloseTo(calculateSale(venda, [lote], []).netMargin, 6);
  });
});
