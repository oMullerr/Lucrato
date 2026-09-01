/**
 * Motor de cálculo de devoluções.
 *
 * Cada cenário abaixo é o mesmo que consta no plano da feature, com os números
 * conferidos à mão. As expectativas são expressões aritméticas explícitas para
 * que uma quebra aponte QUAL termo mudou, nunca um decimal solto.
 *
 * Regras travadas com o usuário:
 *  - receita bruta, desconto e estorno revertem PROPORCIONALMENTE;
 *  - taxa da plataforma, frete original e outros custos são RETIDOS;
 *  - só o destino 'Estoque' devolve a unidade ao lote e libera o CMV;
 *  - devolução 'Solicitado' (sem data de chegada) não move NENHUM valor.
 */
import {
  calculateSale,
  calculatePurchase,
  calculateKpis,
  computeReturn,
  countsAsRevenue,
  remainingReturnable,
  returnStatusOf,
  resolutionDaysOf,
  nextId,
} from './calculations';
import { makePurchase, makeSale, makeReturn } from '../../../testing/fixtures';
import type { Purchase, Sale, Return, Settings, SaleStatus } from '../models/models';

/** Lote com custo unitário real 53 = (10×50 + 20 + 10) / 10. */
const BATCH_53: Purchase = makePurchase({
  id: 'C001', quantityPurchased: 10, unitCost: 50, purchaseShipping: 20, otherCosts: 10,
});
/** Lote com custo unitário real 10. */
const BATCH_10: Purchase = makePurchase({
  id: 'C002', quantityPurchased: 5, unitCost: 10, purchaseShipping: 0, otherCosts: 0,
});

const settings = (): Settings => ({
  defaultMlFee: 0.12, yellowAlertDays: 25, redAlertDays: 30, minimumMargin: 0.1,
  lowStockAlert: 1, defaultShipping: 0, returnWindowDays: 30,
  defaultChannel: 'Mercado Livre', categories: [], categoryColors: {},
  suppliers: [], supplierColors: {}, channels: [], channelColors: {},
});

/** Venda do cenário (a)/(e): 3 × 90, taxa 12%, Flex +4, outros custos 2. */
const SALE_A: Sale = makeSale({
  id: 'V002', batchId: 'C001', quantitySold: 3, unitPrice: 90, feePercentage: 0.12,
  shippingType: 'flex', flexRefund: 4, sellerShipping: 12, discount: 0, otherCosts: 2,
});
/** Venda do cenário (b): 1 × 30, taxa 12%, Flex +2. */
const SALE_B: Sale = makeSale({
  id: 'V003', batchId: 'C002', quantitySold: 1, unitPrice: 30, feePercentage: 0.12,
  shippingType: 'flex', flexRefund: 2, sellerShipping: 5, discount: 0, otherCosts: 0,
});
/** Venda do cenário (c): 2 × 100, taxa 10%, Correios 15, desconto 5. */
const SALE_C: Sale = makeSale({
  id: 'V001', batchId: 'C001', quantitySold: 2, unitPrice: 100, feePercentage: 0.10,
  shippingType: 'correios', sellerShipping: 15, discount: 5, otherCosts: 0,
});

const finalized = (o: Partial<Return>): Return =>
  makeReturn({ arrivalDate: '2026-02-20', ...o });

