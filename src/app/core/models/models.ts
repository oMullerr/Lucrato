export type InventoryStatus = 'Em Estoque' | 'Vendido' | 'Atenção' | 'Parado' | 'Em trânsito';
export type SaleStatus = 'Concluída' | 'Cancelada' | 'Devolvida' | 'Em disputa';
export type SaleChannel = 'Mercado Livre' | 'Shopee' | 'Amazon' | 'Instagram' | 'WhatsApp' | 'Outro';

/** Purchase batch */
export interface Purchase {
  id: string;
  product: string;
  category: string;
  supplier: string;
  link?: string;
  purchaseDate: string;
  receiptDate?: string;
  quantityPurchased: number;
  unitCost: number;
  purchaseShipping: number;
  otherCosts: number;
  notes?: string;
}

/** Individual sale */
export interface Sale {
  id: string;
  batchId: string;
  product: string;
  quantitySold: number;
  unitPrice: number;
  saleDate: string;
  channel: SaleChannel;
  feePercentage: number;
  shippingType?: 'correios' | 'flex';
  sellerShipping: number;
  flexRefund?: number;
  discount: number;
  otherCosts: number;
  status: SaleStatus;
  notes?: string;
}

export interface Settings {
  defaultMlFee: number;
  yellowAlertDays: number;
  redAlertDays: number;
  minimumMargin: number;
  lowStockAlert: number;
  defaultShipping: number;
  defaultChannel: SaleChannel;
  categories: string[];
  suppliers: string[];
  channels: string[];
}

/** Purchase with derived computed fields */
export interface ComputedPurchase extends Purchase {
  totalPurchaseCost: number;
  totalActualCost: number;
  actualUnitCost: number;
  quantitySold: number;
  currentStock: number;
  idleValue: number;
  firstSale?: string;
  lastSale?: string;
  daysInStock: number;
  status: InventoryStatus;
  averageMargin?: number;
}

/** Sale with derived computed fields */
export interface ComputedSale extends Sale {
  grossRevenue: number;
  feeAmount: number;
  netRevenue: number;
  actualUnitCost: number;
  proportionalCost: number;
  grossProfit: number;
  netProfit: number;
  netMargin: number;
}

/** Consolidated KPIs */
export interface KpiSummary {
  totalInvested: number;
  idleCapital: number;
  grossRevenue: number;
  netRevenue: number;
  totalFees: number;
  totalShipping: number;
  totalFlexRefund: number;
  totalDiscounts: number;
  totalOtherCosts: number;
  grossProfit: number;
  netProfit: number;
  netMargin: number;
  totalSold: number;
  totalBatches: number;
  batchesInStock: number;
  soldBatches: number;
  averageTicket: number;
}

/** JSON database */
export interface Database {
  purchases: Purchase[];
  sales: Sale[];
  settings: Settings;
  metadata: { versao: string; ultimaAtualizacao: string };
}
