import {
  Purchase, Sale, Settings,
  ComputedPurchase, ComputedSale, KpiSummary, InventoryStatus
} from '../models/models';

const MS_PER_DAY = 1000 * 60 * 60 * 24;

/** Real unit cost of a batch: (units*unitCost + shipping + otherCosts) / units. */
function actualUnitCostOf(p: Purchase): number {
  const total = p.quantityPurchased * p.unitCost + p.purchaseShipping + p.otherCosts;
  return p.quantityPurchased > 0 ? total / p.quantityPurchased : 0;
}

/** Shipping impact of a sale on net revenue: +flexRefund (Flex) or -sellerShipping (Correios). */
function saleShippingImpact(s: Sale): number {
  return s.shippingType === 'flex' ? (s.flexRefund ?? 0) : -s.sellerShipping;
}

/** Net revenue of a single sale (channel fees, shipping/flex, discount, other costs). */
function saleNetRevenue(s: Sale): number {
  const grossRevenue = s.quantitySold * s.unitPrice;
  return grossRevenue - grossRevenue * s.feePercentage + saleShippingImpact(s) - s.discount - s.otherCosts;
}

/** Calculates derived fields for a purchase batch. */
export function calculatePurchase(
  purchase: Purchase,
  sales: Sale[],
  config: Settings,
): ComputedPurchase {
  const totalPurchaseCost = purchase.quantityPurchased * purchase.unitCost;
  const totalActualCost = totalPurchaseCost + purchase.purchaseShipping + purchase.otherCosts;
  const actualUnitCost = actualUnitCostOf(purchase);

  const batchSales = sales.filter(v => v.batchId === purchase.id && v.status === 'Concluída');
  const quantitySold = batchSales.reduce((s, v) => s + v.quantitySold, 0);
  const currentStock = purchase.quantityPurchased - quantitySold;
  const idleValue = currentStock > 0 ? currentStock * actualUnitCost : 0;

  const dates = batchSales.map(v => v.saleDate).sort();
  const firstSale = dates[0];
  const lastSale = dates[dates.length - 1];

  const startDate = purchase.receiptDate
    ? new Date(purchase.receiptDate)
    : new Date(purchase.purchaseDate);
  const now = new Date();
  const todayUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const endRef = (currentStock <= 0 && lastSale) ? new Date(lastSale) : todayUtc;
  const daysInStock = Math.floor((endRef.getTime() - startDate.getTime()) / MS_PER_DAY);

  let status: InventoryStatus;
  if (currentStock <= 0) status = 'Vendido';
  else if (!purchase.receiptDate) status = 'Em trânsito';
  else if (daysInStock >= config.redAlertDays) status = 'Parado';
  else if (daysInStock >= config.yellowAlertDays) status = 'Atenção';
  else status = 'Em Estoque';

  const totalRevenue = batchSales.reduce((s, v) => s + v.quantitySold * v.unitPrice, 0);
  const totalProfit = batchSales.reduce(
    (s, v) => s + (saleNetRevenue(v) - v.quantitySold * actualUnitCost),
    0,
  );
  const averageMargin = totalRevenue > 0 ? totalProfit / totalRevenue : undefined;

  return {
    ...purchase,
    totalPurchaseCost,
    totalActualCost,
    actualUnitCost,
    quantitySold,
    currentStock,
    idleValue,
    firstSale,
    lastSale,
    daysInStock,
    status,
    averageMargin,
  };
}

/** Calculates derived fields for a sale. */
export function calculateSale(sale: Sale, purchases: Purchase[]): ComputedSale {
  const batch = purchases.find(c => c.id === sale.batchId);
  const actualUnitCost = batch ? actualUnitCostOf(batch) : 0;

  const grossRevenue = sale.quantitySold * sale.unitPrice;
  const feeAmount = grossRevenue * sale.feePercentage;
  const netRevenue = saleNetRevenue(sale);
  const proportionalCost = sale.quantitySold * actualUnitCost;
  const grossProfit = grossRevenue - proportionalCost;
  const netProfit = netRevenue - proportionalCost;
  const netMargin = grossRevenue > 0 ? netProfit / grossRevenue : 0;

  return {
    ...sale,
    grossRevenue,
    feeAmount,
    netRevenue,
    actualUnitCost,
    proportionalCost,
    grossProfit,
    netProfit,
    netMargin,
  };
}

/** Calculates consolidated KPIs from computed lists. */
export function calculateKpis(
  computedPurchases: ComputedPurchase[],
  computedSales: ComputedSale[],
): KpiSummary {
  const completed = computedSales.filter(v => v.status === 'Concluída');

  const totalInvested = computedPurchases.reduce((s, c) => s + c.totalActualCost, 0);
  const idleCapital = computedPurchases.reduce((s, c) => s + c.idleValue, 0);
  const grossRevenue = completed.reduce((s, v) => s + v.grossRevenue, 0);
  const totalFees = completed.reduce((s, v) => s + v.feeAmount, 0);
  const totalShipping = completed.reduce((s, v) => s + (v.shippingType === 'flex' ? 0 : v.sellerShipping), 0);
  const totalFlexRefund = completed.reduce((s, v) => s + (v.shippingType === 'flex' ? (v.flexRefund ?? 0) : 0), 0);
  const totalDiscounts = completed.reduce((s, v) => s + v.discount, 0);
  const totalOtherCosts = completed.reduce((s, v) => s + v.otherCosts, 0);
  const netRevenue = completed.reduce((s, v) => s + v.netRevenue, 0);
  const grossProfit = completed.reduce((s, v) => s + v.grossProfit, 0);
  const netProfit = completed.reduce((s, v) => s + v.netProfit, 0);
  const netMargin = grossRevenue > 0 ? netProfit / grossRevenue : 0;

  return {
    totalInvested,
    idleCapital,
    grossRevenue,
    netRevenue,
    totalFees,
    totalShipping,
    totalFlexRefund,
    totalDiscounts,
    totalOtherCosts,
    grossProfit,
    netProfit,
    netMargin,
    totalSold: completed.reduce((s, v) => s + v.quantitySold, 0),
    totalBatches: computedPurchases.length,
    batchesInStock: computedPurchases.filter(c => c.currentStock > 0).length,
    soldBatches: computedPurchases.filter(c => c.currentStock <= 0).length,
    averageTicket: completed.length > 0
      ? grossRevenue / completed.length
      : 0,
  };
}

/** Generates the next sequential ID for a given prefix (e.g. C, V). */
export function nextId(ids: string[], prefix: string, padding = 3): string {
  let max = 0;
  const re = new RegExp(`^${prefix}(\\d+)$`);
  for (const id of ids) {
    const m = id.match(re);
    if (m?.[1]) max = Math.max(max, parseInt(m[1], 10));
  }
  return prefix + String(max + 1).padStart(padding, '0');
}