describe('devoluções — cenário (a) destino Estoque, parcial', () => {
  const ret = finalized({
    id: 'D001', saleId: 'V002', batchId: 'C001', quantity: 1,
    destination: 'Estoque', returnShipping: 12,
  });
  const sale = calculateSale(SALE_A, [BATCH_53], [ret]);

  it('reverte a receita proporcionalmente e retém a taxa integral', () => {
    expect(sale.effectiveQuantity).toBe(3 - 1);
    expect(sale.grossRevenue).toBe(2 * 90);
    expect(sale.originalGrossRevenue).toBe(3 * 90);
    // Taxa incide sobre a venda ORIGINAL — a plataforma não estorna comissão.
    expect(sale.feeAmount).toBeCloseTo(3 * 90 * 0.12, 10);
  });

  it('calcula receita líquida, custo e lucro', () => {
    // 180 − 32,4 + 4 (flex) − 2 (outros) − 12 (frete devolução)
    expect(sale.netRevenue).toBeCloseTo(180 - 32.4 + 4 - 2 - 12, 10);
    expect(sale.costedQuantity).toBe(3 - 1);
    expect(sale.proportionalCost).toBe(2 * 53);
    expect(sale.netProfit).toBeCloseTo(137.6 - 106, 10);
  });

  it('mede o lucro perdido contra o contrafactual sem devolução', () => {
    const baseline = calculateSale(SALE_A, [BATCH_53]);
    expect(baseline.netProfit).toBeCloseTo(80.6, 10);
    expect(sale.returnLoss).toBeCloseTo(80.6 - 31.6, 10);
    expect(sale.returnLoss).toBeCloseTo(49, 10);
  });

  it('devolve a unidade ao estoque do lote', () => {
    const batch = calculatePurchase(BATCH_53, [SALE_A], settings(), [ret]);
    expect(batch.quantityConsumed).toBe(3 - 1);
    expect(batch.returnedToStock).toBe(1);
    expect(batch.currentStock).toBe(10 - 2);
  });

  it('decompõe o prejuízo por devolução de forma aditiva exata', () => {
    const [computed] = [ret].map(r => computeReturn(r, [SALE_A], [BATCH_53]));
    // 90 (receita devolvida) + 12 (frete) − 53 (custo liberado)
    expect(computed!.lossAmount).toBeCloseTo(90 + 12 - 53, 10);
    expect(computed!.lossAmount).toBeCloseTo(sale.returnLoss, 10);
    expect(computed!.costReleased).toBe(53);
  });
});

describe('devoluções — cenário (b) destino Perda, total', () => {
  const ret = finalized({
    id: 'D002', saleId: 'V003', batchId: 'C002', quantity: 1,
    destination: 'Perda', returnShipping: 0,
  });
  const sale = calculateSale(SALE_B, [BATCH_10], [ret]);

  it('zera o faturamento mas mantém taxa e frete como prejuízo', () => {
    expect(sale.grossRevenue).toBe(0);
    expect(sale.feeAmount).toBeCloseTo(30 * 0.12, 10);
    expect(sale.netRevenue).toBeCloseTo(0 - 3.6 + 2, 10);
  });

  it('mantém o custo da mercadoria — o produto não volta vendável', () => {
    expect(sale.costedQuantity).toBe(1);
    expect(sale.proportionalCost).toBe(10);
    expect(sale.netProfit).toBeCloseTo(-1.6 - 10, 10);
  });

  it('usa o bruto original como base da margem quando a venda foi 100% devolvida', () => {
    // Sem o fallback isto seria 0/0 → 0%, escondendo o prejuízo.
    expect(sale.netMargin).toBeCloseTo(-11.6 / 30, 10);
  });

  it('marca a venda como Devolvida e a mantém nos agregados', () => {
    expect(sale.effectiveStatus).toBe<SaleStatus>('Devolvida');
    expect(sale.countsAsRevenue).toBe(true);
  });

  it('não devolve a unidade ao estoque', () => {
    const batch = calculatePurchase(BATCH_10, [SALE_B], settings(), [ret]);
    expect(batch.returnedToStock).toBe(0);
    expect(batch.quantityConsumed).toBe(1);
    expect(batch.currentStock).toBe(5 - 1);
  });

  it('reconcilia a decomposição', () => {
    const computed = computeReturn(ret, [SALE_B], [BATCH_10]);
    expect(computed.costReleased).toBe(0);
    expect(computed.lossAmount).toBeCloseTo(30, 10);
    expect(computed.lossAmount).toBeCloseTo(sale.returnLoss, 10);
  });
});

