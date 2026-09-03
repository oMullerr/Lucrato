/**
 * Aplicação da caixa de entrada no razão.
 *
 * É onde a venda do Mercado Livre vira registro do Lucrato: escolha do lote por
 * FIFO, divisão entre lotes, idempotência e o que fazer quando não cabe. Erro
 * aqui vira estoque errado e lucro errado, então os casos são explícitos.
 */
import { ItemDaCaixa, planejarAplicacao } from './inbox-apply';
import { calculatePurchase } from '../services/calculations';
import type { ComputedPurchase, Purchase, Sale, Settings } from '../models/models';
import { makePurchase, makeSale } from '../../../testing/fixtures';

const config = {
  yellowAlertDays: 25,
  redAlertDays: 30,
} as unknown as Settings;

/** Lote computado de verdade, para o estoque vir do mesmo motor do app. */
function lote(p: Partial<Purchase>, vendas: Sale[] = []): ComputedPurchase {
  return calculatePurchase(makePurchase(p), vendas, config, []);
}

function item(over: Partial<ItemDaCaixa> = {}): ItemDaCaixa {
  return {
    externalId: '2000003508897196:MLB1',
    mlOrderId: '2000003508897196',
    mlItemId: 'MLB1',
    produto: 'Fone Bluetooth',
    vinculado: true,
    quantitySold: 1,
    unitPrice: 200,
    saleDate: '2026-09-03',
    feePercentage: 0.12,
    shippingType: 'correios',
    sellerShipping: 20,
    discount: 0,
    status: 'Concluída',
    notes: 'Mercado Livre · pedido 2000003508897196',
    estado: 'pendente',
    ...over,
  };
}

describe('vinculo obrigatorio', () => {
  it('item sem vinculo espera, nao inventa produto', () => {
    const plano = planejarAplicacao([item({ vinculado: false })], [], []);
    expect(plano.novas).toHaveLength(0);
    expect(plano.pendentes).toEqual([
      { externalId: '2000003508897196:MLB1', motivo: 'sem_vinculo' },
    ]);
  });
});

describe('escolha do lote por FIFO', () => {
  const lotes = [
    lote({ id: 'C002', product: 'Fone Bluetooth', quantityPurchased: 5, purchaseDate: '2026-08-01' }),
    lote({ id: 'C001', product: 'Fone Bluetooth', quantityPurchased: 5, purchaseDate: '2026-01-01' }),
  ];

  it('usa o lote mais antigo com estoque', () => {
    const plano = planejarAplicacao([item()], lotes, []);
    expect(plano.novas).toHaveLength(1);
    expect(plano.novas[0].batchId).toBe('C001');
  });

  it('respeita a data de recebimento quando existe', () => {
    const comRecebimento = [
      lote({ id: 'C001', product: 'Fone Bluetooth', quantityPurchased: 5, purchaseDate: '2026-01-01', receiptDate: '2026-09-01' }),
      lote({ id: 'C002', product: 'Fone Bluetooth', quantityPurchased: 5, purchaseDate: '2026-08-01', receiptDate: '2026-08-05' }),
    ];
    expect(planejarAplicacao([item()], comRecebimento, []).novas[0].batchId).toBe('C002');
  });

  it('ignora lote de outro produto', () => {
    const outros = [lote({ id: 'C009', product: 'Cadeira Gamer', quantityPurchased: 10 })];
    expect(planejarAplicacao([item()], outros, []).pendentes[0].motivo).toBe('sem_estoque');
  });

  it('casa o produto ignorando acento e caixa', () => {
    const acentuado = [lote({ id: 'C001', product: 'FONE BLUETÓOTH', quantityPurchased: 3 })];
    const plano = planejarAplicacao([item({ produto: 'fone bluetooth' })], acentuado, []);
    expect(plano.novas[0].batchId).toBe('C001');
  });
});

