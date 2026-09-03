/**
 * Converte um pedido do Mercado Livre em rascunhos de venda do Lucrato.
 *
 * Módulo puro, compartilhado com as Cloud Functions (ver `functions/tsconfig.json`).
 * É aqui que mora a regra de dinheiro da ingestão, então cada decisão está
 * comentada: quando um número sai errado daqui, ele sai errado no lucro.
 *
 * O que este módulo NÃO faz: escolher o lote. Isso depende do estoque no
 * momento da aplicação e fica no cliente, junto do resto do motor de cálculo.
 */
import type { SaleStatus } from '../models/models';

/** Item do pedido, já achatado a partir da resposta da API. */
export interface MlOrderItem {
  itemId: string;
  variationId: string | null;
  title: string;
  sellerSku: string | null;
  quantity: number;
  /** Preço unitário efetivamente cobrado. */
  unitPrice: number;
  /** Preço unitário antes do desconto do vendedor, quando houver. */
  fullUnitPrice: number | null;
  /** Comissão real cobrada pelo Mercado Livre neste item. */
  saleFee: number;
  listingTypeId: string;
}

export interface MlOrderPayment {
  totalPaid: number;
  refunded: number;
  status: string;
}

/** Pedido normalizado, do jeito que o mapeamento precisa. */
export interface MlOrderNormalizada {
  orderId: string;
  packId: string | null;
  shipmentId: string | null;
  /** `paid`, `cancelled`, `confirmed`… */
  status: string;
  tags: string[];
  /** Pedido em mediação vira venda "Em disputa". */
  hasMediations: boolean;
  dateClosed: string | null;
  dateCreated: string;
  items: MlOrderItem[];
  payments: MlOrderPayment[];
  /**
   * Custo de envio do VENDEDOR neste pedido (`senders[].cost` de
   * `/shipments/{id}/costs`), já rateado quando o carrinho tem vários pedidos.
   * Negativo significa crédito a favor do vendedor.
   */
  shippingCostSeller: number;
  /** `self_service` é Flex; o resto é frete comum. */
  logisticType: string;
}

/** Rascunho de venda: tudo pronto, menos o lote. */
export interface RascunhoVenda {
  /** Chave de idempotência: `orderId:itemId[:variationId]`. */
  externalId: string;
  mlOrderId: string;
  mlItemId: string;
  mlVariationId?: string;
  mlPackId?: string;
  mlShipmentId?: string;
  /** Título do anúncio; quem tiver vínculo troca pelo nome do produto. */
  product: string;
  sellerSku: string | null;
  quantitySold: number;
  unitPrice: number;
  saleDate: string;
  feePercentage: number;
  shippingType: 'correios' | 'flex';
  sellerShipping: number;
  flexRefund?: number;
  discount: number;
  estorno?: number;
  status: SaleStatus;
  notes: string;
}

/** Fuso do vendedor. O Mercado Livre devolve o horário com offset próprio. */
export const FUSO_VENDEDOR = 'America/Sao_Paulo';

/**
 * Dia de calendário do vendedor, no formato que o Lucrato guarda.
 *
 * Converter pelo fuso importa: um pedido fechado às 23h no Brasil chega da API
 * com offset -04:00 e, lido cru, cairia no dia seguinte.
 */
export function diaLocalDeISO(iso: string, timeZone = FUSO_VENDEDOR): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
  return partes; // en-CA já formata como YYYY-MM-DD
}

/** Comissão como fração do bruto do item, que é como o Lucrato guarda. */
export function fracaoDaComissao(saleFee: number, unitPrice: number, quantity: number): number {
  const bruto = unitPrice * quantity;
  if (bruto <= 0) return 0;
  return saleFee / bruto;
}

/**
 * Situação da venda.
 *
 * `Devolvida` não sai daqui: devolução é entidade própria no Lucrato e chega
 * pelo fluxo de reclamações.
 */
export function situacaoDaVenda(order: Pick<MlOrderNormalizada, 'status' | 'hasMediations'>): SaleStatus {
  if (order.status === 'cancelled') return 'Cancelada';
  if (order.hasMediations) return 'Em disputa';
  return 'Concluída';
}