describe('devoluções — cenário (c) destino Ressarcido: returnLoss NEGATIVO', () => {
  const ret = finalized({
    id: 'D003', saleId: 'V001', batchId: 'C001', quantity: 1,
    destination: 'Ressarcido', returnShipping: 0, refundedAmount: 100,
  });
  const sale = calculateSale(SALE_C, [BATCH_53], [ret]);

  it('reverte o desconto proporcionalmente', () => {
    // Desconto de 5 numa venda de 2 un., devolvendo 1 ⇒ metade some.
    expect(sale.netRevenue).toBeCloseTo(100 - 20 - 15 - 2.5 + 100, 10);
  });

  it('mantém o custo e deixa a compensação por conta do valor ressarcido', () => {
    expect(sale.costedQuantity).toBe(2);
    expect(sale.proportionalCost).toBe(2 * 53);
    expect(sale.netProfit).toBeCloseTo(162.5 - 106, 10);
  });

  it('produz prejuízo NEGATIVO — o vendedor sai à frente e nada pode clampar isso', () => {
    const baseline = calculateSale(SALE_C, [BATCH_53]);
    expect(baseline.netProfit).toBeCloseTo(54, 10);
    expect(sale.returnLoss).toBeCloseTo(54 - 56.5, 10);
    expect(sale.returnLoss).toBeLessThan(0);
    expect(sale.returnLoss).toBeCloseTo(-2.5, 10);
  });

  it('reconcilia a decomposição, inclusive negativa', () => {
    const computed = computeReturn(ret, [SALE_C], [BATCH_53]);
    // 100 (receita devolvida) − 2,5 (desconto revertido) − 100 (ressarcimento)
    expect(computed.lossAmount).toBeCloseTo(100 - 2.5 - 100, 10);
    expect(computed.lossAmount).toBeCloseTo(sale.returnLoss, 10);
  });

  it('expõe a taxa retida como informativo, fora do prejuízo', () => {
    const computed = computeReturn(ret, [SALE_C], [BATCH_53]);
    expect(computed.retainedFee).toBeCloseTo(100 * 0.10, 10);
    // A taxa cancela no contrafactual — somá-la ao lossAmount seria contagem dupla.
    expect(computed.lossAmount).not.toBeCloseTo(computed.lossAmount + computed.retainedFee, 10);
  });
});

describe('devoluções — cenário (d) destino Fornecedor', () => {
  const ret = finalized({
    id: 'D004', saleId: 'V001', batchId: 'C001', quantity: 1,
    destination: 'Fornecedor', returnShipping: 7, refundedAmount: 1 * 100,
  });

  it('trata custo e estoque como Perda, compensando só via valor ressarcido', () => {
    const sale = calculateSale(SALE_C, [BATCH_53], [ret]);
    const computed = computeReturn(ret, [SALE_C], [BATCH_53]);
    expect(sale.costedQuantity).toBe(2);
    expect(computed.costReleased).toBe(0);
    const batch = calculatePurchase(BATCH_53, [SALE_C], settings(), [ret]);
    expect(batch.returnedToStock).toBe(0);
  });

  it('com ressarcimento igual à receita devolvida, sobra o frete menos o desconto revertido', () => {
    const computed = computeReturn(ret, [SALE_C], [BATCH_53]);
    expect(computed.lossAmount).toBeCloseTo(100 - 2.5 + 7 - 100, 10);
  });
});

