/**
 * Busca e normalização de um pedido do Mercado Livre.
 *
 * A parte de dinheiro fica em `src/app/core/ml/order-mapping.ts`, compartilhada
 * com o app. Aqui só se resolve o que exige rede: o custo real do envio e, em
 * carrinho, quanto desse custo cabe a cada pedido.
 */
import type {
  MlOrderItem,
  MlOrderNormalizada,
} from '../../../src/app/core/ml/order-mapping';
import { MlClient } from './client';

type Bruto = Record<string, unknown>;

const texto = (v: unknown): string => (typeof v === 'string' ? v : '');
const numero = (v: unknown): number => (typeof v === 'number' && isFinite(v) ? v : 0);

/** Dados do envio que interessam ao cálculo do lucro. */
export interface EnvioResumido {
  /** Soma do que o vendedor paga (`senders[].cost`). Negativo é crédito. */
  custoVendedor: number;
  logisticType: string;
}

/**
 * Custo do envio para o vendedor.
 *
 * `gross_amount` é o valor cheio do frete e NÃO é o que o vendedor paga —
 * usar ele aqui inflaria o custo de toda venda com frete subsidiado.
 */
export async function buscarEnvio(cliente: MlClient, shipmentId: string): Promise<EnvioResumido> {
  const [custos, envio] = await Promise.all([
    cliente
      .get<Bruto>(`/shipments/${shipmentId}/costs`)
      .catch(() => ({}) as Bruto),
    cliente.get<Bruto>(`/shipments/${shipmentId}`).catch(() => ({}) as Bruto),
  ]);

  const senders = Array.isArray(custos['senders']) ? (custos['senders'] as Bruto[]) : [];
  const custoVendedor = senders.reduce((soma, s) => soma + numero(s['cost']), 0);

  return { custoVendedor, logisticType: texto(envio['logistic_type']) };
}

/** Achata os itens do pedido no formato do mapeamento. */
export function itensDoPedido(raw: Bruto): MlOrderItem[] {
  const brutos = Array.isArray(raw['order_items']) ? (raw['order_items'] as Bruto[]) : [];

  return brutos.map((oi) => {
    const item = (oi['item'] ?? {}) as Bruto;
    const variationId = oi['item'] && (item['variation_id'] ?? null);
    const cheio = oi['full_unit_price'];

    return {
      itemId: texto(item['id']),
      variationId: variationId === null || variationId === undefined ? null : String(variationId),
      title: texto(item['title']),
      sellerSku: texto(item['seller_sku']) || texto(item['seller_custom_field']) || null,
      quantity: numero(oi['quantity']),
      unitPrice: numero(oi['unit_price']),
      fullUnitPrice: typeof cheio === 'number' ? cheio : null,
      saleFee: numero(oi['sale_fee']),
      listingTypeId: texto(oi['listing_type_id']),
    };
  });
}

/** Valor total do pedido, usado para ratear o frete do carrinho. */
export function valorDoPedido(raw: Bruto): number {
  const total = numero(raw['total_amount']);
  if (total > 0) return total;
  return itensDoPedido(raw).reduce((s, i) => s + i.unitPrice * i.quantity, 0);
}

/**
 * Normaliza o pedido cru. Sem rede: o custo do envio já vem resolvido, para
 * esta função poder ser testada sem simular a API inteira.
 */
export function normalizarPedido(
  raw: Bruto,
  envio: EnvioResumido,
  fatorDoPack = 1,
): MlOrderNormalizada {
  const shipping = (raw['shipping'] ?? {}) as Bruto;
  const mediations = Array.isArray(raw['mediations']) ? raw['mediations'] : [];
  const pagamentos = Array.isArray(raw['payments']) ? (raw['payments'] as Bruto[]) : [];
  const packId = raw['pack_id'];
  const shipmentId = shipping['id'];

  return {
    orderId: String(raw['id'] ?? ''),
    packId: packId === null || packId === undefined ? null : String(packId),
    shipmentId: shipmentId === null || shipmentId === undefined ? null : String(shipmentId),
    status: texto(raw['status']),
    tags: Array.isArray(raw['tags']) ? (raw['tags'] as string[]) : [],
    hasMediations: mediations.length > 0,
    dateClosed: texto(raw['date_closed']) || null,
    dateCreated: texto(raw['date_created']),
    items: itensDoPedido(raw),
    payments: pagamentos.map((p) => ({
      totalPaid: numero(p['total_paid_amount']),
      refunded: numero(p['transaction_amount_refunded']),
      status: texto(p['status']),
    })),
    shippingCostSeller: Math.round(envio.custoVendedor * fatorDoPack * 100) / 100,
    logisticType: envio.logisticType,
  };
}

/**
 * Quanto do frete do carrinho cabe a este pedido.
 *
 * Um carrinho gera um pedido por item comprado, mas UM envio só. Como o
 * webhook dispara para cada pedido, atribuir o frete inteiro a todos
 * multiplicaria o custo; o rateio é proporcional ao valor de cada pedido.
 */
export async function fatorDoPack(
  cliente: MlClient,
  raw: Bruto,
  packId: string | null,
): Promise<number> {
  if (!packId) return 1;

  const pack = await cliente.get<Bruto>(`/packs/${packId}`).catch(() => ({}) as Bruto);
  const pedidos = Array.isArray(pack['orders']) ? (pack['orders'] as Bruto[]) : [];
  const ids = pedidos.map((o) => String(o['id'])).filter(Boolean);
  if (ids.length <= 1) return 1;

  const meuId = String(raw['id'] ?? '');
  const meuValor = valorDoPedido(raw);

  const valores = await Promise.all(
    ids.map(async (id) => {
      if (id === meuId) return meuValor;
      const irmao = await cliente.get<Bruto>(`/orders/${id}`).catch(() => ({}) as Bruto);
      return valorDoPedido(irmao);
    }),
  );

  const total = valores.reduce((a, b) => a + b, 0);
  return total > 0 ? meuValor / total : 1 / ids.length;
}

/** Busca o pedido e devolve tudo o que o mapeamento precisa. */
export async function montarPedido(cliente: MlClient, orderId: string): Promise<MlOrderNormalizada> {
  const raw = await cliente.get<Bruto>(`/orders/${orderId}`);
  const shipping = (raw['shipping'] ?? {}) as Bruto;
  const shipmentId = shipping['id'] ? String(shipping['id']) : '';
  const packId = raw['pack_id'] ? String(raw['pack_id']) : null;

  const envio: EnvioResumido = shipmentId
    ? await buscarEnvio(cliente, shipmentId)
    : { custoVendedor: 0, logisticType: texto(shipping['logistic_type']) };

  const fator = await fatorDoPack(cliente, raw, packId);
  return normalizarPedido(raw, envio, fator);
}
