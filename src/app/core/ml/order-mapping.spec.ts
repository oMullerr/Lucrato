/**
 * Pedido do Mercado Livre → rascunho de venda.
 *
 * É a regra de dinheiro da ingestão. Os números aqui são escritos como conta
 * (`12 / 50`), nunca como decimal já resolvido, para o teste continuar legível
 * quando alguém for conferir contra um pedido real.
 */
import {
  MlOrderItem,
  MlOrderNormalizada,
  diaLocalDeISO,
  fracaoDaComissao,
  mapearPedido,
  situacaoDaVenda,
} from './order-mapping';

function item(over: Partial<MlOrderItem> = {}): MlOrderItem {
  return {
    itemId: 'MLB2608564035',
    variationId: null,
    title: 'Camiseta Basica',
    sellerSku: null,
    quantity: 1,
    unitPrice: 50,
    fullUnitPrice: null,
    saleFee: 12,
    listingTypeId: 'gold_special',
    ...over,
  };
}

function pedido(over: Partial<MlOrderNormalizada> = {}): MlOrderNormalizada {
  return {
    orderId: '2000003508897196',
    packId: null,
    shipmentId: '41297142475',
    status: 'paid',
    tags: ['paid'],
    hasMediations: false,
    dateClosed: '2026-09-03T17:01:33.000-04:00',
    dateCreated: '2026-09-03T17:01:30.000-04:00',
    items: [item()],
    payments: [{ totalPaid: 50, refunded: 0, status: 'approved' }],
    shippingCostSeller: 0,
    logisticType: 'drop_off',
    ...over,
  };
}

describe('dia da venda', () => {
  it('usa o fuso do vendedor, nao o offset cru da API', () => {
    // 23h30 em Sao Paulo chega como 00:30 do dia seguinte em -03:00 aparente.
    expect(diaLocalDeISO('2026-09-03T23:30:00.000-03:00')).toBe('2026-09-03');
  });

  it('nao empurra para o dia seguinte no fim da noite', () => {
    expect(diaLocalDeISO('2026-09-03T22:00:00.000-04:00')).toBe('2026-09-03');
  });

  it('devolve vazio para data invalida', () => {
    expect(diaLocalDeISO('nao-e-data')).toBe('');
  });
});

describe('comissao', () => {
  it('vira fracao do bruto, como o Lucrato guarda', () => {
    expect(fracaoDaComissao(12, 50, 1)).toBeCloseTo(12 / 50, 10);
  });

  it('considera a quantidade', () => {
    expect(fracaoDaComissao(24, 50, 2)).toBeCloseTo(24 / 100, 10);
  });

  it('nao divide por zero', () => {
    expect(fracaoDaComissao(10, 0, 1)).toBe(0);
    expect(fracaoDaComissao(10, 50, 0)).toBe(0);
  });
});

describe('situacao da venda', () => {
  it('pedido pago vira concluida', () => {
    expect(situacaoDaVenda({ status: 'paid', hasMediations: false })).toBe('Concluída');
  });

  it('cancelado vira cancelada', () => {
    expect(situacaoDaVenda({ status: 'cancelled', hasMediations: false })).toBe('Cancelada');
  });

  it('mediacao vira em disputa', () => {
    expect(situacaoDaVenda({ status: 'paid', hasMediations: true })).toBe('Em disputa');
  });

  it('cancelamento tem prioridade sobre mediacao', () => {
    expect(situacaoDaVenda({ status: 'cancelled', hasMediations: true })).toBe('Cancelada');
  });
});

describe('mapeamento de um pedido simples', () => {
  it('traz preco, quantidade e comissao real', () => {
    const [v] = mapearPedido(pedido());
    expect(v.unitPrice).toBe(50);
    expect(v.quantitySold).toBe(1);
    expect(v.feePercentage).toBeCloseTo(12 / 50, 10);
    expect(v.status).toBe('Concluída');
  });

  it('carimba os identificadores do Mercado Livre', () => {
    const [v] = mapearPedido(pedido({ packId: '999' }));
    expect(v.externalId).toBe('2000003508897196:MLB2608564035');
    expect(v.mlOrderId).toBe('2000003508897196');
    expect(v.mlItemId).toBe('MLB2608564035');
    expect(v.mlPackId).toBe('999');
    expect(v.mlShipmentId).toBe('41297142475');
  });

  it('inclui a variacao na chave quando existe', () => {
    const [v] = mapearPedido(pedido({ items: [item({ variationId: '174390848694' })] }));
    expect(v.externalId).toBe('2000003508897196:MLB2608564035:174390848694');
    expect(v.mlVariationId).toBe('174390848694');
  });

  it('a chave e estavel entre duas leituras do mesmo pedido', () => {
    expect(mapearPedido(pedido())[0].externalId).toBe(mapearPedido(pedido())[0].externalId);
  });
});