describe('devoluções — cenário (e) duas devoluções na mesma venda', () => {
  const toStock = finalized({
    id: 'D001', saleId: 'V002', quantity: 1, destination: 'Estoque', returnShipping: 12,
  });
  const toLoss = finalized({
    id: 'D005', saleId: 'V002', quantity: 1, destination: 'Perda', returnShipping: 3,
  });
  const returns = [toStock, toLoss];

  it('combina as quantidades e separa estoque de custo', () => {
    const sale = calculateSale(SALE_A, [BATCH_53], returns);
    expect(sale.returnedQuantity).toBe(2);
    expect(sale.returnedToStockQuantity).toBe(1);
    expect(sale.effectiveQuantity).toBe(1);
    expect(sale.costedQuantity).toBe(2);
    expect(sale.returnShippingTotal).toBe(12 + 3);
    expect(sale.returnCount).toBe(2);
  });

  it('escala desconto e estorno pelo ratio COMBINADO, não por devolução', () => {
    const withAdjustments: Sale = { ...SALE_A, discount: 30, estorno: 60 };
    const sale = calculateSale(withAdjustments, [BATCH_53], returns);
    const baseline = calculateSale(withAdjustments, [BATCH_53]);
    // ratio = 2/3 ⇒ sobra 1/3 de cada: desconto 10, estorno 20.
    const expectedNet = 1 * 90 - 3 * 90 * 0.12 + 4 + 20 - 10 - 2 - 15;
    expect(sale.netRevenue).toBeCloseTo(expectedNet, 10);
    expect(baseline.netRevenue).toBeCloseTo(270 - 32.4 + 4 + 60 - 30 - 2, 10);
  });

  it('mantém a identidade Σ lossAmount = returnLoss da venda', () => {
    const sale = calculateSale(SALE_A, [BATCH_53], returns);
    const soma = returns
      .map(r => computeReturn(r, [SALE_A], [BATCH_53]).lossAmount)
      .reduce((a, b) => a + b, 0);
    expect(soma).toBeCloseTo(sale.returnLoss, 10);
  });

  it('consome o lote apenas nas unidades que não voltaram', () => {
    const batch = calculatePurchase(BATCH_53, [SALE_A], settings(), returns);
    expect(batch.quantityConsumed).toBe(3 - 1);
    expect(batch.currentStock).toBe(10 - 2);
  });
});

describe('devoluções — cenário (f) Solicitado não move nenhum valor', () => {
  const pending = makeReturn({
    id: 'D009', saleId: 'V002', quantity: 2, destination: 'Estoque',
    returnShipping: 30, refundedAmount: 500, arrivalDate: undefined,
  });

  it('produz números byte-idênticos à venda sem devolução', () => {
    const baseline = calculateSale(SALE_A, [BATCH_53]);
    const withPending = calculateSale(SALE_A, [BATCH_53], [pending]);
    const money = (s: typeof baseline) => ({
      grossRevenue: s.grossRevenue, netRevenue: s.netRevenue,
      proportionalCost: s.proportionalCost, netProfit: s.netProfit,
      netMargin: s.netMargin, feeAmount: s.feeAmount,
      countsAsRevenue: s.countsAsRevenue, effectiveStatus: s.effectiveStatus,
      returnLoss: s.returnLoss,
    });
    expect(money(withPending)).toEqual(money(baseline));
  });

  it('não altera o estoque do lote', () => {
    const baseline = calculatePurchase(BATCH_53, [SALE_A], settings());
    const withPending = calculatePurchase(BATCH_53, [SALE_A], settings(), [pending]);
    expect(withPending.currentStock).toBe(baseline.currentStock);
    expect(withPending.returnedToStock).toBe(0);
  });

  it('expõe apenas quantidade e valor em risco', () => {
    const sale = calculateSale(SALE_A, [BATCH_53], [pending]);
    expect(sale.pendingReturnQuantity).toBe(2);
    expect(sale.pendingReturnValue).toBe(2 * 90);
    expect(sale.returnedQuantity).toBe(0);
  });

  it('marca o status derivado como Solicitado', () => {
    expect(returnStatusOf(pending)).toBe('Solicitado');
    expect(computeReturn(pending, [SALE_A], [BATCH_53]).status).toBe('Solicitado');
  });
});

