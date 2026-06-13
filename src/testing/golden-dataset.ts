/**
 * Dataset "golden" — uma única base com valores esperados CALCULADOS À MÃO,
 * assertada em todas as camadas (funções puras → DataService → componentes).
 * Toda expectativa é uma expressão aritmética explícita, nunca um decimal pré-avaliado.
 *
 * Relógio congelado: FROZEN_NOW = 2026-06-15T12:00:00Z.
 * Datas escolhidas com ≥2 dias de folga das bordas de janela (7d/30d/90d),
 * então as asserções valem em qualquer fuso da máquina de teste.
 *
 * ── Compras (status em 2026-06-15, alertas: amarelo 25d / vermelho 30d) ──────────────
 *  C001 Fone BT       recebida 2026-01-15  10×50 +20+10 → unit 53,  vendidas 6, estoque 4 → Parado (151d)
 *  C002 Caneca        recebida 2026-05-25   5×10        → unit 10,  vendida 1, estoque 4 → Em Estoque (21d)
 *  C003 Cabo USB      SEM recebimento      20×5 +10     → unit 5.5, estoque 20           → Em trânsito
 *  C004 Capinha       recebida 2026-05-19   8×4         → unit 4,   estoque 8            → Atenção (27d)
 *  C005 Mouse         recebida 2025-11-10   2×30        → unit 30,  vendidas 2, estoque 0 → Vendido (congela no lastSale)
 *  C006 Brinde qty=0  recebida 2026-06-02   0×100 +50   → unit 0 (guard), estoque 0      → Vendido
 *
 * ── Vendas ───────────────────────────────────────────────────────────────────────────
 *  V001 C001 2×100 2026-02-10 fee10% correios15 desc5      → net 160,   custo 106, lucro  54
 *  V002 C001 3×90  2026-05-20 fee12% FLEX +4 (frete12 ignorado) outros2 → net 239.6, custo 159, lucro  80.6
 *  V003 C002 1×30  2026-06-10 fee12% FLEX +2 (frete5 ignorado)          → net 28.4,  custo 10,  lucro  18.4
 *  V004 C002 2×30  2026-06-05 fee12% correios8 CANCELADA   → fora de todos os KPIs (lucro computado 24.8 > 0)
 *  V005 C999 1×50  2026-06-12 fee10% correios10 LOTE ÓRFÃO → custo 0 (lacuna conhecida), lucro 35
 *  V006 C005 2×60  2025-12-15 fee10% correios10            → net 98,    custo 60,  lucro  38   (ano 2025)
 *  V007 C001 1×40  2026-06-01 fee10% correios20            → net 16,    custo 53,  lucro −37   (prejuízo)
 */
import type { Database, Purchase, Sale } from '../app/core/models/models';
import { makeFakeDatabase } from './firebase-mocks';
import { makePurchase, makeSale } from './fixtures';

export const FROZEN_NOW = new Date('2026-06-15T12:00:00Z');

export const GOLDEN_PURCHASES: Purchase[] = [
  makePurchase({
    id: 'C001', product: 'Fone BT', category: 'Eletrônicos', supplier: 'TechImport',
    purchaseDate: '2026-01-10', receiptDate: '2026-01-15',
    quantityPurchased: 10, unitCost: 50, purchaseShipping: 20, otherCosts: 10,
  }),
  makePurchase({
    id: 'C002', product: 'Caneca', category: 'Casa', supplier: 'CasaForte',
    purchaseDate: '2026-05-01', receiptDate: '2026-05-25',
    quantityPurchased: 5, unitCost: 10, purchaseShipping: 0, otherCosts: 0,
  }),
  makePurchase({
    id: 'C003', product: 'Cabo USB', category: 'Eletrônicos', supplier: 'TechImport',
    purchaseDate: '2026-06-01', receiptDate: undefined,
    quantityPurchased: 20, unitCost: 5, purchaseShipping: 10, otherCosts: 0,
  }),
  makePurchase({
    id: 'C004', product: 'Capinha', category: 'Acessórios', supplier: 'CasaForte',
    purchaseDate: '2026-05-15', receiptDate: '2026-05-19',
    quantityPurchased: 8, unitCost: 4, purchaseShipping: 0, otherCosts: 0,
  }),
  makePurchase({
    id: 'C005', product: 'Mouse', category: 'Eletrônicos', supplier: 'TechImport',
    purchaseDate: '2025-11-01', receiptDate: '2025-11-10',
    quantityPurchased: 2, unitCost: 30, purchaseShipping: 0, otherCosts: 0,
  }),
  makePurchase({
    id: 'C006', product: 'Brinde', category: 'Outros', supplier: 'CasaForte',
    purchaseDate: '2026-06-01', receiptDate: '2026-06-02',
    quantityPurchased: 0, unitCost: 100, purchaseShipping: 50, otherCosts: 0,
  }),
];

