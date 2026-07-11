import { FiscalConfig } from '../fiscal/fiscal.model';

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
  /** Cor (hex) por categoria, indexada pelo nome. Ausência = cor padrão. */
  categoryColors: Record<string, string>;
  suppliers: string[];
  /** Cor (hex) por fornecedor, indexada pelo nome. Ausência = cor padrão. */
  supplierColors: Record<string, string>;
  channels: string[];
  /** Cor (hex) por canal, indexada pelo nome. Ausência = cor padrão. */
  channelColors: Record<string, string>;
  /** Configuração do regime tributário (MEI etc.). Ausência = padrão (ver DEFAULT_FISCAL_CONFIG). */
  fiscal?: FiscalConfig;
  /** Competências do DAS pagas, no formato 'YYYY-MM'. Ausência = nenhuma paga. */
  dasPaidMonths?: string[];
  /** Anos-base com DASN-SIMEI já entregue. */
  dasnDeclaredYears?: number[];
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

/**
 * Consolidado por produto (agrupamento dos lotes que compartilham o mesmo nome).
 * Puramente derivado — não é persistido. Mantém a precisão por lote: as vendas
 * seguem custeadas pelo seu próprio lote; aqui só somamos/mediamos para exibição.
 */
export interface ProductGroup {
  /** Nome do produto (chave de agrupamento, já trimado). */
  product: string;
  /** Lotes deste produto (compras computadas). */
  lots: ComputedPurchase[];
  lotCount: number;
  /** Categorias distintas vistas nos lotes (ordenadas). */
  categories: string[];
  /** Fornecedores distintos vistos nos lotes (ordenados). */
  suppliers: string[];
  totalPurchased: number;
  totalSold: number;
  currentStock: number;
  totalInvested: number;
  idleCapital: number;
  /** Custo unitário médio ponderado: Σ totalActualCost / Σ quantityPurchased. */
  avgUnitCost: number;
  totalRevenue: number;
  totalNetProfit: number;
  /** totalNetProfit / totalRevenue. undefined quando não houve receita. */
  avgNetMargin?: number;
  /** totalNetProfit / totalSold. undefined quando nada foi vendido. */
  avgProfitPerUnit?: number;
  /** Status agregado (pior status ativo entre os lotes). */
  status: InventoryStatus;
  firstPurchase?: string;
  lastPurchase?: string;
  lastSale?: string;
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
