/**
 * Da página + do Mercado Livre para a entrada do cálculo.
 *
 * Módulo puro, e é aqui que mora a única regra de negócio da extensão: qual
 * comissão usar. A tela do painel só desenha o que sai daqui.
 *
 * A matemática é a de `pricing.ts` — a mesma da página `/calculadora`. Se a
 * extensão tivesse conta própria, ela poderia prometer um lucro que o painel
 * do Lucrato depois não confirmaria.
 */
import type { EntradaCalculo } from '../../src/app/core/pricing/pricing';
import { COMISSAO_PADRAO } from './config';

/** Comissão de um tipo de anúncio, como `mlAnalyze` devolve. */
export interface ComissaoDoTipo {
  listingTypeId: string;
  /** Fração: 0.12 para 12%. */
  percentageFee: number;
  fixedFee: number;
  saleFeeAmount: number;
}

/** Resposta do `mlAnalyze`, no que a extensão usa. */
export interface AnaliseDoMl {
  item?: {
    id: string;
    title: string;
    price: number;
    listingTypeId: string;
    freeShipping: boolean;
  };
  comissoes: ComissaoDoTipo[];
  freteEstimado: number | null;
}

/** O que você digita no painel e a extensão lembra entre um anúncio e outro. */
export interface SeusNumeros {
  custoProduto: number;
  custosExtras: number;
  impostoPct: number;
  quantidade: number;
  /** Frete informado à mão. `null` usa o estimado pelo Mercado Livre. */
  freteManual: number | null;
}

export const PADRAO: SeusNumeros = {
  custoProduto: 0,
  custosExtras: 0,
  impostoPct: 0,
  quantidade: 1,
  freteManual: null,
};

/** De onde veio cada número — o painel precisa dizer isso em vez de fingir precisão. */
export interface Procedencia {
  comissao: 'real' | 'padrao';
  frete: 'estimado' | 'manual' | 'nenhum';
}

export interface Montagem {
  entrada: EntradaCalculo;
  procedencia: Procedencia;
}

const naoNegativo = (v: unknown): number => {
  const n = Number(v);
  return isFinite(n) && n > 0 ? n : 0;
};

/**
 * Escolhe a comissão do tipo de anúncio que o produto realmente usa.
 *
 * Clássico e Premium cobram percentuais diferentes, então usar o primeiro da
 * lista daria o número do anúncio errado. Sem correspondência, cai no padrão
 * do app — e a procedência diz que é estimativa.
 */
export function comissaoDe(
  analise: AnaliseDoMl | null,
  tipoPreferido?: string,
): { percentual: number; taxaFixa: number; origem: Procedencia['comissao'] } {
  const tipo = tipoPreferido || analise?.item?.listingTypeId || '';
  const lista = analise?.comissoes ?? [];
  const escolhida = lista.find(c => c.listingTypeId === tipo) ?? lista[0];

  if (!escolhida || !isFinite(escolhida.percentageFee) || escolhida.percentageFee <= 0) {
    return { percentual: COMISSAO_PADRAO, taxaFixa: 0, origem: 'padrao' };
  }

  return {
    percentual: escolhida.percentageFee,
    taxaFixa: naoNegativo(escolhida.fixedFee),
    origem: 'real',
  };
}

/**
 * Monta a entrada do cálculo.
 *
 * O preço da página vale mais que o do `mlAnalyze`: quem está olhando o anúncio
 * vê o preço da página, e divergir dele faria o painel parecer quebrado. O
 * preço da API só entra quando a leitura da página falhou.
 */
export function montarEntrada(
  precoDaPagina: number,
  analise: AnaliseDoMl | null,
  seus: SeusNumeros,
  tipoPreferido?: string,
): Montagem {
  const preco = naoNegativo(precoDaPagina) || naoNegativo(analise?.item?.price);
  const { percentual, taxaFixa, origem } = comissaoDe(analise, tipoPreferido);

  const estimado = analise?.freteEstimado;
  const frete =
    seus.freteManual !== null && seus.freteManual >= 0
      ? seus.freteManual
      : naoNegativo(estimado);

  const origemDoFrete: Procedencia['frete'] =
    seus.freteManual !== null && seus.freteManual >= 0
      ? 'manual'
      : naoNegativo(estimado) > 0
        ? 'estimado'
        : 'nenhum';

  return {
    entrada: {
      precoVenda: preco,
      custoProduto: naoNegativo(seus.custoProduto),
      custosExtras: naoNegativo(seus.custosExtras),
      impostoPct: naoNegativo(seus.impostoPct),
      comissaoPct: percentual,
      taxaFixa,
      frete,
      quantidade: Math.max(1, Math.floor(seus.quantidade || 1)),
    },
    procedencia: { comissao: origem, frete: origemDoFrete },
  };
}
