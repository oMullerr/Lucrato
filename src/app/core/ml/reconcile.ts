/**
 * Conciliação entre o que veio do Mercado Livre e o que já foi lançado à mão.
 *
 * O backfill traz até 12 meses de pedidos. Boa parte deles você já digitou —
 * aplicar tudo sem conferir duplicaria faturamento, estoque e, pior, o teto do
 * MEI. Este módulo decide o que é venda nova e o que precisa da sua decisão.
 *
 * Puro de propósito: a mesma função classifica na tela e decide o que pode ser
 * lançado sozinho, então a tela nunca discorda do que o sistema vai fazer.
 */
import type { Sale } from '../models/models';
import { similaridade } from './matching';
import type { ItemDaCaixa } from './inbox-apply';

/**
 * - `nova`        nada parecido no razão; pode entrar sozinha
 * - `duplicada`   quase certamente já foi lançada à mão
 * - `conflitante` parecida, mas com divergência que só você resolve
 */
export type Veredito = 'nova' | 'duplicada' | 'conflitante';

/** Por que uma venda manual foi apontada como parecida. */
export type Indicio = 'data' | 'valor' | 'produto';

export interface Candidata {
  venda: Sale;
  indicios: Indicio[];
  /** Semelhança do nome do produto, de 0 a 1. */
  semelhanca: number;
}

export interface Classificacao {
  externalId: string;
  veredito: Veredito;
  /** Venda manual mais parecida, quando existe alguma. */
  candidata?: Candidata;
}

/** Janela de dias em que duas vendas ainda são consideradas a mesma. */
export const JANELA_DIAS = 3;
/** Diferença de valor tolerada: 1% ou um real, o que for maior. */
export const TOLERANCIA_VALOR = 0.01;
/** Abaixo disso, os nomes não são do mesmo produto. */
export const LIMIAR_PRODUTO = 0.55;

function diasEntre(a: string, b: string): number {
  const da = Date.parse(`${a}T00:00:00Z`);
  const dbb = Date.parse(`${b}T00:00:00Z`);
  if (isNaN(da) || isNaN(dbb)) return Number.POSITIVE_INFINITY;
  return Math.abs(da - dbb) / 86_400_000;
}

function valoresBatem(a: number, b: number): boolean {
  const folga = Math.max(1, Math.abs(a) * TOLERANCIA_VALOR);
  return Math.abs(a - b) <= folga;
}

/** Vendas que podem ter sido digitadas à mão para este pedido. */
function candidatasPossiveis(item: ItemDaCaixa, vendas: readonly Sale[]): Sale[] {
  return vendas.filter(v => {
    // Venda que já veio da integração não é candidata a duplicata de si mesma.
    if (v.externalId) return false;
    if (v.status === 'Cancelada') return false;
    return diasEntre(v.saleDate, item.saleDate) <= JANELA_DIAS;
  });
}

/**
 * Classifica um item da caixa contra o razão.
 *
 * Regra: os três indícios (data, valor e produto) fazem uma duplicata; dois
 * fazem um conflito, que pede decisão; menos que isso é venda nova.
 */
export function classificarItem(item: ItemDaCaixa, vendas: readonly Sale[]): Classificacao {
  const bruto = item.unitPrice * item.quantitySold;
  let melhor: Candidata | undefined;

  for (const venda of candidatasPossiveis(item, vendas)) {
    const indicios: Indicio[] = ['data'];
    if (valoresBatem(venda.unitPrice * venda.quantitySold, bruto)) indicios.push('valor');

    const semelhanca = similaridade(venda.product, item.produto);
    if (semelhanca >= LIMIAR_PRODUTO) indicios.push('produto');

    if (indicios.length < 2) continue;
    if (!melhor || indicios.length > melhor.indicios.length || semelhanca > melhor.semelhanca) {
      melhor = { venda, indicios, semelhanca };
    }
  }

  if (!melhor) return { externalId: item.externalId, veredito: 'nova' };

  return {
    externalId: item.externalId,
    veredito: melhor.indicios.length === 3 ? 'duplicada' : 'conflitante',
    candidata: melhor,
  };
}

/**
 * Classifica a caixa inteira de uma vez.
 *
 * Depois de classificar item a item, rebaixa para "conflitante" toda duplicada
 * que disputa a MESMA venda com outra.
 *
 * O motivo é concreto: quando dois pedidos do Mercado Livre casam com uma única
 * venda sua — mesmo produto, mesmo preço, dias seguidos —, o mais provável é que
 * você tenha vendido duas vezes e lançado uma. Tratar os dois como duplicada
 * faria o segundo ser gravado por cima do primeiro, e uma venda real sumiria do
 * razão sem aviso nenhum. Encontrado na base real: 9 vendas disputadas por 18
 * pedidos.
 *
 * Conflitante é exatamente o balde certo: casou em parte, precisa do seu olho, e
 * não recebe adoção em lote.
 */
export function classificarCaixa(
  itens: readonly ItemDaCaixa[],
  vendas: readonly Sale[],
): Map<string, Classificacao> {
  const mapa = new Map<string, Classificacao>();
  for (const item of itens) mapa.set(item.externalId, classificarItem(item, vendas));

  const disputantes = new Map<string, string[]>();
  for (const [externalId, c] of mapa) {
    if (c.veredito !== 'duplicada' || !c.candidata) continue;
    const vendaId = c.candidata.venda.id;
    disputantes.set(vendaId, [...(disputantes.get(vendaId) ?? []), externalId]);
  }

  for (const ids of disputantes.values()) {
    if (ids.length < 2) continue;
    for (const externalId of ids) {
      mapa.set(externalId, { ...mapa.get(externalId)!, veredito: 'conflitante' });
    }
  }

  return mapa;
}

/**
 * Aplica os números reais do Mercado Livre sobre uma venda lançada à mão.
 *
 * Preserva o que é seu — id, lote, produto e observações — e substitui o que a
 * plataforma sabe melhor: comissão, frete, desconto, estorno e situação. Passa
 * a carregar o `externalId`, então nunca mais vira duplicata.
 */
export function adotarNumerosDoMl(venda: Sale, item: ItemDaCaixa): Sale {
  return {
    ...venda,
    unitPrice: item.unitPrice,
    quantitySold: item.quantitySold,
    saleDate: item.saleDate,
    channel: 'Mercado Livre',
    feePercentage: item.feePercentage,
    shippingType: item.shippingType,
    sellerShipping: item.sellerShipping,
    flexRefund: item.flexRefund,
    estorno: item.estorno,
    discount: item.discount,
    status: item.status,
    source: 'mercadolivre',
    externalId: item.externalId,
    mlOrderId: item.mlOrderId,
    mlItemId: item.mlItemId,
    ...(item.mlVariationId ? { mlVariationId: item.mlVariationId } : {}),
    ...(item.mlPackId ? { mlPackId: item.mlPackId } : {}),
    ...(item.mlShipmentId ? { mlShipmentId: item.mlShipmentId } : {}),
  };
}