/** Rateio proporcional ao valor de cada item, para o frete não pesar tudo no primeiro. */
function ratearFrete(total: number, itens: readonly MlOrderItem[]): number[] {
  const valores = itens.map((i) => i.unitPrice * i.quantity);
  const soma = valores.reduce((a, b) => a + b, 0);
  if (soma <= 0) return itens.map(() => (itens.length ? total / itens.length : 0));

  // Distribui e joga a sobra de centavos no último, para fechar a conta exata.
  const partes = valores.map((v) => Math.round((total * v * 100) / soma) / 100);
  const distribuido = partes.reduce((a, b) => a + b, 0);
  const sobra = Math.round((total - distribuido) * 100) / 100;
  if (partes.length) partes[partes.length - 1] = Math.round((partes[partes.length - 1] + sobra) * 100) / 100;
  return partes;
}

/** Desconto bancado pelo vendedor neste item, quando o preço cheio veio na API. */
function descontoDoItem(item: MlOrderItem): number {
  if (item.fullUnitPrice === null) return 0;
  const diferenca = item.fullUnitPrice - item.unitPrice;
  return diferenca > 0 ? Math.round(diferenca * item.quantity * 100) / 100 : 0;
}

/**
 * Um rascunho por item do pedido.
 *
 * **Frete no Flex fica de fora.** Pedidos `self_service` chegam com
 * `senders[].cost` positivo (8,01 na conta de teste), mas esse valor não é
 * pago ao Mercado Livre: no Flex o vendedor contrata a própria transportadora,
 * e o custo real é outro. Importar o número do ML aqui poria no lucro uma
 * despesa que não existe, então ele é ignorado e a venda fica marcada como
 * Flex para o custo da transportadora ser lançado à parte.
 *
 * Fora do Flex, o frete segue o **sinal do dinheiro**, que é o que o motor do
 * Lucrato entende: valor a pagar vira custo (`correios`), valor a receber vira
 * estorno (`flex`).
 */
export function mapearPedido(order: MlOrderNormalizada): RascunhoVenda[] {
  const data = diaLocalDeISO(order.dateClosed || order.dateCreated);
  const status = situacaoDaVenda(order);
  const ehFlex = order.logisticType === 'self_service';
  const fretes = ratearFrete(order.shippingCostSeller, order.items);

  const estornoTotal = order.payments.reduce((soma, p) => soma + (p.refunded || 0), 0);
  const estornos = ratearFrete(estornoTotal, order.items);

  return order.items.map((item, i) => {
    const frete = fretes[i] ?? 0;
    const custoFrete = frete > 0 ? frete : 0;
    const creditoFrete = frete < 0 ? Math.abs(frete) : 0;
    const estorno = estornos[i] ?? 0;
    // Fora do Flex, crédito (custo negativo) é o que o Lucrato trata como 'flex'.
    const ehCredito = !ehFlex && creditoFrete > 0;

    return {
      externalId: [order.orderId, item.itemId, item.variationId].filter(Boolean).join(':'),
      mlOrderId: order.orderId,
      mlItemId: item.itemId,
      ...(item.variationId ? { mlVariationId: item.variationId } : {}),
      ...(order.packId ? { mlPackId: order.packId } : {}),
      ...(order.shipmentId ? { mlShipmentId: order.shipmentId } : {}),
      product: item.title,
      sellerSku: item.sellerSku,
      quantitySold: item.quantity,
      unitPrice: item.unitPrice,
      saleDate: data,
      feePercentage: fracaoDaComissao(item.saleFee, item.unitPrice, item.quantity),
      shippingType: ehFlex || ehCredito ? 'flex' : 'correios',
      sellerShipping: ehFlex || ehCredito ? 0 : custoFrete,
      ...(ehFlex || ehCredito ? { flexRefund: ehFlex ? 0 : creditoFrete } : {}),
      discount: descontoDoItem(item),
      ...(estorno > 0 ? { estorno: Math.round(estorno * 100) / 100 } : {}),
      status,
      notes: ehFlex
        ? `Mercado Livre · pedido ${order.orderId} · envio Flex (frete da transportadora à parte)`
        : `Mercado Livre · pedido ${order.orderId}`,
    };
  });
}
