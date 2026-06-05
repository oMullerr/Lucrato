import {
  calculatePurchase,
  calculateSale,
  calculateKpis,
  nextId,
} from './calculations';
import {
  Purchase,
  Sale,
  Settings,
  ComputedPurchase,
  ComputedSale,
} from '../models/models';

function makePurchase(overrides: Partial<Purchase> = {}): Purchase {
  return {
    id: 'C001',
    product: 'Produto A',
    category: 'Eletrônicos',
    supplier: 'Fornecedor X',
    purchaseDate: '2026-01-01',
    receiptDate: '2026-01-05',
    quantityPurchased: 10,
    unitCost: 100,
    purchaseShipping: 50,
    otherCosts: 0,
    ...overrides,
  };
}

function makeSale(overrides: Partial<Sale> = {}): Sale {
  return {
    id: 'V001',
    batchId: 'C001',
    product: 'Produto A',
    quantitySold: 1,
    unitPrice: 200,
    saleDate: '2026-02-01',
    channel: 'Mercado Livre',
    feePercentage: 0.1,
    shippingType: 'correios',
    sellerShipping: 20,
    discount: 0,
    otherCosts: 0,
    status: 'Concluída',
    ...overrides,
  };
}

function makeSettings(overrides: Partial<Settings> = {}): Settings {
  return {
    defaultMlFee: 0.13,
    yellowAlertDays: 30,
    redAlertDays: 60,
    minimumMargin: 0.1,
    lowStockAlert: 2,
    defaultShipping: 0,
    defaultChannel: 'Mercado Livre',
    categories: [],
    categoryColors: {},
    suppliers: [],
    supplierColors: {},
    channels: [],
    channelColors: {},
    ...overrides,
  };
}