export const GOLDEN_SALES: Sale[] = [
  makeSale({
    id: 'V001', batchId: 'C001', product: 'Fone BT', quantitySold: 2, unitPrice: 100,
    saleDate: '2026-02-10', channel: 'Mercado Livre', feePercentage: 0.10,
    shippingType: 'correios', sellerShipping: 15, discount: 5, otherCosts: 0, status: 'Concluída',
  }),
  makeSale({
    id: 'V002', batchId: 'C001', product: 'Fone BT', quantitySold: 3, unitPrice: 90,
    saleDate: '2026-05-20', channel: 'Shopee', feePercentage: 0.12,
    shippingType: 'flex', flexRefund: 4, sellerShipping: 12, discount: 0, otherCosts: 2, status: 'Concluída',
  }),
  makeSale({
    id: 'V003', batchId: 'C002', product: 'Caneca', quantitySold: 1, unitPrice: 30,
    saleDate: '2026-06-10', channel: 'Mercado Livre', feePercentage: 0.12,
    shippingType: 'flex', flexRefund: 2, sellerShipping: 5, discount: 0, otherCosts: 0, status: 'Concluída',
  }),
  makeSale({
    id: 'V004', batchId: 'C002', product: 'Caneca', quantitySold: 2, unitPrice: 30,
    saleDate: '2026-06-05', channel: 'Mercado Livre', feePercentage: 0.12,
    shippingType: 'correios', sellerShipping: 8, discount: 0, otherCosts: 0, status: 'Cancelada',
  }),
  makeSale({
    id: 'V005', batchId: 'C999', product: 'Suporte Articulado de Parede TV', quantitySold: 1, unitPrice: 50,
    saleDate: '2026-06-12', channel: 'Mercado Livre', feePercentage: 0.10,
    shippingType: 'correios', sellerShipping: 10, discount: 0, otherCosts: 0, status: 'Concluída',
  }),
  makeSale({
    id: 'V006', batchId: 'C005', product: 'Mouse', quantitySold: 2, unitPrice: 60,
    saleDate: '2025-12-15', channel: 'Shopee', feePercentage: 0.10,
    shippingType: 'correios', sellerShipping: 10, discount: 0, otherCosts: 0, status: 'Concluída',
  }),
  makeSale({
    id: 'V007', batchId: 'C001', product: 'Fone BT', quantitySold: 1, unitPrice: 40,
    saleDate: '2026-06-01', channel: 'Mercado Livre', feePercentage: 0.10,
    shippingType: 'correios', sellerShipping: 20, discount: 0, otherCosts: 0, status: 'Concluída',
  }),
];

export function goldenDb(overrides: Partial<Database> = {}): Database {
  const base = makeFakeDatabase();
  return {
    ...base,
    purchases: GOLDEN_PURCHASES,
    sales: GOLDEN_SALES,
    settings: {
      ...base.settings,
      categories: ['Eletrônicos', 'Casa', 'Acessórios', 'Outros'],
      suppliers: ['TechImport', 'CasaForte'],
      channels: ['Mercado Livre', 'Shopee', 'Outro'],
      fiscal: { regime: 'MEI', activity: 'commerce' },
      ...(overrides.settings ?? {}),
    },
    ...overrides,
  };
}

/* ── Valores esperados (mão na massa: cada número é a expressão que o define) ── */

// Custos unitários reais por lote
const unit = {
  C001: (10 * 50 + 20 + 10) / 10, // 53
  C002: (5 * 10 + 0 + 0) / 5,     // 10
  C003: (20 * 5 + 10 + 0) / 20,   // 5.5
  C004: (8 * 4 + 0 + 0) / 8,      // 4
  C005: (2 * 30 + 0 + 0) / 2,     // 30
  C006: 0,                        // guard qty=0
};

