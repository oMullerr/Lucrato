/**
 * Calculadora de análise: vale a pena comprar este produto para revender?
 *
 * Módulo puro, sem Angular e sem Firebase — a mesma matemática serve a tela e,
 * mais adiante, a extensão de navegador.
 *
 * A conta é a mesma do motor de vendas (`calculations.ts`), só que olhando para
 * frente em vez de para trás: lá os números vêm de uma venda que aconteceu,
 * aqui de uma que você está considerando. Há um spec de paridade provando que
 * os dois chegam ao mesmo lucro para o mesmo cenário — se divergirem, a
 * simulação estaria mentindo sobre o que o painel vai mostrar depois.
 */

/** Tudo por unidade, exceto `quantidade`. */
export interface EntradaCalculo {
  precoVenda: number;
  custoProduto: number;
  /** Embalagem, etiqueta, o que mais sair do seu bolso por unidade. */
  custosExtras: number;
  /** Fração: 0.06 para 6%. */
  impostoPct: number;
  /** Fração: 0.12 para 12%. Comissão do marketplace. */
  comissaoPct: number;
  /** Custo fixo por unidade vendida, cobrado pelo marketplace. */
  taxaFixa: number;
  /** Frete pago por você em cada unidade. */
  frete: number;
  quantidade: number;
}

export interface ResultadoCalculo {
  receitaBruta: number;
  comissao: number;
  taxaFixaTotal: number;
  freteTotal: number;
  imposto: number;
  /** O que o marketplace deposita: preço menos comissão, taxa fixa e frete. */
  valorRecebido: number;
  custoTotal: number;
  lucroLiquido: number;
  /** Lucro sobre a receita bruta. */
  margemContribuicao: number;
  /** Lucro sobre o que você investiu. Zero quando não há custo informado. */
  roi: number;
  /** Preço dividido pelo custo unitário. Zero quando não há custo. */
  markup: number;
  /** Lucro de uma única unidade. */
  lucroUnitario: number;
}

const ZERO: ResultadoCalculo = {
  receitaBruta: 0,
  comissao: 0,
  taxaFixaTotal: 0,
  freteTotal: 0,
  imposto: 0,
  valorRecebido: 0,
  custoTotal: 0,
  lucroLiquido: 0,
  margemContribuicao: 0,
  roi: 0,
  markup: 0,
  lucroUnitario: 0,
};

const naoNegativo = (v: number): number => (isFinite(v) && v > 0 ? v : 0);

/** Roda a análise. Entradas inválidas viram zero em vez de NaN na tela. */
export function calcular(entrada: EntradaCalculo): ResultadoCalculo {
  const quantidade = Math.max(0, Math.floor(entrada.quantidade || 0));
  const preco = naoNegativo(entrada.precoVenda);
  if (quantidade === 0 || preco === 0) return ZERO;

  const comissaoPct = naoNegativo(entrada.comissaoPct);
  const impostoPct = naoNegativo(entrada.impostoPct);
  const taxaFixa = naoNegativo(entrada.taxaFixa);
  const frete = naoNegativo(entrada.frete);
  const custoUnitario = naoNegativo(entrada.custoProduto) + naoNegativo(entrada.custosExtras);

  const comissaoUnit = preco * comissaoPct;
  const impostoUnit = preco * impostoPct;
  const recebidoUnit = preco - comissaoUnit - taxaFixa - frete;
  const lucroUnitario = recebidoUnit - impostoUnit - custoUnitario;

  const receitaBruta = preco * quantidade;
  const custoTotal = custoUnitario * quantidade;
  const lucroLiquido = lucroUnitario * quantidade;

  return {
    receitaBruta,
    comissao: comissaoUnit * quantidade,
    taxaFixaTotal: taxaFixa * quantidade,
    freteTotal: frete * quantidade,
    imposto: impostoUnit * quantidade,
    valorRecebido: recebidoUnit * quantidade,
    custoTotal,
    lucroLiquido,
    margemContribuicao: receitaBruta > 0 ? lucroLiquido / receitaBruta : 0,
    roi: custoTotal > 0 ? lucroLiquido / custoTotal : 0,
    markup: custoUnitario > 0 ? preco / custoUnitario : 0,
    lucroUnitario,
  };
}

/**
 * Preço em que a venda empata: nem lucro, nem prejuízo.
 *
 * `P(1 − comissão − imposto) = custo + taxa fixa + frete`
 *
 * Devolve `null` quando comissão e imposto somam 100% ou mais — aí não existe
 * preço que feche a conta, e mostrar um número seria mentira.
 */
export function precoDeEquilibrio(entrada: EntradaCalculo): number | null {
  const sobra = 1 - naoNegativo(entrada.comissaoPct) - naoNegativo(entrada.impostoPct);
  if (sobra <= 0) return null;

  const fixos =
    naoNegativo(entrada.custoProduto) +
    naoNegativo(entrada.custosExtras) +
    naoNegativo(entrada.taxaFixa) +
    naoNegativo(entrada.frete);

  return fixos / sobra;
}

/**
 * Preço necessário para atingir uma margem de contribuição.
 *
 * `P(1 − comissão − imposto − margem) = custo + taxa fixa + frete`
 *
 * Devolve `null` quando a margem pedida não cabe no que sobra depois das taxas.
 */
export function precoParaMargem(entrada: EntradaCalculo, margemAlvo: number): number | null {
  const sobra =
    1 - naoNegativo(entrada.comissaoPct) - naoNegativo(entrada.impostoPct) - naoNegativo(margemAlvo);
  if (sobra <= 0) return null;

  const fixos =
    naoNegativo(entrada.custoProduto) +
    naoNegativo(entrada.custosExtras) +
    naoNegativo(entrada.taxaFixa) +
    naoNegativo(entrada.frete);

  return fixos / sobra;
}

/**
 * Custo máximo que o produto pode ter para a venda ainda dar a margem desejada.
 * É a pergunta que importa na hora de negociar com o fornecedor.
 */
export function custoMaximo(entrada: EntradaCalculo, margemAlvo: number): number {
  const preco = naoNegativo(entrada.precoVenda);
  if (preco === 0) return 0;

  const sobra =
    preco *
    (1 - naoNegativo(entrada.comissaoPct) - naoNegativo(entrada.impostoPct) - naoNegativo(margemAlvo));
  const descontos = naoNegativo(entrada.taxaFixa) + naoNegativo(entrada.frete) + naoNegativo(entrada.custosExtras);

  return Math.max(0, sobra - descontos);
}