describe('calculatePurchase', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-03-01T00:00:00Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('calcula custos brutos, reais e custo unitário real', () => {
    const purchase = makePurchase({
      quantityPurchased: 10,
      unitCost: 100,
      purchaseShipping: 50,
      otherCosts: 30,
    });
    const result = calculatePurchase(purchase, [], makeSettings());

    expect(result.totalPurchaseCost).toBe(1000);
    expect(result.totalActualCost).toBe(1080);
    expect(result.actualUnitCost).toBe(108);
  });

  it('retorna actualUnitCost = 0 quando quantityPurchased = 0 (guard de divisão por zero)', () => {
    const purchase = makePurchase({ quantityPurchased: 0 });
    const result = calculatePurchase(purchase, [], makeSettings());

    expect(result.actualUnitCost).toBe(0);
    expect(result.totalPurchaseCost).toBe(0);
  });

  it('contabiliza apenas vendas com status "Concluída" no quantitySold', () => {
    const purchase = makePurchase({ quantityPurchased: 10 });
    const sales: Sale[] = [
      makeSale({ id: 'V001', quantitySold: 3, status: 'Concluída' }),
      makeSale({ id: 'V002', quantitySold: 5, status: 'Cancelada' }),
      makeSale({ id: 'V003', quantitySold: 2, status: 'Devolvida' }),
    ];
    const result = calculatePurchase(purchase, sales, makeSettings());

    expect(result.quantitySold).toBe(3);
    expect(result.currentStock).toBe(7);
  });

  it('define status = "Vendido" quando o estoque zera', () => {
    const purchase = makePurchase({ quantityPurchased: 5 });
    const sales: Sale[] = [
      makeSale({ id: 'V001', quantitySold: 5, status: 'Concluída', saleDate: '2026-02-10' }),
    ];
    const result = calculatePurchase(purchase, sales, makeSettings());

    expect(result.currentStock).toBe(0);
    expect(result.status).toBe('Vendido');
  });

  it('define status = "Em trânsito" quando ainda há estoque e não há receiptDate', () => {
    const purchase = makePurchase({ receiptDate: undefined, quantityPurchased: 10 });
    const result = calculatePurchase(purchase, [], makeSettings());

    expect(result.status).toBe('Em trânsito');
  });

  it('vira de "Em trânsito" para "Em Estoque" ao receber receiptDate de hoje', () => {
    const settings = makeSettings({ yellowAlertDays: 30, redAlertDays: 60 });

    // Sem data de recebimento → em trânsito.
    const emTransito = calculatePurchase(
      makePurchase({ receiptDate: undefined }), [], settings,
    );
    expect(emTransito.status).toBe('Em trânsito');

    // Mesmo lote marcado como recebido hoje (system time = 2026-03-01).
    const recebido = calculatePurchase(
      makePurchase({ receiptDate: '2026-03-01' }), [], settings,
    );
    expect(recebido.status).toBe('Em Estoque');
    expect(recebido.daysInStock).toBe(0);
  });

  it('define status = "Parado" quando daysInStock >= redAlertDays', () => {
    // startDate = 2026-01-05, endRef = 2026-03-01 (now) → ~55 dias
    const purchase = makePurchase({ receiptDate: '2026-01-05' });
    const settings = makeSettings({ yellowAlertDays: 30, redAlertDays: 50 });
    const result = calculatePurchase(purchase, [], settings);

    expect(result.daysInStock).toBeGreaterThanOrEqual(50);
    expect(result.status).toBe('Parado');
  });

  it('define status = "Atenção" quando yellowAlertDays <= daysInStock < redAlertDays', () => {
    const purchase = makePurchase({ receiptDate: '2026-01-05' });
    const settings = makeSettings({ yellowAlertDays: 30, redAlertDays: 100 });
    const result = calculatePurchase(purchase, [], settings);

    expect(result.daysInStock).toBeGreaterThanOrEqual(30);
    expect(result.daysInStock).toBeLessThan(100);
    expect(result.status).toBe('Atenção');
  });

  it('define status = "Em Estoque" quando daysInStock < yellowAlertDays', () => {
    const purchase = makePurchase({ receiptDate: '2026-02-25' });
    const settings = makeSettings({ yellowAlertDays: 30, redAlertDays: 60 });
    const result = calculatePurchase(purchase, [], settings);

    expect(result.daysInStock).toBeLessThan(30);
    expect(result.status).toBe('Em Estoque');
  });

  it('captura firstSale e lastSale como datas extremas ordenadas', () => {
    const purchase = makePurchase({ quantityPurchased: 10 });
    const sales: Sale[] = [
      makeSale({ id: 'V001', saleDate: '2026-02-15', status: 'Concluída' }),
      makeSale({ id: 'V002', saleDate: '2026-02-01', status: 'Concluída' }),
      makeSale({ id: 'V003', saleDate: '2026-02-20', status: 'Concluída' }),
    ];
    const result = calculatePurchase(purchase, sales, makeSettings());

    expect(result.firstSale).toBe('2026-02-01');
    expect(result.lastSale).toBe('2026-02-20');
  });

  it('retorna averageMargin = undefined quando totalRevenue = 0', () => {
    const purchase = makePurchase();
    const result = calculatePurchase(purchase, [], makeSettings());

    expect(result.averageMargin).toBeUndefined();
  });

  it('usa purchaseDate como fallback de startDate quando receiptDate é ausente', () => {
    const purchase = makePurchase({
      purchaseDate: '2026-01-01',
      receiptDate: undefined,
      quantityPurchased: 10,
    });
    const sales: Sale[] = [
      makeSale({ id: 'V001', quantitySold: 10, status: 'Concluída', saleDate: '2026-02-10' }),
    ];
    // currentStock zera, então endRef = lastSale = 2026-02-10.
    // startDate = purchaseDate = 2026-01-01 → daysInStock ≈ 40
    const result = calculatePurchase(purchase, sales, makeSettings());

    expect(result.daysInStock).toBe(40);
  });

  it('usa lastSale como endRef quando estoque zerou (independente do "agora")', () => {
    const purchase = makePurchase({ receiptDate: '2026-01-05', quantityPurchased: 5 });
    const sales: Sale[] = [
      makeSale({ id: 'V001', quantitySold: 5, status: 'Concluída', saleDate: '2026-01-15' }),
    ];
    // startDate = 2026-01-05, lastSale = 2026-01-15 → 10 dias
    const result = calculatePurchase(purchase, sales, makeSettings());

    expect(result.currentStock).toBe(0);
    expect(result.daysInStock).toBe(10);
  });

  it('calcula idleValue quando há estoque restante e zero quando vendido', () => {
    const purchase = makePurchase({
      quantityPurchased: 10,
      unitCost: 100,
      purchaseShipping: 0,
      otherCosts: 0,
    });
    const sales: Sale[] = [
      makeSale({ id: 'V001', quantitySold: 4, status: 'Concluída' }),
    ];
    const result = calculatePurchase(purchase, sales, makeSettings());

    // actualUnitCost = 100, currentStock = 6 → idleValue = 600
    expect(result.idleValue).toBe(600);
  });

  it('averageMargin do lote bate com a soma dos netProfit das vendas (Flex + Outros custos)', () => {
    const purchase = makePurchase({
      quantityPurchased: 10,
      unitCost: 100,
      purchaseShipping: 50, // actualUnitCost = (1000 + 50) / 10 = 105
      otherCosts: 0,
    });
    const sales: Sale[] = [
      makeSale({
        id: 'V001', shippingType: 'correios', quantitySold: 2, unitPrice: 200,
        feePercentage: 0.1, sellerShipping: 20, discount: 0, otherCosts: 25, status: 'Concluída',
      }),
      makeSale({
        id: 'V002', shippingType: 'flex', quantitySold: 1, unitPrice: 300,
        feePercentage: 0.1, flexRefund: 30, sellerShipping: 99 /* obsoleto, deve ser ignorado */,
        discount: 10, otherCosts: 0, status: 'Concluída',
      }),
    ];

    const computed = calculatePurchase(purchase, sales, makeSettings());

    // Invariante: a margem média do lote == (Σ netProfit) / (Σ grossRevenue) das vendas.
    const computedSales = sales.map(s => calculateSale(s, [purchase]));
    const sumProfit = computedSales.reduce((a, s) => a + s.netProfit, 0);
    const sumGross = computedSales.reduce((a, s) => a + s.grossRevenue, 0);

    expect(computed.averageMargin).toBeCloseTo(sumProfit / sumGross, 10);
    // Sanidade: 290 / 700 ≈ 0.4143 — não o valor antigo (Flex ignorado) ≈ 0.16.
    expect(computed.averageMargin).toBeCloseTo(290 / 700, 10);
  });
});