describe('devoluções — guardas e casos-limite', () => {
  it('(g) clampa devolução maior que a quantidade vendida', () => {
    const absurd = finalized({ saleId: 'V003', quantity: 1 + 5, destination: 'Estoque' });
    const sale = calculateSale(SALE_B, [BATCH_10], [absurd]);
    expect(sale.returnedQuantity).toBe(1);
    expect(sale.effectiveQuantity).toBe(0);
    expect(sale.grossRevenue).toBe(0);
    expect(sale.grossRevenue).toBeGreaterThanOrEqual(0);
    expect(sale.costedQuantity).toBeGreaterThanOrEqual(0);
  });

  it('(i) não gera NaN quando a venda tem quantidade zero', () => {
    const zeroQty: Sale = { ...SALE_B, quantitySold: 0 };
    const ret = finalized({ saleId: 'V003', quantity: 1 });
    const sale = calculateSale(zeroQty, [BATCH_10], [ret]);
    for (const value of [
      sale.grossRevenue, sale.netRevenue, sale.proportionalCost,
      sale.netProfit, sale.netMargin, sale.returnLoss,
    ]) {
      expect(Number.isNaN(value)).toBe(false);
    }
    expect(sale.netMargin).toBe(0);
  });

  it('(l) devolução órfã não quebra e não gera prejuízo fantasma', () => {
    const orphan = finalized({ id: 'D404', saleId: 'V999' });
    const computed = computeReturn(orphan, [SALE_A], [BATCH_53]);
    expect(computed.orphan).toBe(true);
    expect(computed.lossAmount).toBe(0);
    // E a venda existente segue intocada.
    expect(calculateSale(SALE_A, [BATCH_53], [orphan]).netProfit)
      .toBeCloseTo(calculateSale(SALE_A, [BATCH_53]).netProfit, 10);
  });

  it('(j) resolutionDays: mesmo dia = 0, chegada anterior clampa, ausente = null', () => {
    expect(resolutionDaysOf(makeReturn({ requestDate: '2026-02-05', arrivalDate: '2026-02-05' }))).toBe(0);
    expect(resolutionDaysOf(makeReturn({ requestDate: '2026-02-05', arrivalDate: '2026-02-12' }))).toBe(7);
    expect(resolutionDaysOf(makeReturn({ requestDate: '2026-02-05', arrivalDate: '2026-02-01' }))).toBe(0);
    expect(resolutionDaysOf(makeReturn({ requestDate: '2026-02-05' }))).toBeNull();
  });

  it('(m) gera ids sequenciais com o prefixo D', () => {
    expect(nextId([], 'D')).toBe('D001');
    expect(nextId(['D001', 'D002'], 'D')).toBe('D003');
  });

  it('remainingReturnable considera Solicitado E Finalizado, e ignora a própria na edição', () => {
    const rs = [
      finalized({ id: 'D001', saleId: 'V002', quantity: 1 }),
      makeReturn({ id: 'D002', saleId: 'V002', quantity: 1, arrivalDate: undefined }),
    ];
    expect(remainingReturnable(SALE_A, rs)).toBe(3 - 2);
    expect(remainingReturnable(SALE_A, rs, 'D002')).toBe(3 - 1);
  });
});

describe('(h) countsAsRevenue — matriz status × devoluções', () => {
  const statuses: SaleStatus[] = ['Concluída', 'Cancelada', 'Devolvida', 'Em disputa'];
  const cases: Array<[string, Return[]]> = [
    ['sem devolução', []],
    ['só pendente', [makeReturn({ saleId: 'V001', arrivalDate: undefined })]],
    ['finalizada', [finalized({ saleId: 'V001' })]],
  ];

  for (const status of statuses) {
    for (const [label, returns] of cases) {
      const expected = status === 'Concluída' || (status === 'Devolvida' && label === 'finalizada');
      it(`${status} / ${label} ⇒ ${expected}`, () => {
        const sale = makeSale({ id: 'V001', status });
        expect(countsAsRevenue(sale, returns)).toBe(expected);
      });
    }
  }

  it('venda legada Devolvida SEM devoluções continua excluída dos KPIs', () => {
    const legacy = makeSale({ id: 'V001', status: 'Devolvida', quantitySold: 2, unitPrice: 100 });
    const computed = calculateSale(legacy, [BATCH_53]);
    const kpis = calculateKpis([], [computed]);
    expect(computed.countsAsRevenue).toBe(false);
    expect(kpis.grossRevenue).toBe(0);
    expect(kpis.netProfit).toBe(0);
  });

  it('venda legada Devolvida SEM devoluções continua liberando o estoque', () => {
    const legacy = makeSale({ id: 'V001', batchId: 'C001', status: 'Devolvida', quantitySold: 4 });
    const batch = calculatePurchase(BATCH_53, [legacy], settings());
    expect(batch.currentStock).toBe(10);
    expect(batch.quantityConsumed).toBe(0);
  });
});

