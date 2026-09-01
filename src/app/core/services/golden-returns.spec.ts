/**
 * Propagação ponta a ponta das devoluções sobre o golden dataset.
 *
 * Prova, com valores calculados à mão, que uma devolução atravessa corretamente
 * motor → KPIs → estoque → fiscal, e que a base SEM devoluções permanece
 * exatamente com os números de antes da feature.
 */
import { calculatePurchase, calculateSale, calculateKpis, computeReturn } from './calculations';
import { annualGrossRevenue, monthlyGrossRevenue } from '../fiscal/fiscal';
import { goldenDb, EXPECTED, FROZEN_NOW } from '../../../testing/golden-dataset';
import { goldenReturnsDb, GOLDEN_RETURNS, EXPECTED_RETURNS } from '../../../testing/golden-returns';
import type { Database, ComputedSale, ComputedPurchase } from '../models/models';

function compute(db: Database): { sales: ComputedSale[]; purchases: ComputedPurchase[] } {
  return {
    sales: db.sales.map(s => calculateSale(s, db.purchases, db.returns)),
    purchases: db.purchases.map(p => calculatePurchase(p, db.sales, db.settings, db.returns)),
  };
}

describe('golden dataset — regressão sem devoluções', () => {
  const db = goldenDb();
  const { sales, purchases } = compute(db);
  const kpis = calculateKpis(purchases, sales);

  it('mantém todos os KPIs idênticos aos de antes da feature', () => {
    expect(db.returns).toEqual([]);
    expect(kpis.grossRevenue).toBeCloseTo(EXPECTED.kpis.grossRevenue, 10);
    expect(kpis.netRevenue).toBeCloseTo(EXPECTED.kpis.netRevenue, 10);
    expect(kpis.netProfit).toBeCloseTo(EXPECTED.kpis.netProfit, 10);
    expect(kpis.idleCapital).toBeCloseTo(EXPECTED.kpis.idleCapital, 10);
    expect(kpis.totalInvested).toBeCloseTo(EXPECTED.kpis.totalInvested, 10);
    expect(kpis.totalSold).toBe(EXPECTED.kpis.totalSold);
    expect(kpis.averageTicket).toBeCloseTo(EXPECTED.kpis.averageTicket, 10);
  });

  it('zera todas as métricas novas de devolução', () => {
    expect(kpis.returnLoss).toBe(0);
    expect(kpis.returnedUnits).toBe(0);
    expect(kpis.returnRate).toBe(0);
    expect(kpis.returnCount).toBe(0);
    expect(kpis.pendingReturnValue).toBe(0);
    expect(kpis.returnedRevenue).toBe(0);
  });

  it('mantém o faturamento fiscal', () => {
    expect(annualGrossRevenue(sales, 2026)).toBeCloseTo(EXPECTED.fiscal.revenue2026, 10);
    expect(annualGrossRevenue(sales, 2025)).toBeCloseTo(EXPECTED.fiscal.revenue2025, 10);
  });
});