describe('calculateSale', () => {
  it('retorna actualUnitCost = 0 quando batch não existe', () => {
    const sale = makeSale({ batchId: 'C999' });
    const result = calculateSale(sale, []);

    expect(result.actualUnitCost).toBe(0);
    expect(result.proportionalCost).toBe(0);
  });

  it('calcula actualUnitCost com base no batch (custo total / quantidade comprada)', () => {
    const purchase = makePurchase({
      id: 'C001',
      quantityPurchased: 10,
      unitCost: 100,
      purchaseShipping: 50,
      otherCosts: 0,
    });
    const sale = makeSale({ batchId: 'C001', quantitySold: 2, unitPrice: 200 });
    const result = calculateSale(sale, [purchase]);

    // actualUnitCost = (10*100 + 50 + 0) / 10 = 105
    expect(result.actualUnitCost).toBe(105);
    expect(result.proportionalCost).toBe(210);
  });

  it('usa flexRefund (positivo) quando shippingType = "flex"', () => {
    const sale = makeSale({
      shippingType: 'flex',
      flexRefund: 15,
      sellerShipping: 99,
      quantitySold: 1,
      unitPrice: 100,
      feePercentage: 0,
      discount: 0,
      otherCosts: 0,
    });
    const result = calculateSale(sale, []);

    // netRevenue = 100 - 0 + 15 - 0 - 0 = 115
    expect(result.netRevenue).toBe(115);
  });

  it('usa flexRefund = 0 quando shippingType = "flex" e flexRefund ausente', () => {
    const sale = makeSale({
      shippingType: 'flex',
      flexRefund: undefined,
      sellerShipping: 99,
      quantitySold: 1,
      unitPrice: 100,
      feePercentage: 0,
      discount: 0,
      otherCosts: 0,
    });
    const result = calculateSale(sale, []);

    expect(result.netRevenue).toBe(100);
  });

  it('subtrai sellerShipping quando shippingType != "flex"', () => {
    const sale = makeSale({
      shippingType: 'correios',
      sellerShipping: 20,
      quantitySold: 1,
      unitPrice: 100,
      feePercentage: 0,
      discount: 0,
      otherCosts: 0,
    });
    const result = calculateSale(sale, []);

    expect(result.netRevenue).toBe(80);
  });

  it('feeAmount é proporcional a grossRevenue * feePercentage', () => {
    const sale = makeSale({ quantitySold: 2, unitPrice: 100, feePercentage: 0.15 });
    const result = calculateSale(sale, []);

    expect(result.grossRevenue).toBe(200);
    expect(result.feeAmount).toBeCloseTo(30, 10);
  });

  it('netMargin = 0 quando grossRevenue = 0', () => {
    const sale = makeSale({ quantitySold: 0, unitPrice: 0 });
    const result = calculateSale(sale, []);

    expect(result.grossRevenue).toBe(0);
    expect(result.netMargin).toBe(0);
  });

  it('calcula grossProfit, netProfit e netMargin com cenário realista', () => {
    const purchase = makePurchase({
      id: 'C001',
      quantityPurchased: 10,
      unitCost: 50,
      purchaseShipping: 0,
      otherCosts: 0,
    });
    const sale = makeSale({
      batchId: 'C001',
      quantitySold: 1,
      unitPrice: 100,
      feePercentage: 0.1,
      shippingType: 'correios',
      sellerShipping: 10,
      discount: 0,
      otherCosts: 0,
    });
    const result = calculateSale(sale, [purchase]);

    // actualUnitCost = 50, proportionalCost = 50
    // grossRevenue = 100, feeAmount = 10, netRevenue = 100 - 10 - 10 = 80
    // grossProfit = 100 - 50 = 50
    // netProfit = 80 - 50 = 30
    // netMargin = 30 / 100 = 0.3
    expect(result.grossProfit).toBe(50);
    expect(result.netProfit).toBe(30);
    expect(result.netMargin).toBeCloseTo(0.3, 10);
  });
});

