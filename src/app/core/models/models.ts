import { FiscalConfig } from '../fiscal/fiscal.model';

export type InventoryStatus = 'Em Estoque' | 'Vendido' | 'Atenção' | 'Parado' | 'Em trânsito';
export type SaleStatus = 'Concluída' | 'Cancelada' | 'Devolvida' | 'Em disputa';
export type SaleChannel = 'Mercado Livre' | 'Shopee' | 'Amazon' | 'Instagram' | 'WhatsApp' | 'Outro';

/** Status da devolução — DERIVADO de `arrivalDate`, nunca persistido. */
export type ReturnStatus = 'Solicitado' | 'Finalizado';

/**
 * Destino físico do produto devolvido. Decide APENAS se a unidade volta ao
 * estoque vendável; a recuperação de dinheiro fica toda em `refundedAmount`.
 *  - 'Estoque'     volta ao lote, custo liberado do CMV
 *  - 'Perda'       não volta, custo continua como prejuízo
 *  - 'Fornecedor'  não volta, custo continua (compensar via refundedAmount)
 *  - 'Ressarcido'  não volta, custo continua (compensar via refundedAmount)
 */
export type ReturnDestination = 'Estoque' | 'Perda' | 'Fornecedor' | 'Ressarcido';

export type ReturnReason =
  | 'Defeito'
  | 'Não conforme'
  | 'Arrependimento'
  | 'Avaria no transporte'
  | 'Atraso na entrega'
  | 'Erro de envio'
  | 'Outro';

/**
 * Origem do registro. Ausente ⇒ tratado como 'manual' (bases antigas).
 * Registros com origem 'mercadolivre' sao alimentados pela integracao.
 */
export type RecordSource = 'manual' | 'mercadolivre';

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
  /** SKU do vendedor. Casa com o `seller_sku` do anuncio no Mercado Livre. */
  sku?: string;
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
  estorno?: number;
  discount: number;
  otherCosts: number;
  status: SaleStatus;
  notes?: string;

  // --- Integracao com o Mercado Livre (ausentes em vendas digitadas a mao) ---
  /** Origem do registro. Ausente ⇒ 'manual'. */
  source?: RecordSource;
  /**
   * Chave de idempotencia da ingestao: `${orderId}:${itemId}:${fatia}`.
   * A fatia existe porque uma venda pode ser dividida entre lotes (FIFO).
   */
  externalId?: string;
  /** ID da order no Mercado Livre. Agrupa as fatias de uma mesma venda. */
  mlOrderId?: string;
  /** Anuncio (MLB...) que originou a venda. */
  mlItemId?: string;
  /** Variacao do anuncio, quando houver. */
  mlVariationId?: string;
  /** Carrinho: varias orders dividem um frete. */
  mlPackId?: string;
  /** Envio associado, de onde vem o frete real do vendedor. */
  mlShipmentId?: string;
}

/**
 * Devolução de uma venda (total ou parcial).
 * Só afeta dinheiro/estoque quando FINALIZADA (`arrivalDate` preenchida).
 */
export interface Return {
  id: string;
  /** FK → Sale.id */
  saleId: string;
  /** Denormalizado da venda na criação (estoque e relatórios). */
  batchId: string;
  /** Denormalizado da venda na criação. */
  product: string;
  /** Denormalizado da venda na criação — habilita "taxa de devolução por canal". */
  channel: SaleChannel;
  quantity: number;
  /** 'YYYY-MM-DD' — dia de calendário local. */
  requestDate: string;
  /** Ausente ⇒ status 'Solicitado'. Presente ⇒ 'Finalizado'. */
  arrivalDate?: string;
  /** Frete da devolução pago pelo vendedor. */
  returnShipping: number;
  destination: ReturnDestination;
  /** Valor recuperado (plataforma ou fornecedor). Único canal de compensação. */
  refundedAmount?: number;
  reason: ReturnReason;
  /** Justificativa livre informada pelo comprador. */
  customerReason?: string;
  /** Resolução dada pelo vendedor. */
  resolution?: string;
  notes?: string;

  /** Origem do registro. Ausente ⇒ 'manual'. */
  source?: RecordSource;
  /** claim_id da reclamacao no Mercado Livre. Chave de idempotencia. */
  externalId?: string;
}

export interface Settings {
  defaultMlFee: number;
  yellowAlertDays: number;
  redAlertDays: number;
  minimumMargin: number;
  lowStockAlert: number;
  defaultShipping: number;
  /** Janela (dias) em que uma venda ainda aceita devolução. Padrão 30. */
  returnWindowDays: number;
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
  /**
   * Aplicar sozinho no razao as vendas do Mercado Livre cujo anuncio ja esta
   * vinculado a um produto com estoque. Ausente ⇒ true.
   */
  mlAutoApply?: boolean;
  /** Percentual de imposto usado como padrao na calculadora. Ausente ⇒ 0. */
  taxPercentage?: number;
}