// Vendas concluídas — receita líquida e lucro líquido por venda
const v = {
  V001: { gross: 2 * 100, fee: 2 * 100 * 0.10, net: 200 - 20 - 15 - 5 - 0, cost: 2 * unit.C001, profit: 160 - 106 },
  V002: { gross: 3 * 90, fee: 3 * 90 * 0.12, net: 270 - 32.4 + 4 - 0 - 2, cost: 3 * unit.C001, profit: 239.6 - 159 },
  V003: { gross: 1 * 30, fee: 1 * 30 * 0.12, net: 30 - 3.6 + 2 - 0 - 0, cost: 1 * unit.C002, profit: 28.4 - 10 },
  // V004 cancelada — campos computados existem mas ficam fora dos KPIs:
  V004: { gross: 2 * 30, fee: 2 * 30 * 0.12, net: 60 - 7.2 - 8 - 0 - 0, cost: 2 * unit.C002, profit: 44.8 - 20 },
  V005: { gross: 1 * 50, fee: 1 * 50 * 0.10, net: 50 - 5 - 10 - 0 - 0, cost: 0, profit: 35 - 0 },
  V006: { gross: 2 * 60, fee: 2 * 60 * 0.10, net: 120 - 12 - 10 - 0 - 0, cost: 2 * unit.C005, profit: 98 - 60 },
  V007: { gross: 1 * 40, fee: 1 * 40 * 0.10, net: 40 - 4 - 20 - 0 - 0, cost: 1 * unit.C001, profit: 16 - 53 },
};

