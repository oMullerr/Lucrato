/**
 * Overlay de devoluções sobre o golden dataset.
 *
 * Reusa EXATAMENTE as mesmas compras e vendas de `golden-dataset.ts` — o
 * dataset base não é tocado, para que as specs existentes continuem provando
 * que dado sem devolução não mudou de valor.
 *
 * As três devoluções finalizadas caem sobre V001/V002/V003, que já exercitam
 * Correios, Flex, desconto e outros custos, cobrindo todas as combinações do
 * motor numa base só. Cada número abaixo foi calculado à mão.
 *
 * ── Devoluções ───────────────────────────────────────────────────────────────
 *  D001 → V002  q=1  'Estoque'     FINALIZADA  frete 12  ressarc. —    perda  38,87
 *  D002 → V003  q=1  'Perda'       FINALIZADA  frete  0  ressarc. 0    perda  28,40  (V003 → Devolvida)
 *  D003 → V001  q=1  'Ressarcido'  FINALIZADA  frete  0  ressarc. 100  perda  −20,00
 *  D004 → V002  q=1  'Fornecedor'  SOLICITADA  frete  8  ressarc. —    perda   0 (em risco 90)
 */
import type { Database, Return } from '../app/core/models/models';
import { goldenDb, EXPECTED } from './golden-dataset';
import { makeReturn } from './fixtures';

export const GOLDEN_RETURNS: Return[] = [
  makeReturn({
    id: 'D001', saleId: 'V002', batchId: 'C001', product: 'Fone BT', channel: 'Shopee',
    quantity: 1, requestDate: '2026-05-25', arrivalDate: '2026-06-02',
    returnShipping: 12, destination: 'Estoque', reason: 'Defeito',
  }),
  makeReturn({
    id: 'D002', saleId: 'V003', batchId: 'C002', product: 'Caneca', channel: 'Mercado Livre',
    quantity: 1, requestDate: '2026-06-11', arrivalDate: '2026-06-14',
    returnShipping: 0, destination: 'Perda', refundedAmount: 0, reason: 'Avaria no transporte',
  }),
  makeReturn({
    id: 'D003', saleId: 'V001', batchId: 'C001', product: 'Fone BT', channel: 'Mercado Livre',
    quantity: 1, requestDate: '2026-02-14', arrivalDate: '2026-02-20',
    returnShipping: 0, destination: 'Ressarcido', refundedAmount: 100, reason: 'Não conforme',
  }),
  // SOLICITADA: não pode mover nenhum valor, só aparecer como risco.
  makeReturn({
    id: 'D004', saleId: 'V002', batchId: 'C001', product: 'Fone BT', channel: 'Shopee',
    quantity: 1, requestDate: '2026-06-12', arrivalDate: undefined,
    returnShipping: 8, destination: 'Fornecedor', reason: 'Arrependimento',
  }),
];

export function goldenReturnsDb(overrides: Partial<Database> = {}): Database {
  return goldenDb({ returns: GOLDEN_RETURNS, ...overrides });
}

/* ── Valores esperados: cada um é a expressão que o define ── */

const unit = EXPECTED.unit;

/** Prejuízo por devolução (decomposição aditiva). */
const loss = {
  // 90 (receita devolvida) − 10,80 (taxa estornada) + 1,33 (1/3 do Flex que some)
  //   − 0,67 (1/3 dos outros custos revertidos) + 12 (frete) − 53 (custo ao estoque)
  D001: 1 * 90 - 1 * 90 * 0.12 + (1 / 3) * 4 - (1 / 3) * 2 + 12 - unit.C001,
  // 30 (receita devolvida) − 3,60 (taxa estornada) + 2 (Flex que some);
  // destino Perda não libera custo
  D002: 1 * 30 - 1 * 30 * 0.12 + 2,
  // 100 (receita) − 10 (taxa estornada) − 7,50 (metade do frete que volta)
  //   − 2,50 (metade do desconto) − 100 (ressarcimento)
  D003: 1 * 100 - 1 * 100 * 0.10 - (1 / 2) * 15 - (1 / 2) * 5 - 100,
};

export const EXPECTED_RETURNS = {
  loss,

  /** Receita bruta EFETIVA por venda afetada. */
  gross: {
    V001: 1 * 100,  // 2 − 1 devolvida
    V002: 2 * 90,   // 3 − 1 devolvida (a Solicitada não conta)
    V003: 0 * 30,   // 100% devolvida
  },

  kpis: {
    // 710 − (100 + 90 + 30)
    grossRevenue: EXPECTED.kpis.grossRevenue - (100 + 90 + 30),
    // Δ receita líquida = −(lossAmount + custo liberado): o CMV sai do LUCRO,
    // não da receita, então só D001 precisa somar o custo de volta.
    netRevenue: EXPECTED.kpis.netRevenue - (loss.D001 + unit.C001) - loss.D002 - loss.D003,
    // 388 − 53: só D001 (destino Estoque) libera custo
    proportionalCost: EXPECTED.kpis.proportionalCost - unit.C001,
    // 189 − 38,87 − 28,40 + 20
    netProfit: EXPECTED.kpis.netProfit - loss.D001 - loss.D002 - loss.D003,
    returnLoss: loss.D001 + loss.D002 + loss.D003,

    totalSold: EXPECTED.kpis.totalSold - 3,
    grossUnitsSold: EXPECTED.kpis.totalSold,
    returnedUnits: 3,
    returnRate: 3 / EXPECTED.kpis.totalSold,
    returnCount: 3,
    returnedRevenue: 100 + 90 + 30,
    returnShippingCost: 12,
    returnRefunds: 100,
    pendingReturnCount: 1,
    pendingReturnValue: 1 * 90,

    // C001 volta de 4 para 5 un. (só D001 devolve ao estoque)
    idleCapital: EXPECTED.kpis.idleCapital + unit.C001,
    // Devoluções não mexem no capital investido nos lotes.
    totalInvested: EXPECTED.kpis.totalInvested,
    // V003 (100% devolvida) sai do denominador do ticket médio.
    averageTicket: (710 - 220) / 5,
  },

  inventory: {
    stockC001: EXPECTED.inventory.stockById.C001 + 1,
    stockC002: EXPECTED.inventory.stockById.C002,
    consumedC001: 2 + 2 + 1, // V001 2, V002 2 (1 voltou), V007 1
  },

  /** Faturamento MEI: 590 − 220. */
  fiscal: {
    revenue2026: EXPECTED.fiscal.revenue2026 - (100 + 90 + 30),
    revenue2025: EXPECTED.fiscal.revenue2025,
    monthly2026: {
      feb: 1 * 100,
      may: 2 * 90,
      jun: 0 + 50 + 40, // V003 zerada, V005 e V007 intactas
    },
  },
};
