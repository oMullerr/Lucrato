/**
 * Normalização do pedido cru da API.
 *
 * Os exemplos vêm da própria documentação do Mercado Livre (arquivada em
 * `refs/mercadolivre/gerenciamento-de-vendas.md`), para o teste falhar se o
 * contrato mudar em vez de só refletir o que o código já faz.
 */
import { itensDoPedido, normalizarPedido, valorDoPedido } from './orders';
import { idDoRecurso } from './sync';

const pedidoCru = () => ({
  id: 2000003508897196,
  date_created: '2026-09-03T17:01:30.000-04:00',
  date_closed: '2026-09-03T17:01:33.000-04:00',
  pack_id: 2000003508553677,
  total_amount: 50,
  status: 'paid',
  tags: ['paid', 'not_delivered'],
  mediations: [],
  shipping: { id: 41297142475 },
  order_items: [
    {
      item: {
        id: 'MLB2608564035',
        title: 'Camiseta Basica',
        variation_id: 174390848694,
        seller_sku: 'CAM-P',
      },
      quantity: 1,
      unit_price: 50,
      full_unit_price: 60,
      sale_fee: 12,
      listing_type_id: 'gold_special',
    },
  ],
  payments: [
    { total_paid_amount: 50, transaction_amount_refunded: 0, status: 'approved' },
  ],
});

describe('itens do pedido', () => {
  it('achata item, variacao e SKU', () => {
    const [i] = itensDoPedido(pedidoCru());
    expect(i.itemId).toBe('MLB2608564035');
    expect(i.variationId).toBe('174390848694');
    expect(i.sellerSku).toBe('CAM-P');
    expect(i.unitPrice).toBe(50);
    expect(i.saleFee).toBe(12);
    expect(i.fullUnitPrice).toBe(60);
  });

  it('sem variacao devolve nulo, nao a string "null"', () => {
    const cru = pedidoCru();
    delete (cru.order_items[0].item as Record<string, unknown>)['variation_id'];
    expect(itensDoPedido(cru)[0].variationId).toBeNull();
  });

  it('cai no seller_custom_field quando nao ha seller_sku', () => {
    const cru = pedidoCru();
    delete (cru.order_items[0].item as Record<string, unknown>)['seller_sku'];
    (cru.order_items[0].item as Record<string, unknown>)['seller_custom_field'] = 'LEGADO-1';
    expect(itensDoPedido(cru)[0].sellerSku).toBe('LEGADO-1');
  });

  it('sem SKU nenhum devolve nulo', () => {
    const cru = pedidoCru();
    delete (cru.order_items[0].item as Record<string, unknown>)['seller_sku'];
    expect(itensDoPedido(cru)[0].sellerSku).toBeNull();
  });

  it('pedido sem itens nao quebra', () => {
    expect(itensDoPedido({})).toEqual([]);
  });
});

describe('valor do pedido', () => {
  it('usa o total informado', () => {
    expect(valorDoPedido(pedidoCru())).toBe(50);
  });

  it('sem total, soma os itens', () => {
    const cru = pedidoCru();
    delete (cru as Record<string, unknown>)['total_amount'];
    cru.order_items[0].quantity = 3;
    expect(valorDoPedido(cru)).toBe(150);
  });
});

describe('normalizacao', () => {
  const envio = { custoVendedor: 23.25, logisticType: 'drop_off' };

  it('converte ids numericos em texto', () => {
    const p = normalizarPedido(pedidoCru(), envio);
    expect(p.orderId).toBe('2000003508897196');
    expect(p.packId).toBe('2000003508553677');
    expect(p.shipmentId).toBe('41297142475');
  });

  it('traz o custo do vendedor e a logistica', () => {
    const p = normalizarPedido(pedidoCru(), envio);
    expect(p.shippingCostSeller).toBe(23.25);
    expect(p.logisticType).toBe('drop_off');
  });

  it('aplica o fator de rateio do carrinho', () => {
    const p = normalizarPedido(pedidoCru(), envio, 0.5);
    expect(p.shippingCostSeller).toBeCloseTo(11.63, 2);
  });

  it('mediacao vazia nao vira disputa', () => {
    expect(normalizarPedido(pedidoCru(), envio).hasMediations).toBe(false);
  });

  it('mediacao presente vira disputa', () => {
    const cru = { ...pedidoCru(), mediations: [{ id: 1 }] };
    expect(normalizarPedido(cru, envio).hasMediations).toBe(true);
  });

  it('pedido sem pack fica com packId nulo', () => {
    const cru = pedidoCru();
    delete (cru as Record<string, unknown>)['pack_id'];
    expect(normalizarPedido(cru, envio).packId).toBeNull();
  });

  it('lê o estorno do pagamento', () => {
    const cru = pedidoCru();
    cru.payments[0].transaction_amount_refunded = 20;
    expect(normalizarPedido(cru, envio).payments[0].refunded).toBe(20);
  });

  it('pedido vazio nao explode', () => {
    const p = normalizarPedido({}, { custoVendedor: 0, logisticType: '' });
    expect(p.orderId).toBe('');
    expect(p.items).toEqual([]);
  });
});

describe('id do recurso da notificacao', () => {
  it('extrai o pedido', () => {
    expect(idDoRecurso('/orders/2000003508897196')).toBe('2000003508897196');
  });

  it('ignora recurso de outro tipo', () => {
    expect(idDoRecurso('/shipments/41297142475')).toBe('');
    expect(idDoRecurso('')).toBe('');
  });
});