describe('calculateKpis', () => {
  function makeComputedPurchase(overrides: Partial<ComputedPurchase> = {}): ComputedPurchase {
    return {
      ...makePurchase(),
      totalPurchaseCost: 1000,
      totalActualCost: 1050,
      actualUnitCost: 105,
      quantitySold: 0,
      currentStock: 10,
      idleValue: 1050,
      daysInStock: 0,
      status: 'Em Estoque',
      ...overrides,
    };
  }

  function makeComputedSale(overrides: Partial<ComputedSale> = {}): ComputedSale {
    return {
      ...makeSale(),
      grossRevenue: 200,
      feeAmount: 20,
      netRevenue: 160,
      actualUnitCost: 105,
      proportionalCost: 105,
      grossProfit: 95,
      netProfit: 55,
      netMargin: 0.275,
      ...overrides,
    };
  }

  it('filtra apenas vendas com status "Concluída"', () => {
    const sales: ComputedSale[] = [
      makeComputedSale({ id: 'V001', grossRevenue: 100, netProfit: 30, status: 'Concluída' }),
      makeComputedSale({ id: 'V002', grossRevenue: 999, netProfit: 999, status: 'Cancelada' }),
    ];
    const result = calculateKpis([], sales);

    expect(result.grossRevenue).toBe(100);
    expect(result.netProfit).toBe(30);
    expect(result.totalSold).toBe(sales[0].quantitySold);
  });

  it('averageTicket = 0 quando não há vendas concluídas', () => {
    const result = calculateKpis([], []);
    expect(result.averageTicket).toBe(0);
  });

  it('netMargin = 0 quando grossRevenue = 0', () => {
    const sales: ComputedSale[] = [
      makeComputedSale({ grossRevenue: 0, netProfit: 0, status: 'Concluída' }),
    ];
    const result = calculateKpis([], sales);
    expect(result.netMargin).toBe(0);
  });

  it('batchesInStock + soldBatches = totalBatches', () => {
    const purchases: ComputedPurchase[] = [
      makeComputedPurchase({ id: 'C001', currentStock: 5 }),
      makeComputedPurchase({ id: 'C002', currentStock: 0 }),
      makeComputedPurchase({ id: 'C003', currentStock: -1 }),
    ];
    const result = calculateKpis(purchases, []);

    expect(result.totalBatches).toBe(3);
    expect(result.batchesInStock).toBe(1);
    expect(result.soldBatches).toBe(2);
  });

  it('soma corretamente totalInvested, idleCapital e averageTicket', () => {
    const purchases: ComputedPurchase[] = [
      makeComputedPurchase({ totalActualCost: 100, idleValue: 50 }),
      makeComputedPurchase({ totalActualCost: 200, idleValue: 100 }),
    ];
    const sales: ComputedSale[] = [
      makeComputedSale({ grossRevenue: 100, status: 'Concluída' }),
      makeComputedSale({ grossRevenue: 300, status: 'Concluída' }),
    ];
    const result = calculateKpis(purchases, sales);

    expect(result.totalInvested).toBe(300);
    expect(result.idleCapital).toBe(150);
    expect(result.averageTicket).toBe(200);
  });

  it('totalShipping ignora frete de Flex; agrega totalFlexRefund e totalOtherCosts', () => {
    const sales: ComputedSale[] = [
      makeComputedSale({
        id: 'V001', status: 'Concluída',
        shippingType: 'correios', sellerShipping: 20, otherCosts: 5,
      }),
      makeComputedSale({
        id: 'V002', status: 'Concluída',
        shippingType: 'flex', sellerShipping: 99, flexRefund: 15, otherCosts: 0,
      }),
    ];
    const result = calculateKpis([], sales);

    expect(result.totalShipping).toBe(20);    // só Correios; o 99 da venda Flex é ignorado
    expect(result.totalFlexRefund).toBe(15);
    expect(result.totalOtherCosts).toBe(5);
  });
});

describe('nextId', () => {
  it('retorna prefix + "001" para lista vazia', () => {
    expect(nextId([], 'C')).toBe('C001');
  });

  it('retorna o próximo ID após o maior número encontrado', () => {
    expect(nextId(['C001', 'C002', 'C010'], 'C')).toBe('C011');
  });

  it('ignora IDs com prefixo diferente', () => {
    expect(nextId(['V001', 'V050', 'C003'], 'C')).toBe('C004');
  });

  it('respeita padding customizado', () => {
    expect(nextId([], 'C', 5)).toBe('C00001');
    expect(nextId(['C00042'], 'C', 5)).toBe('C00043');
  });

  it('ignora IDs malformados sem quebrar', () => {
    expect(nextId(['C001', 'CXX', 'C-bad', 'C002'], 'C')).toBe('C003');
  });

  it('funciona com qualquer prefixo (V, P, etc.)', () => {
    expect(nextId(['V099'], 'V')).toBe('V100');
  });
});