describe('golden overlay — com devoluções', () => {
  const db = goldenReturnsDb();
  const { sales, purchases } = compute(db);
  const kpis = calculateKpis(purchases, sales);
  const byId = (id: string) => sales.find(s => s.id === id)!;
  const batch = (id: string) => purchases.find(p => p.id === id)!;
  const E = EXPECTED_RETURNS;

  describe('por venda', () => {
    it('V001 (Ressarcido) perde 1 de 2 un. e sai no positivo', () => {
      expect(byId('V001').grossRevenue).toBeCloseTo(E.gross.V001, 10);
      expect(byId('V001').returnLoss).toBeCloseTo(E.loss.D003, 10);
      expect(byId('V001').returnLoss).toBeLessThan(0);
      expect(byId('V001').effectiveStatus).toBe('Concluída');
    });

    it('V002 (Estoque) ignora a devolução ainda Solicitada', () => {
      expect(byId('V002').grossRevenue).toBeCloseTo(E.gross.V002, 10);
      expect(byId('V002').returnedQuantity).toBe(1);
      expect(byId('V002').pendingReturnQuantity).toBe(1);
      expect(byId('V002').pendingReturnValue).toBe(90);
      expect(byId('V002').returnLoss).toBeCloseTo(E.loss.D001, 10);
    });

    it('V003 (Perda, total) zera a receita mas continua nos agregados', () => {
      expect(byId('V003').grossRevenue).toBe(E.gross.V003);
      expect(byId('V003').effectiveStatus).toBe('Devolvida');
      expect(byId('V003').countsAsRevenue).toBe(true);
      expect(byId('V003').returnLoss).toBeCloseTo(E.loss.D002, 10);
    });

    it('não toca nas vendas sem devolução', () => {
      for (const id of ['V005', 'V006', 'V007']) {
        expect(byId(id).returnLoss).toBe(0);
        expect(byId(id).grossRevenue).toBeCloseTo(byId(id).originalGrossRevenue, 10);
      }
    });

    it('V004 (Cancelada) segue fora dos agregados', () => {
      expect(byId('V004').countsAsRevenue).toBe(false);
    });
  });

  describe('KPIs consolidados', () => {
    it.each([
      ['grossRevenue', 490],
      ['netRevenue', 447.5],
      ['netProfit', 112.5],
      ['returnLoss', 76.5],
    ] as const)('%s = %d', (key, value) => {
      expect(kpis[key] as number).toBeCloseTo(value, 10);
      expect(E.kpis[key] as number).toBeCloseTo(value, 10);
    });

    it('custo proporcional cai só o da unidade que voltou ao estoque', () => {
      // KpiSummary expõe grossProfit; o CMV é a diferença para a receita bruta.
      const proportionalCost = kpis.grossRevenue - kpis.grossProfit;
      expect(proportionalCost).toBeCloseTo(335, 10);
      expect(proportionalCost).toBeCloseTo(E.kpis.proportionalCost, 10);
    });

    it('netProfit fecha com netRevenue − CMV', () => {
      expect(kpis.netProfit).toBeCloseTo(
        kpis.netRevenue - (kpis.grossRevenue - kpis.grossProfit), 10,
      );
    });

    it('returnLoss = lucro sem devoluções − lucro com devoluções', () => {
      expect(kpis.returnLoss).toBeCloseTo(EXPECTED.kpis.netProfit - kpis.netProfit, 10);
    });

    it('agrega quantidades e valores de devolução', () => {
      expect(kpis.totalSold).toBe(E.kpis.totalSold);
      expect(kpis.grossUnitsSold).toBe(E.kpis.grossUnitsSold);
      expect(kpis.returnedUnits).toBe(E.kpis.returnedUnits);
      expect(kpis.returnRate).toBeCloseTo(E.kpis.returnRate, 10);
      expect(kpis.returnCount).toBe(E.kpis.returnCount);
      expect(kpis.returnedRevenue).toBeCloseTo(E.kpis.returnedRevenue, 10);
      expect(kpis.returnShippingCost).toBe(E.kpis.returnShippingCost);
      expect(kpis.returnRefunds).toBe(E.kpis.returnRefunds);
      expect(kpis.pendingReturnCount).toBe(E.kpis.pendingReturnCount);
      expect(kpis.pendingReturnValue).toBe(E.kpis.pendingReturnValue);
    });

    it('não altera o capital investido nos lotes', () => {
      expect(kpis.totalInvested).toBeCloseTo(E.kpis.totalInvested, 10);
    });

    it('tira a venda 100% devolvida do denominador do ticket médio', () => {
      expect(kpis.averageTicket).toBeCloseTo(E.kpis.averageTicket, 10);
    });
  });

  describe('estoque', () => {
    it('só a devolução com destino Estoque devolve a unidade ao lote', () => {
      expect(batch('C001').currentStock).toBe(E.inventory.stockC001);
      expect(batch('C001').quantityConsumed).toBe(E.inventory.consumedC001);
      expect(batch('C001').returnedToStock).toBe(1);
    });

    it('Perda não repõe estoque', () => {
      expect(batch('C002').currentStock).toBe(E.inventory.stockC002);
      expect(batch('C002').returnedToStock).toBe(0);
    });

    it('capital parado sobe exatamente o custo da unidade devolvida', () => {
      expect(kpis.idleCapital).toBeCloseTo(E.kpis.idleCapital, 10);
    });
  });

  describe('fiscal / teto do MEI', () => {
    it('reduz o faturamento anual de 2026', () => {
      expect(annualGrossRevenue(sales, 2026)).toBeCloseTo(E.fiscal.revenue2026, 10);
      expect(E.fiscal.revenue2026).toBe(370);
    });

    it('não afeta 2025 (sem devoluções naquele ano)', () => {
      expect(annualGrossRevenue(sales, 2025)).toBeCloseTo(E.fiscal.revenue2025, 10);
    });

    it('atribui a redução ao mês da VENDA, não ao da devolução', () => {
      const monthly = monthlyGrossRevenue(sales, 2026);
      // D001 chegou em junho mas pertence à venda de maio.
      expect(monthly[4]!.revenue).toBeCloseTo(E.fiscal.monthly2026.may, 10);
      expect(monthly[1]!.revenue).toBeCloseTo(E.fiscal.monthly2026.feb, 10);
      expect(monthly[5]!.revenue).toBeCloseTo(E.fiscal.monthly2026.jun, 10);
    });

    it('mantém a venda 100% devolvida na base fiscal, contribuindo zero', () => {
      // Se billableSales a descartasse pelo status, o faturamento não cairia:
      // ela simplesmente sumiria, o que dá o mesmo número aqui mas quebraria
      // qualquer venda PARCIALMENTE devolvida. Este assert trava o contrato.
      expect(byId('V003').countsAsRevenue).toBe(true);
      expect(byId('V003').grossRevenue).toBe(0);
    });
  });

  describe('reconciliação por devolução', () => {
    it('Σ lossAmount das finalizadas = returnLoss do KPI', () => {
      const soma = GOLDEN_RETURNS
        .filter(r => r.arrivalDate)
        .map(r => computeReturn(r, db.sales, db.purchases, FROZEN_NOW).lossAmount)
        .reduce((a, b) => a + b, 0);
      expect(soma).toBeCloseTo(kpis.returnLoss, 10);
    });

    it('cada devolução bate com o valor calculado à mão', () => {
      const computed = (id: string) =>
        computeReturn(GOLDEN_RETURNS.find(r => r.id === id)!, db.sales, db.purchases, FROZEN_NOW);
      expect(computed('D001').lossAmount).toBeCloseTo(E.loss.D001, 10);
      expect(computed('D002').lossAmount).toBeCloseTo(E.loss.D002, 10);
      expect(computed('D003').lossAmount).toBeCloseTo(E.loss.D003, 10);
    });

    it('calcula prazo de resolução e dias pendentes', () => {
      const d001 = computeReturn(GOLDEN_RETURNS[0]!, db.sales, db.purchases, FROZEN_NOW);
      expect(d001.status).toBe('Finalizado');
      expect(d001.resolutionDays).toBe(8); // 25/05 → 02/06
      expect(d001.pendingDays).toBeNull();

      const d004 = computeReturn(GOLDEN_RETURNS[3]!, db.sales, db.purchases, FROZEN_NOW);
      expect(d004.status).toBe('Solicitado');
      expect(d004.resolutionDays).toBeNull();
      expect(d004.pendingDays).toBe(3); // 12/06 → 15/06 (FROZEN_NOW)
    });
  });
});