describe('frete', () => {
  it('custo do vendedor entra como frete de correios', () => {
    const [v] = mapearPedido(pedido({ shippingCostSeller: 23.25 }));
    expect(v.shippingType).toBe('correios');
    expect(v.sellerShipping).toBe(23.25);
    expect(v.flexRefund).toBeUndefined();
  });

  /**
   * No Flex o vendedor contrata a própria transportadora. O custo que a API
   * reporta (8,01 na conta de teste) não é pago ao Mercado Livre, então trazê-lo
   * poria no lucro uma despesa que não existe.
   */
  it('ignora o custo que a API reporta no Flex', () => {
    const [v] = mapearPedido(pedido({ logisticType: 'self_service', shippingCostSeller: 8.01 }));
    expect(v.sellerShipping).toBe(0);
    expect(v.flexRefund).toBe(0);
    expect(v.shippingType).toBe('flex');
  });

  it('avisa nas observacoes que o frete do Flex fica de fora', () => {
    const [v] = mapearPedido(pedido({ logisticType: 'self_service', shippingCostSeller: 8.01 }));
    expect(v.notes).toContain('Flex');
    expect(v.notes).toContain('transportadora');
  });

  it('fora do Flex, credito vira estorno de frete', () => {
    const [v] = mapearPedido(pedido({ logisticType: 'drop_off', shippingCostSeller: -8.5 }));
    expect(v.shippingType).toBe('flex');
    expect(v.flexRefund).toBe(8.5);
    expect(v.sellerShipping).toBe(0);
  });

  it('fora do Flex, frete zero nao vira credito', () => {
    const [v] = mapearPedido(pedido({ logisticType: 'drop_off', shippingCostSeller: 0 }));
    expect(v.shippingType).toBe('correios');
    expect(v.sellerShipping).toBe(0);
    expect(v.flexRefund).toBeUndefined();
  });

  it('rateia o frete entre os itens, proporcional ao valor', () => {
    const vendas = mapearPedido(
      pedido({
        shippingCostSeller: 30,
        items: [
          item({ itemId: 'A', unitPrice: 100, quantity: 1 }),
          item({ itemId: 'B', unitPrice: 200, quantity: 1 }),
        ],
      }),
    );
    expect(vendas[0].sellerShipping).toBeCloseTo(10, 2);
    expect(vendas[1].sellerShipping).toBeCloseTo(20, 2);
  });

  it('o rateio fecha a conta, sem centavo perdido', () => {
    const vendas = mapearPedido(
      pedido({
        shippingCostSeller: 10,
        items: [
          item({ itemId: 'A', unitPrice: 10, quantity: 1 }),
          item({ itemId: 'B', unitPrice: 10, quantity: 1 }),
          item({ itemId: 'C', unitPrice: 10, quantity: 1 }),
        ],
      }),
    );
    const soma = vendas.reduce((s, v) => s + v.sellerShipping, 0);
    expect(soma).toBeCloseTo(10, 10);
  });
});

describe('desconto e estorno', () => {
  it('preco cheio maior vira desconto do vendedor', () => {
    const [v] = mapearPedido(pedido({ items: [item({ unitPrice: 45, fullUnitPrice: 50, quantity: 2 })] }));
    expect(v.discount).toBe(10);
  });

  it('sem preco cheio, nao inventa desconto', () => {
    expect(mapearPedido(pedido())[0].discount).toBe(0);
  });

  it('preco cheio menor que o cobrado nao vira desconto negativo', () => {
    const [v] = mapearPedido(pedido({ items: [item({ unitPrice: 50, fullUnitPrice: 40 })] }));
    expect(v.discount).toBe(0);
  });

  it('valor estornado ao comprador vira estorno na venda', () => {
    const [v] = mapearPedido(
      pedido({ payments: [{ totalPaid: 50, refunded: 20, status: 'approved' }] }),
    );
    expect(v.estorno).toBe(20);
  });

  it('sem estorno, o campo nem aparece', () => {
    expect(mapearPedido(pedido())[0].estorno).toBeUndefined();
  });
});

describe('carrinho com varios itens', () => {
  it('gera um rascunho por item, com chaves diferentes', () => {
    const vendas = mapearPedido(
      pedido({
        items: [item({ itemId: 'MLB1' }), item({ itemId: 'MLB2' })],
      }),
    );
    expect(vendas).toHaveLength(2);
    expect(new Set(vendas.map(v => v.externalId)).size).toBe(2);
  });

  it('todos herdam a mesma data e situacao', () => {
    const vendas = mapearPedido(
      pedido({ status: 'cancelled', items: [item({ itemId: 'A' }), item({ itemId: 'B' })] }),
    );
    expect(vendas.every(v => v.status === 'Cancelada')).toBe(true);
    expect(new Set(vendas.map(v => v.saleDate)).size).toBe(1);
  });
});