export const EXPECTED = {
  unit,
  sale: v,

  /** KPIs globais (apenas Concluídas; V004 fora). */
  kpis: {
    totalInvested: 530 + 50 + 110 + 32 + 60 + 50,
    idleCapital: 4 * unit.C001 + 4 * unit.C002 + 20 * unit.C003 + 8 * unit.C004, // 212+40+110+32 = 394
    grossRevenue: v.V001.gross + v.V002.gross + v.V003.gross + v.V005.gross + v.V006.gross + v.V007.gross, // 710
    totalFees: v.V001.fee + v.V002.fee + v.V003.fee + v.V005.fee + v.V006.fee + v.V007.fee,                // 77
    totalShipping: 15 + 10 + 10 + 20,  // correios das concluídas (flex ignora sellerShipping)
    totalFlexRefund: 4 + 2,
    totalDiscounts: 5,
    totalOtherCosts: 2,
    netRevenue: v.V001.net + v.V002.net + v.V003.net + v.V005.net + v.V006.net + v.V007.net,               // 577
    proportionalCost: v.V001.cost + v.V002.cost + v.V003.cost + v.V005.cost + v.V006.cost + v.V007.cost,   // 388
    netProfit: v.V001.profit + v.V002.profit + v.V003.profit + v.V005.profit + v.V006.profit + v.V007.profit, // 189
    grossProfit: 710 - 388,
    netMargin: 189 / 710,
    totalSold: 2 + 3 + 1 + 1 + 2 + 1,
    totalBatches: 6,
    batchesInStock: 4,   // C001, C002, C003, C004
    soldBatches: 2,      // C005, C006
    averageTicket: 710 / 6,
  },

  /** Estoque e status por lote em FROZEN_NOW. */
  inventory: {
    statusById: {
      C001: 'Parado', C002: 'Em Estoque', C003: 'Em trânsito',
      C004: 'Atenção', C005: 'Vendido', C006: 'Vendido',
    } as const,
    stockById: { C001: 10 - 6, C002: 5 - 1, C003: 20, C004: 8, C005: 0, C006: 0 },
    idleById: { C001: 4 * unit.C001, C002: 4 * unit.C002, C003: 20 * unit.C003, C004: 8 * unit.C004, C005: 0, C006: 0 },
    daysInStock: { C001: 151, C002: 21, C004: 27, C005: 35 /* congela em V006 2025-12-15 */ },
  },

  /** Janela 30d do dashboard em FROZEN_NOW: V002, V003, V005, V007 (V001 fev fora; V006 2025 fora). */
  dash30d: {
    ids: ['V002', 'V003', 'V005', 'V007'],
    grossRevenue: v.V002.gross + v.V003.gross + v.V005.gross + v.V007.gross, // 390
    netRevenue: v.V002.net + v.V003.net + v.V005.net + v.V007.net,           // 319
    totalFees: v.V002.fee + v.V003.fee + v.V005.fee + v.V007.fee,            // 45
    netProfit: v.V002.profit + v.V003.profit + v.V005.profit + v.V007.profit, // 97
    proportionalCost: v.V002.cost + v.V003.cost + v.V005.cost + v.V007.cost, // 222
    totalShipping: 10 + 20,  // correios: V005 + V007
    totalFlexRefund: 4 + 2,  // flex: V002 + V003
    totalDiscounts: 0,
    totalOtherCosts: 2,
    totalSold: 3 + 1 + 1 + 1,
    salesCount: 4,
  },

  /** Janela 7d: V003 (06-10) e V005 (06-12); V007 (06-01) fora. */
  dash7d: { ids: ['V003', 'V005'] },

  /** Fiscal por ano (faturamento bruto de Concluídas). */
  fiscal: {
    revenue2026: v.V001.gross + v.V002.gross + v.V003.gross + v.V005.gross + v.V007.gross, // 590
    revenue2025: v.V006.gross, // 120
    monthly2026: { feb: v.V001.gross, may: v.V002.gross, jun: v.V003.gross + v.V005.gross + v.V007.gross },
    projectedAnnual2026: (590 / 6) * 12, // jun → 6 meses decorridos, regime o ano todo
  },

  /** Agregação por produto (Concluídas, todas as datas). */
  products: {
    'Fone BT': {
      qty: 2 + 3 + 1,
      revenue: v.V001.gross + v.V002.gross + v.V007.gross,
      netRevenue: v.V001.net + v.V002.net + v.V007.net,
      cost: v.V001.cost + v.V002.cost + v.V007.cost,
      netProfit: v.V001.profit + v.V002.profit + v.V007.profit, // 97.6
    },
    'Caneca': { qty: 1, revenue: v.V003.gross, netRevenue: v.V003.net, cost: v.V003.cost, netProfit: v.V003.profit },
    'Suporte Articulado de Parede TV': { qty: 1, revenue: v.V005.gross, netRevenue: v.V005.net, cost: v.V005.cost, netProfit: v.V005.profit },
    'Mouse': { qty: 2, revenue: v.V006.gross, netRevenue: v.V006.net, cost: v.V006.cost, netProfit: v.V006.profit },
  },

  /** Agregação por categoria — venda órfã (V005) NÃO entra em nenhuma categoria. */
  categories: {
    'Eletrônicos': {
      batches: 3, invested: 530 + 110 + 60,
      idleCapital: 4 * unit.C001 + 20 * unit.C003,
      revenue: v.V001.gross + v.V002.gross + v.V007.gross + v.V006.gross, // 630
      profit: v.V001.profit + v.V002.profit + v.V007.profit + v.V006.profit, // 135.6
    },
    'Casa': { batches: 1, invested: 50, idleCapital: 4 * unit.C002, revenue: v.V003.gross, profit: v.V003.profit },
    'Acessórios': { batches: 1, invested: 32, idleCapital: 8 * unit.C004, revenue: 0, profit: 0 },
    'Outros': { batches: 1, invested: 50, idleCapital: 0, revenue: 0, profit: 0 },
  },

  /** Buckets mensais (Concluídas): dez/2025, fev/2026, mai/2026, jun/2026. */
  monthly: {
    '202511': { qty: 2, revenue: v.V006.gross, fees: v.V006.fee, net: v.V006.net, cost: v.V006.cost, profit: v.V006.profit },
    '202601': { qty: 2, revenue: v.V001.gross, fees: v.V001.fee, net: v.V001.net, cost: v.V001.cost, profit: v.V001.profit },
    '202604': { qty: 3, revenue: v.V002.gross, fees: v.V002.fee, net: v.V002.net, cost: v.V002.cost, profit: v.V002.profit },
    '202605': {
      qty: 1 + 1 + 1,
      revenue: v.V003.gross + v.V005.gross + v.V007.gross,
      fees: v.V003.fee + v.V005.fee + v.V007.fee,
      net: v.V003.net + v.V005.net + v.V007.net,
      cost: v.V003.cost + v.V005.cost + v.V007.cost,
      profit: v.V003.profit + v.V005.profit + v.V007.profit,
    },
  },
};
