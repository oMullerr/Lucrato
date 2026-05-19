import {
  Purchase, Sale, Settings,
  ComputedPurchase, ComputedSale, KpiSummary, InventoryStatus
} from '../models/models';

const MS_PER_DAY = 1000 * 60 * 60 * 24;

/** Calculates derived fields for a purchase batch. */
export function calculatePurchase(
  purchase: Purchase,
  sales: Sale[],
  config: Settings,
): ComputedPurchase {
  const totalPurchaseCost = purchase.quantityPurchased * purchase.unitCost;
  const totalActualCost = totalPurchaseCost + purchase.purchaseShipping + purchase.otherCosts;
  const actualUnitCost = purchase.quantityPurchased > 0 ? totalActualCost / purchase.quantityPurchased : 0;

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
  const endRef = (currentStock <= 0 && lastSale) ? new Date(lastSale) : new Date();
  const daysInStock = Math.floor((endRef.getTime() - startDate.getTime()) / MS_PER_DAY);

  let status: InventoryStatus;
  if (currentStock <= 0) status = 'Vendido';
  else if (!purchase.receiptDate) status = 'Ainda não recebido';
  else if (daysInStock >= config.redAlertDays) status = 'Parado';
  else if (daysInStock >= config.yellowAlertDays) status = 'Atenção';
  else status = 'Em Estoque';

  const totalRevenue = batchSales.reduce((s, v) => s + v.quantitySold * v.unitPrice, 0);
  const totalProfit = batchSales.reduce((s, v) => {
    const grossRev = v.quantitySold * v.unitPrice;
    const netRev = grossRev - grossRev * v.feePercentage - v.sellerShipping - v.discount - v.otherCosts;
    return s + (netRev - v.quantitySold * actualUnitCost);
  }, 0);
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
  const actualUnitCost = batch
    ? (batch.quantityPurchased * batch.unitCost + batch.purchaseShipping + batch.otherCosts)
        / Math.max(batch.quantityPurchased, 1)
    : 0;

  const grossRevenue = sale.quantitySold * sale.unitPrice;
  const feeAmount = grossRevenue * sale.feePercentage;
  const shippingImpact = sale.shippingType === 'flex'
    ? (sale.flexRefund ?? 0)
    : -sale.sellerShipping;
  const netRevenue = grossRevenue - feeAmount + shippingImpact - sale.discount - sale.otherCosts;
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
  const totalShipping = completed.reduce((s, v) => s + v.sellerShipping, 0);
  const totalDiscounts = completed.reduce((s, v) => s + v.discount, 0);
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
    totalDiscounts,
    grossProfit,
    netProfit,
    netMargin,
    totalSold: completed.reduce((s, v) => s + v.quantitySold, 0),
    totalBatches: computedPurchases.length,
    batchesInStock: computedPurchases.filter(c => c.currentStock > 0).length,
    soldBatches: computedPurchases.filter(c => c.currentStock <= 0).length,
    averageTicket: completed.length > 0
      ? completed.reduce((s, v) => s + v.unitPrice, 0) / completed.length
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