describe('quando nao cabe', () => {
  it('sem estoque suficiente, nada e gravado', () => {
    const lotes = [lote({ id: 'C001', product: 'Fone Bluetooth', quantityPurchased: 2 })];
    const plano = planejarAplicacao([item({ quantitySold: 5 })], lotes, []);
    expect(plano.novas).toHaveLength(0);
    expect(plano.pendentes[0].motivo).toBe('sem_estoque');
  });

  it('estoque ja consumido por venda anterior conta', () => {
    const vendaAntiga = makeSale({ id: 'V001', batchId: 'C001', quantitySold: 4 });
    const lotes = [lote({ id: 'C001', product: 'Fone Bluetooth', quantityPurchased: 5 }, [vendaAntiga])];
    const plano = planejarAplicacao([item({ quantitySold: 2 })], lotes, [vendaAntiga]);
    expect(plano.pendentes[0].motivo).toBe('sem_estoque');
  });
});

describe('divisao entre lotes', () => {
  const lotes = [
    lote({ id: 'C001', product: 'Fone Bluetooth', quantityPurchased: 2, purchaseDate: '2026-01-01' }),
    lote({ id: 'C002', product: 'Fone Bluetooth', quantityPurchased: 5, purchaseDate: '2026-02-01' }),
  ];

  it('gera uma venda por lote, na ordem certa', () => {
    const plano = planejarAplicacao([item({ quantitySold: 3 })], lotes, []);
    expect(plano.novas.map(v => [v.batchId, v.quantitySold])).toEqual([
      ['C001', 2],
      ['C002', 1],
    ]);
  });

  it('cada fatia recebe um externalId proprio', () => {
    const plano = planejarAplicacao([item({ quantitySold: 3 })], lotes, []);
    expect(plano.novas.map(v => v.externalId)).toEqual([
      '2000003508897196:MLB1#1',
      '2000003508897196:MLB1#2',
    ]);
  });

  it('rateia o frete entre as fatias, sem cobrar duas vezes', () => {
    const plano = planejarAplicacao([item({ quantitySold: 3, sellerShipping: 30 })], lotes, []);
    const soma = plano.novas.reduce((s, v) => s + v.sellerShipping, 0);
    expect(soma).toBeCloseTo(30, 2);
    expect(plano.novas[0].sellerShipping).toBeCloseTo(20, 2);
  });

  it('rateia tambem desconto e estorno', () => {
    const plano = planejarAplicacao(
      [item({ quantitySold: 3, discount: 15, estorno: 9 })],
      lotes,
      [],
    );
    expect(plano.novas.reduce((s, v) => s + v.discount, 0)).toBeCloseTo(15, 2);
    expect(plano.novas.reduce((s, v) => s + (v.estorno ?? 0), 0)).toBeCloseTo(9, 2);
  });

  it('venda que cabe em um lote so nao ganha sufixo', () => {
    const plano = planejarAplicacao([item({ quantitySold: 2 })], lotes, []);
    expect(plano.novas[0].externalId).toBe('2000003508897196:MLB1');
  });
});

describe('idempotencia', () => {
  const lotes = [lote({ id: 'C001', product: 'Fone Bluetooth', quantityPurchased: 10 })];

  it('pedido ja aplicado nao vira venda nova', () => {
    const existente: Sale = {
      ...makeSale({ id: 'V001', batchId: 'C001', quantitySold: 1 }),
      externalId: '2000003508897196:MLB1',
      source: 'mercadolivre',
      feePercentage: 0.12,
      unitPrice: 200,
      sellerShipping: 20,
      discount: 0,
      status: 'Concluída',
      shippingType: 'correios',
    };
    const plano = planejarAplicacao([item()], lotes, [existente]);
    expect(plano.novas).toHaveLength(0);
    expect(plano.aplicados).toContain('2000003508897196:MLB1');
  });

  it('mudanca de situacao atualiza a venda existente', () => {
    const existente: Sale = {
      ...makeSale({ id: 'V001', batchId: 'C001', quantitySold: 1 }),
      externalId: '2000003508897196:MLB1',
      source: 'mercadolivre',
      feePercentage: 0.12,
      unitPrice: 200,
      sellerShipping: 20,
      discount: 0,
      status: 'Concluída',
      shippingType: 'correios',
    };
    const plano = planejarAplicacao([item({ status: 'Cancelada' })], lotes, [existente]);
    expect(plano.novas).toHaveLength(0);
    expect(plano.atualizadas).toHaveLength(1);
    expect(plano.atualizadas[0].status).toBe('Cancelada');
    expect(plano.atualizadas[0].id).toBe('V001');
  });

  it('atualizacao preserva o lote e as observacoes escolhidos', () => {
    const existente: Sale = {
      ...makeSale({ id: 'V001', batchId: 'C001', quantitySold: 1, notes: 'anotacao minha' }),
      externalId: '2000003508897196:MLB1',
      source: 'mercadolivre',
      feePercentage: 0.12,
      unitPrice: 200,
      sellerShipping: 20,
      discount: 0,
      status: 'Concluída',
      shippingType: 'correios',
    };
    const plano = planejarAplicacao([item({ status: 'Em disputa' })], lotes, [existente]);
    expect(plano.atualizadas[0].batchId).toBe('C001');
    expect(plano.atualizadas[0].notes).toBe('anotacao minha');
  });
});