/** Purchase with derived computed fields */
export interface ComputedPurchase extends Purchase {
  totalPurchaseCost: number;
  totalActualCost: number;
  actualUnitCost: number;
  /** Unidades vendidas LÍQUIDAS de devoluções (Σ effectiveQuantity). */
  quantitySold: number;
  /** Unidades devolvidas ao estoque vendável (destino 'Estoque'). */
  returnedToStock: number;
  /** Consumo real do lote = Σ (quantitySold − returnedToStockQuantity). */
  quantityConsumed: number;
  currentStock: number;
  idleValue: number;
  firstSale?: string;
  lastSale?: string;
  daysInStock: number;
  status: InventoryStatus;
  averageMargin?: number;
}

/**
 * Sale with derived computed fields.
 * Campos PLANOS de propósito: `SheetSpec<T>.columns[].key` é `keyof T` e os
 * SORT_ACCESSORS indexam por string — um objeto aninhado seria inutilizável.
 */
export interface ComputedSale extends Sale {
  /** Receita bruta EFETIVA (já descontadas as devoluções finalizadas). */
  grossRevenue: number;
  /** Receita bruta da venda original (quantitySold × unitPrice). */
  originalGrossRevenue: number;
  /** Taxa sobre a receita EFETIVA — a comissão da parcela devolvida é estornada. */
  feeAmount: number;
  netRevenue: number;
  actualUnitCost: number;
  proportionalCost: number;
  grossProfit: number;
  netProfit: number;
  netMargin: number;

  // ── devoluções ─────────────────────────────────────────────────────────
  /** Desconto após reversão proporcional das devoluções. */
  discountEffective: number;
  /** Estorno após reversão proporcional das devoluções. */
  estornoEffective: number;
  /** Impacto do frete original após reversão proporcional. Negativo = custo do vendedor. */
  shippingEffective: number;
  /** Outros custos após reversão proporcional das devoluções. */
  otherCostsEffective: number;
  /** Unidades devolvidas em devoluções FINALIZADAS (clampado em quantitySold). */
  returnedQuantity: number;
  /** Subconjunto de returnedQuantity com destino 'Estoque'. */
  returnedToStockQuantity: number;
  /** Unidades em devoluções ainda 'Solicitado' (não afetam dinheiro). */
  pendingReturnQuantity: number;
  /** quantitySold − returnedQuantity */
  effectiveQuantity: number;
  /** quantitySold − returnedToStockQuantity (unidades cujo custo permanece). */
  costedQuantity: number;
  returnShippingTotal: number;
  returnRefundTotal: number;
  /** Lucro líquido que a venda deixou de gerar. PODE SER NEGATIVO. */
  returnLoss: number;
  /** Valor bruto em risco nas devoluções ainda solicitadas. */
  pendingReturnValue: number;
  /** Quantidade de devoluções finalizadas ligadas à venda. */
  returnCount: number;
  /** Predicado ÚNICO de "entra nos agregados de dinheiro". */
  countsAsRevenue: boolean;
  /** Status corrigido pelas devoluções — é o que a UI renderiza. */
  effectiveStatus: SaleStatus;
}

/** Return with derived computed fields */
export interface ComputedReturn extends Return {
  status: ReturnStatus;
  /** Dias entre solicitação e chegada; null enquanto 'Solicitado'. */
  resolutionDays: number | null;
  /** Dias desde a solicitação; null quando já 'Finalizado'. */
  pendingDays: number | null;
  saleDate: string;
  saleUnitPrice: number;
  saleQuantity: number;
  actualUnitCost: number;
  /** quantity × saleUnitPrice */
  returnedRevenue: number;
  /** Taxa estornada pela plataforma nesta parcela — já embutida em lossAmount. */
  refundedFee: number;
  /** Frete, outros custos, desconto e estorno revertidos com a parcela devolvida. */
  revertedSellingCosts: number;
  /** Custo liberado do CMV ('Estoque' apenas). */
  costReleased: number;
  /** Parcela exata desta devolução no returnLoss da venda. PODE SER NEGATIVA. */
  lossAmount: number;
  /** true quando saleId não resolve (venda apagada fora do fluxo normal). */
  orphan: boolean;
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
  /** Descontos EFETIVOS (já revertidos proporcionalmente). */
  totalDiscounts: number;
  /** Estornos EFETIVOS (já revertidos proporcionalmente). */
  totalEstorno: number;
  totalOtherCosts: number;
  grossProfit: number;
  netProfit: number;
  netMargin: number;
  /** Unidades vendidas LÍQUIDAS de devoluções. */
  totalSold: number;
  totalBatches: number;
  batchesInStock: number;
  soldBatches: number;
  averageTicket: number;

  // ── devoluções ─────────────────────────────────────────────────────────
  /** Unidades vendidas ANTES de devoluções (denominador da taxa). */
  grossUnitsSold: number;
  returnedUnits: number;
  returnCount: number;
  /** returnedUnits / grossUnitsSold */
  returnRate: number;
  /** Faturamento que saiu por devolução (Σ original − efetivo). */
  returnedRevenue: number;
  returnShippingCost: number;
  returnRefunds: number;
  /** Σ ComputedSale.returnLoss. PODE SER NEGATIVO — nunca clampar. */
  returnLoss: number;
  pendingReturnCount: number;
  pendingReturnValue: number;
}

/** JSON database */
export interface Database {
  purchases: Purchase[];
  sales: Sale[];
  returns: Return[];
  settings: Settings;
  metadata: { versao: string; ultimaAtualizacao: string };
}
