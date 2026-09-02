import {
  Purchase, Sale, Settings, Return,
  ComputedPurchase, ComputedSale, ComputedReturn, KpiSummary, InventoryStatus,
  SaleStatus, ReturnStatus,
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

/** Meia-noite UTC do dia de calendário LOCAL de `ref` (mesma âncora usada em todo o app). */
function localDayAnchor(ref: Date = new Date()): number {
  return Date.UTC(ref.getFullYear(), ref.getMonth(), ref.getDate());
}

/* ────────────────────────────── Devoluções ────────────────────────────── */

/** Status derivado — `arrivalDate` preenchida ⇒ finalizada. Nunca persistido. */
export function returnStatusOf(r: Return): ReturnStatus {
  return r.arrivalDate ? 'Finalizado' : 'Solicitado';
}

/** Dias entre solicitação e chegada. `null` enquanto 'Solicitado'. */
export function resolutionDaysOf(r: Return): number | null {
  if (!r.arrivalDate) return null;
  const from = new Date(r.requestDate).getTime();
  const to = new Date(r.arrivalDate).getTime();
  if (Number.isNaN(from) || Number.isNaN(to)) return null;
  // Clamp em 0: chegada anterior à solicitação (erro de digitação) não vira negativo.
  return Math.max(0, Math.floor((to - from) / MS_PER_DAY));
}

/** Dias desde a solicitação. `null` quando já finalizada. */
export function pendingDaysOf(r: Return, ref: Date = new Date()): number | null {
  if (r.arrivalDate) return null;
  const from = new Date(r.requestDate).getTime();
  if (Number.isNaN(from)) return null;
  return Math.max(0, Math.floor((localDayAnchor(ref) - from) / MS_PER_DAY));
}

/** Devoluções ligadas a uma venda (todos os status). */
export function returnsForSale(saleId: string, returns: Return[]): Return[] {
  return returns.filter(r => r.saleId === saleId);
}

/**
 * Predicado ÚNICO de "esta venda entra nos agregados de dinheiro".
 * Substitui os `status === 'Concluída'` espalhados pelo app.
 *
 * Compatibilidade retroativa: uma venda legada marcada 'Devolvida' à mão não
 * possui nenhum Return, então o `some(...)` dá false e ela continua excluída
 * exatamente como antes desta feature. Só uma 'Devolvida' COM devolução
 * finalizada passa a entrar (contribuindo receita 0 e seus custos retidos).
 */
export function countsAsRevenue(sale: Sale, returns: Return[] = []): boolean {
  if (sale.status === 'Cancelada' || sale.status === 'Em disputa') return false;
  if (sale.status === 'Devolvida') {
    return returns.some(r => r.saleId === sale.id && !!r.arrivalDate);
  }
  return sale.status === 'Concluída';
}

/**
 * Quantidade ainda devolvível de uma venda. Considera devoluções SOLICITADAS
 * e FINALIZADAS — uma unidade já solicitada não pode ser solicitada de novo.
 * `excludeReturnId` permite editar uma devolução sem que ela conte contra si mesma.
 */
export function remainingReturnable(
  sale: Sale,
  returns: Return[],
  excludeReturnId?: string,
): number {
  const used = returns.reduce(
    (sum, r) =>
      r.saleId === sale.id && r.id !== excludeReturnId ? sum + r.quantity : sum,
    0,
  );
  return Math.max(0, sale.quantitySold - used);
}

/** Status corrigido pelas devoluções. Só alterna o par Concluída ↔ Devolvida. */
function deriveEffectiveStatus(sale: Sale, returnedQuantity: number): SaleStatus {
  if (sale.status === 'Cancelada' || sale.status === 'Em disputa') return sale.status;
  return returnedQuantity > 0 && returnedQuantity >= sale.quantitySold
    ? 'Devolvida'
    : 'Concluída';
}

/** Todos os números de dinheiro de uma venda, já ajustados por devoluções. */
interface SaleFinancials {
  grossRevenue: number;
  originalGrossRevenue: number;
  feeAmount: number;
  discountEffective: number;
  estornoEffective: number;
  shippingEffective: number;
  otherCostsEffective: number;
  netRevenue: number;
  proportionalCost: number;
  grossProfit: number;
  netProfit: number;
  netMargin: number;
  returnedQuantity: number;
  returnedToStockQuantity: number;
  pendingReturnQuantity: number;
  effectiveQuantity: number;
  costedQuantity: number;
  returnShippingTotal: number;
  returnRefundTotal: number;
  returnLoss: number;
  pendingReturnValue: number;
  returnCount: number;
}

/**
 * Núcleo financeiro de uma venda. Usado por `calculateSale` E por
 * `calculatePurchase` — antes cada um derivava o lucro por conta própria, o que
 * com devoluções viraria risco de divergência.
 *
 * Regras (travadas com o usuário):
 *  - TUDO que escala com a quantidade vendida é revertido PROPORCIONALMENTE:
 *    receita bruta, taxa da plataforma, frete original, outros custos, desconto
 *    e estorno. Uma devolução total deixa a venda como se nunca tivesse existido;
 *  - só o destino 'Estoque' libera o custo da mercadoria (CMV);
 *  - frete DA devolução e ressarcimento são caixa novo: entram por inteiro.
 */
function saleFinancials(sale: Sale, actualUnitCost: number, returns: Return[]): SaleFinancials {
  const linked = returns.filter(r => r.saleId === sale.id);
  const finalized = linked.filter(r => !!r.arrivalDate);
  const pending = linked.filter(r => !r.arrivalDate);

  const Q = sale.quantitySold;
  const P = sale.unitPrice;

  const rawReturned = finalized.reduce((s, r) => s + r.quantity, 0);
  // Clamp defensivo: dado corrompido (devolver mais que o vendido) não pode
  // gerar receita negativa nem ratio > 1. A UI já barra via remainingReturnable.
  const returnedQuantity = Math.min(Q, Math.max(0, rawReturned));
  const returnedToStockQuantity = Math.min(
    returnedQuantity,
    finalized.reduce((s, r) => (r.destination === 'Estoque' ? s + r.quantity : s), 0),
  );
  const pendingReturnQuantity = pending.reduce((s, r) => s + r.quantity, 0);

  const ratio = Q > 0 ? returnedQuantity / Q : 0;
  const effectiveQuantity = Math.max(0, Q - returnedQuantity);
  const costedQuantity = Math.max(0, Q - returnedToStockQuantity);

  const originalGrossRevenue = Q * P;
  const grossRevenue = effectiveQuantity * P;
  // Taxa incide sobre a receita EFETIVA: a plataforma estorna a comissão da
  // parcela devolvida. O valor integral fica reservado para o contrafactual.
  const originalFeeAmount = originalGrossRevenue * sale.feePercentage;
  const feeAmount = grossRevenue * sale.feePercentage;
  // Frete original e outros custos voltam junto com a receita — a venda
  // devolvida não pode deixar custo de venda para trás.
  const fullShippingImpact = saleShippingImpact(sale);
  const shippingEff = fullShippingImpact * (1 - ratio);
  const otherCostsEff = sale.otherCosts * (1 - ratio);
  const discountEff = sale.discount * (1 - ratio);
  const estornoEff = (sale.estorno ?? 0) * (1 - ratio);

  const returnShippingTotal = finalized.reduce((s, r) => s + r.returnShipping, 0);
  const returnRefundTotal = finalized.reduce((s, r) => s + (r.refundedAmount ?? 0), 0);

  const netRevenue = grossRevenue - feeAmount + shippingEff + estornoEff
    - discountEff - otherCostsEff - returnShippingTotal + returnRefundTotal;

  const proportionalCost = costedQuantity * actualUnitCost;
  const grossProfit = grossRevenue - proportionalCost;
  const netProfit = netRevenue - proportionalCost;

  // Contrafactual: o que a venda teria dado sem NENHUMA devolução. Usa os
  // valores ÍNTEGROS — é a única coisa que não pode enxergar a reversão.
  const baselineNetRevenue = originalGrossRevenue - originalFeeAmount + fullShippingImpact
    + (sale.estorno ?? 0) - sale.discount - sale.otherCosts;
  const baselineNetProfit = baselineNetRevenue - Q * actualUnitCost;
  // PODE SER NEGATIVO (ressarcimento integral + desconto não concedido deixam
  // o vendedor à frente). Nunca aplicar Math.max(0, ...) aqui nem a jusante.
  //
  // Numa devolução 100% com destino 'Estoque', sem frete nem ressarcimento,
  // netProfit zera e returnLoss vira exatamente baselineNetProfit: você deixa
  // de ganhar o lucro da venda, nada além disso.
  const returnLoss = baselineNetProfit - netProfit;

  // Quando a venda foi 100% devolvida, grossRevenue = 0 e a margem seria 0/0.
  // Usar o bruto ORIGINAL como base mostra o prejuízo real em vez de 0%.
  // Vendas sem devolução caem no mesmo ramo de antes — comportamento idêntico.
  const marginBase = grossRevenue > 0
    ? grossRevenue
    : (returnedQuantity > 0 ? originalGrossRevenue : 0);
  const netMargin = marginBase > 0 ? netProfit / marginBase : 0;

  return {
    grossRevenue,
    originalGrossRevenue,
    feeAmount,
    discountEffective: discountEff,
    estornoEffective: estornoEff,
    shippingEffective: shippingEff,
    otherCostsEffective: otherCostsEff,
    netRevenue,
    proportionalCost,
    grossProfit,
    netProfit,
    netMargin,
    returnedQuantity,
    returnedToStockQuantity,
    pendingReturnQuantity,
    effectiveQuantity,
    costedQuantity,
    returnShippingTotal,
    returnRefundTotal,
    returnLoss,
    pendingReturnValue: pendingReturnQuantity * P,
    returnCount: finalized.length,
  };
}

/* ─────────────────────────────── Cálculos ─────────────────────────────── */

/** Calculates derived fields for a purchase batch. */
export function calculatePurchase(
  purchase: Purchase,
  sales: Sale[],
  config: Settings,
  returns: Return[] = [],
): ComputedPurchase {
  const totalPurchaseCost = purchase.quantityPurchased * purchase.unitCost;
  const totalActualCost = totalPurchaseCost + purchase.purchaseShipping + purchase.otherCosts;
  const actualUnitCost = actualUnitCostOf(purchase);

  const batchSales = sales.filter(
    v => v.batchId === purchase.id && countsAsRevenue(v, returns),
  );
  const financials = batchSales.map(v => saleFinancials(v, actualUnitCost, returns));

  const quantitySold = financials.reduce((s, f) => s + f.effectiveQuantity, 0);
  const returnedToStock = financials.reduce((s, f) => s + f.returnedToStockQuantity, 0);
  // Consumo real do lote: só o destino 'Estoque' devolve a unidade à prateleira.
  // 'Perda'/'Fornecedor'/'Ressarcido' continuam consumindo o lote.
  // Numericamente igual a `costedQuantity` (Q − qrStock) porque estoque e CMV
  // são governados pela mesma regra de destino, mas são conceitos distintos.
  const quantityConsumed = financials.reduce((s, f) => s + f.costedQuantity, 0);
  const currentStock = purchase.quantityPurchased - quantityConsumed;
  const idleValue = currentStock > 0 ? currentStock * actualUnitCost : 0;

  const dates = batchSales.map(v => v.saleDate).sort();
  const firstSale = dates[0];
  const lastSale = dates[dates.length - 1];

  const startDate = purchase.receiptDate
    ? new Date(purchase.receiptDate)
    : new Date(purchase.purchaseDate);
  const now = new Date();
  // "Hoje" no calendário LOCAL do usuário. receiptDate/purchaseDate são dias de
  // calendário locais, então a referência precisa virar à meia-noite local — usar
  // getUTC* aqui inflava daysInStock em 1 das 21h às 23h59 (BRT) na virada UTC.
  const today = new Date(localDayAnchor(now));
  // Uma devolução ao estoque reabre o lote (currentStock volta acima de 0), então
  // endRef volta a ser "hoje" e o relógio de capital parado retoma corretamente.
  const endRef = (currentStock <= 0 && lastSale) ? new Date(lastSale) : today;
  // Clamp em 0: receiptDate futura (erro de digitação) não pode exibir dias negativos.
  const daysInStock = Math.max(0, Math.floor((endRef.getTime() - startDate.getTime()) / MS_PER_DAY));

  let status: InventoryStatus;
  if (currentStock <= 0) status = 'Vendido';
  else if (!purchase.receiptDate) status = 'Em trânsito';
  else if (daysInStock >= config.redAlertDays) status = 'Parado';
  else if (daysInStock >= config.yellowAlertDays) status = 'Atenção';
  else status = 'Em Estoque';

  const totalRevenue = financials.reduce((s, f) => s + f.grossRevenue, 0);
  const totalProfit = financials.reduce((s, f) => s + f.netProfit, 0);
  const averageMargin = totalRevenue > 0 ? totalProfit / totalRevenue : undefined;

  return {
    ...purchase,
    totalPurchaseCost,
    totalActualCost,
    actualUnitCost,
    quantitySold,
    returnedToStock,
    quantityConsumed,
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
export function calculateSale(
  sale: Sale,
  purchases: Purchase[],
  returns: Return[] = [],
): ComputedSale {
  const batch = purchases.find(c => c.id === sale.batchId);
  const actualUnitCost = batch ? actualUnitCostOf(batch) : 0;

  const f = saleFinancials(sale, actualUnitCost, returns);

  return {
    ...sale,
    grossRevenue: f.grossRevenue,
    originalGrossRevenue: f.originalGrossRevenue,
    feeAmount: f.feeAmount,
    discountEffective: f.discountEffective,
    estornoEffective: f.estornoEffective,
    shippingEffective: f.shippingEffective,
    otherCostsEffective: f.otherCostsEffective,
    netRevenue: f.netRevenue,
    actualUnitCost,
    proportionalCost: f.proportionalCost,
    grossProfit: f.grossProfit,
    netProfit: f.netProfit,
    netMargin: f.netMargin,
    returnedQuantity: f.returnedQuantity,
    returnedToStockQuantity: f.returnedToStockQuantity,
    pendingReturnQuantity: f.pendingReturnQuantity,
    effectiveQuantity: f.effectiveQuantity,
    costedQuantity: f.costedQuantity,
    returnShippingTotal: f.returnShippingTotal,
    returnRefundTotal: f.returnRefundTotal,
    returnLoss: f.returnLoss,
    pendingReturnValue: f.pendingReturnValue,
    returnCount: f.returnCount,
    countsAsRevenue: countsAsRevenue(sale, returns),
    effectiveStatus: deriveEffectiveStatus(sale, f.returnedQuantity),
  };
}

/** Calculates derived fields for a return. */
export function computeReturn(
  ret: Return,
  sales: Sale[],
  purchases: Purchase[],
  ref: Date = new Date(),
): ComputedReturn {
  const sale = sales.find(s => s.id === ret.saleId);
  const batch = purchases.find(c => c.id === (sale?.batchId ?? ret.batchId));
  const actualUnitCost = batch ? actualUnitCostOf(batch) : 0;

  const P = sale?.unitPrice ?? 0;
  const Q = sale?.quantitySold ?? 0;
  const share = Q > 0 ? ret.quantity / Q : 0;

  const returnedRevenue = ret.quantity * P;
  const costReleased = ret.destination === 'Estoque' ? ret.quantity * actualUnitCost : 0;
  const refundedFee = returnedRevenue * (sale?.feePercentage ?? 0);
  // Frete original, outros custos, desconto e estorno da parcela devolvida,
  // agrupados com o sinal "quanto você recupera". Fecha a conta do painel:
  // lossAmount = receita − taxa − custos de venda + frete devol. − ressarc. − CMV
  const revertedSellingCosts = sale
    ? -share * saleShippingImpact(sale) + share * sale.otherCosts
      + share * sale.discount - share * (sale.estorno ?? 0)
    : 0;

  // Decomposição ADITIVA exata do returnLoss da venda: somando lossAmount sobre
  // as devoluções finalizadas de uma venda obtém-se exatamente
  // `baselineNetProfit − netProfit`. É o que faz a reconciliação
  // "por devolução → por venda → KPI do dashboard" fechar no centavo.
  // Cada termo é a parcela devolvida do componente correspondente da venda.
  const lossAmount = sale
    ? returnedRevenue
      - refundedFee
      - revertedSellingCosts
      + ret.returnShipping
      - (ret.refundedAmount ?? 0)
      - costReleased
    : 0;

  return {
    ...ret,
    status: returnStatusOf(ret),
    resolutionDays: resolutionDaysOf(ret),
    pendingDays: pendingDaysOf(ret, ref),
    saleDate: sale?.saleDate ?? ret.requestDate,
    saleUnitPrice: P,
    saleQuantity: Q,
    actualUnitCost,
    returnedRevenue,
    refundedFee,
    revertedSellingCosts,
    costReleased,
    lossAmount,
    orphan: !sale,
  };
}

/** Calculates consolidated KPIs from computed lists. */
export function calculateKpis(
  computedPurchases: ComputedPurchase[],
  computedSales: ComputedSale[],
): KpiSummary {
  const completed = computedSales.filter(v => v.countsAsRevenue);

  const totalInvested = computedPurchases.reduce((s, c) => s + c.totalActualCost, 0);
  const idleCapital = computedPurchases.reduce((s, c) => s + c.idleValue, 0);
  const grossRevenue = completed.reduce((s, v) => s + v.grossRevenue, 0);
  const totalFees = completed.reduce((s, v) => s + v.feeAmount, 0);
  // EFETIVOS: precisam casar com netRevenue, senão a cascata do dashboard não
  // fecha quando há devolução (o componente revertido sumiria da conta).
  // shippingEffective já é o impacto com sinal: negativo custeia o frete do
  // vendedor, positivo é reembolso do Flex.
  const totalShipping = completed.reduce((s, v) => s + (v.shippingType === 'flex' ? 0 : -v.shippingEffective), 0);
  const totalFlexRefund = completed.reduce((s, v) => s + (v.shippingType === 'flex' ? v.shippingEffective : 0), 0);
  const totalDiscounts = completed.reduce((s, v) => s + v.discountEffective, 0);
  const totalEstorno = completed.reduce((s, v) => s + v.estornoEffective, 0);
  const totalOtherCosts = completed.reduce((s, v) => s + v.otherCostsEffective, 0);
  const netRevenue = completed.reduce((s, v) => s + v.netRevenue, 0);
  const grossProfit = completed.reduce((s, v) => s + v.grossProfit, 0);
  const netProfit = completed.reduce((s, v) => s + v.netProfit, 0);
  const netMargin = grossRevenue > 0 ? netProfit / grossRevenue : 0;

  const grossUnitsSold = completed.reduce((s, v) => s + v.quantitySold, 0);
  const returnedUnits = completed.reduce((s, v) => s + v.returnedQuantity, 0);
  // Vendas 100% devolvidas têm ticket 0 e puxariam a média para baixo sem
  // representar uma venda real. unitPrice > 0 é validado no formulário e no
  // import, então dado legado sempre tem grossRevenue > 0 e o valor não muda.
  const ticketSales = completed.filter(v => v.grossRevenue > 0);

  return {
    totalInvested,
    idleCapital,
    grossRevenue,
    netRevenue,
    totalFees,
    totalShipping,
    totalFlexRefund,
    totalDiscounts,
    totalEstorno,
    totalOtherCosts,
    grossProfit,
    netProfit,
    netMargin,
    totalSold: completed.reduce((s, v) => s + v.effectiveQuantity, 0),
    totalBatches: computedPurchases.length,
    batchesInStock: computedPurchases.filter(c => c.currentStock > 0).length,
    soldBatches: computedPurchases.filter(c => c.currentStock <= 0).length,
    averageTicket: ticketSales.length > 0 ? grossRevenue / ticketSales.length : 0,
    grossUnitsSold,
    returnedUnits,
    returnCount: completed.reduce((s, v) => s + v.returnCount, 0),
    returnRate: grossUnitsSold > 0 ? returnedUnits / grossUnitsSold : 0,
    returnedRevenue: completed.reduce((s, v) => s + (v.originalGrossRevenue - v.grossRevenue), 0),
    returnShippingCost: completed.reduce((s, v) => s + v.returnShippingTotal, 0),
    returnRefunds: completed.reduce((s, v) => s + v.returnRefundTotal, 0),
    returnLoss: completed.reduce((s, v) => s + v.returnLoss, 0),
    pendingReturnCount: completed.filter(v => v.pendingReturnQuantity > 0).length,
    pendingReturnValue: completed.reduce((s, v) => s + v.pendingReturnValue, 0),
  };
}

/** Generates the next sequential ID for a given prefix (e.g. C, V, D). */
export function nextId(ids: string[], prefix: string, padding = 3): string {
  let max = 0;
  const re = new RegExp(`^${prefix}(\\d+)$`);
  for (const id of ids) {
    const m = id.match(re);
    if (m?.[1]) max = Math.max(max, parseInt(m[1], 10));
  }
  return prefix + String(max + 1).padStart(padding, '0');
}