describe('(k) identidade de reconciliação por venda e por KPI', () => {
  const returns = [
    finalized({ id: 'D001', saleId: 'V002', quantity: 1, destination: 'Estoque', returnShipping: 12 }),
    finalized({ id: 'D002', saleId: 'V003', quantity: 1, destination: 'Perda' }),
    finalized({ id: 'D003', saleId: 'V001', quantity: 1, destination: 'Ressarcido', refundedAmount: 100 }),
    makeReturn({ id: 'D004', saleId: 'V002', quantity: 1, destination: 'Fornecedor', returnShipping: 8, arrivalDate: undefined }),
  ];
  const sales = [SALE_C, SALE_A, SALE_B];
  const purchases = [BATCH_53, BATCH_10];

  it('Σ lossAmount das finalizadas = Σ returnLoss das vendas = KPI returnLoss', () => {
    const computedSales = sales.map(s => calculateSale(s, purchases, returns));
    const computedPurchases = purchases.map(p => calculatePurchase(p, sales, settings(), returns));
    const kpis = calculateKpis(computedPurchases, computedSales);

    const somaPorDevolucao = returns
      .filter(r => r.arrivalDate)
      .map(r => computeReturn(r, sales, purchases).lossAmount)
      .reduce((a, b) => a + b, 0);
    const somaPorVenda = computedSales.reduce((a, s) => a + s.returnLoss, 0);

    expect(somaPorDevolucao).toBeCloseTo(49 + 30 - 2.5, 10);
    expect(somaPorVenda).toBeCloseTo(somaPorDevolucao, 10);
    expect(kpis.returnLoss).toBeCloseTo(somaPorVenda, 10);
  });

  it('returnLoss do KPI = lucro sem devoluções − lucro com devoluções', () => {
    const withReturns = calculateKpis(
      purchases.map(p => calculatePurchase(p, sales, settings(), returns)),
      sales.map(s => calculateSale(s, purchases, returns)),
    );
    const baseline = calculateKpis(
      purchases.map(p => calculatePurchase(p, sales, settings())),
      sales.map(s => calculateSale(s, purchases)),
    );
    expect(withReturns.returnLoss).toBeCloseTo(baseline.netProfit - withReturns.netProfit, 10);
  });

  it('agrega as métricas de devolução no KPI', () => {
    const kpis = calculateKpis(
      purchases.map(p => calculatePurchase(p, sales, settings(), returns)),
      sales.map(s => calculateSale(s, purchases, returns)),
    );
    expect(kpis.grossUnitsSold).toBe(2 + 3 + 1);
    expect(kpis.returnedUnits).toBe(3);
    expect(kpis.totalSold).toBe(6 - 3);
    expect(kpis.returnRate).toBeCloseTo(3 / 6, 10);
    expect(kpis.returnCount).toBe(3);
    expect(kpis.returnShippingCost).toBe(12);
    expect(kpis.returnRefunds).toBe(100);
    expect(kpis.pendingReturnValue).toBe(1 * 90);
    expect(kpis.pendingReturnCount).toBe(1);
    expect(kpis.returnedRevenue).toBe(100 + 90 + 30);
  });
});