describe('varias vendas na mesma rodada', () => {
  it('nao deixa duas vendas disputarem a mesma unidade', () => {
    const lotes = [lote({ id: 'C001', product: 'Fone Bluetooth', quantityPurchased: 3 })];
    const plano = planejarAplicacao(
      [
        item({ externalId: 'A', quantitySold: 2, saleDate: '2026-09-01' }),
        item({ externalId: 'B', quantitySold: 2, saleDate: '2026-09-02' }),
      ],
      lotes,
      [],
    );
    expect(plano.novas).toHaveLength(1);
    expect(plano.aplicados).toEqual(['A']);
    expect(plano.pendentes).toEqual([{ externalId: 'B', motivo: 'sem_estoque' }]);
  });

  it('ids das vendas novas nao se repetem', () => {
    const lotes = [lote({ id: 'C001', product: 'Fone Bluetooth', quantityPurchased: 10 })];
    const plano = planejarAplicacao(
      [item({ externalId: 'A' }), item({ externalId: 'B' }), item({ externalId: 'C' })],
      lotes,
      [makeSale({ id: 'V007', batchId: 'C001', quantitySold: 1 })],
    );
    expect(plano.novas.map(v => v.id)).toEqual(['V008', 'V009', 'V010']);
  });

  it('aplica em ordem cronologica, nao na ordem que chegou', () => {
    const lotes = [lote({ id: 'C001', product: 'Fone Bluetooth', quantityPurchased: 1 })];
    const plano = planejarAplicacao(
      [
        item({ externalId: 'RECENTE', saleDate: '2026-09-10' }),
        item({ externalId: 'ANTIGA', saleDate: '2026-09-01' }),
      ],
      lotes,
      [],
    );
    expect(plano.aplicados).toEqual(['ANTIGA']);
  });
});

describe('venda gerada', () => {
  const lotes = [lote({ id: 'C001', product: 'Fone Bluetooth', quantityPurchased: 5 })];

  it('carimba origem e identificadores do Mercado Livre', () => {
    const [v] = planejarAplicacao(
      [item({ mlPackId: '777', mlShipmentId: '888', mlVariationId: '999' })],
      lotes,
      [],
    ).novas;
    expect(v.source).toBe('mercadolivre');
    expect(v.channel).toBe('Mercado Livre');
    expect(v.mlOrderId).toBe('2000003508897196');
    expect(v.mlPackId).toBe('777');
    expect(v.mlShipmentId).toBe('888');
    expect(v.mlVariationId).toBe('999');
  });

  it('usa o nome do produto do Lucrato, nao o titulo do anuncio', () => {
    const [v] = planejarAplicacao([item({ produto: 'Fone Bluetooth' })], lotes, []).novas;
    expect(v.product).toBe('Fone Bluetooth');
  });

  it('leva a comissao real e o frete do pedido', () => {
    const [v] = planejarAplicacao([item({ feePercentage: 0.165, sellerShipping: 23.25 })], lotes, []).novas;
    expect(v.feePercentage).toBeCloseTo(0.165, 10);
    expect(v.sellerShipping).toBeCloseTo(23.25, 2);
  });
});
