/**
 * Modelos de domínio do Sistema Lucrato
 */

export type StatusEstoque = 'Em Estoque' | 'Vendido' | 'Atenção' | 'Parado';
export type StatusVenda = 'Concluída' | 'Cancelada' | 'Devolvida' | 'Em disputa';
export type CanalVenda = 'Mercado Livre' | 'Shopee' | 'Amazon' | 'Instagram' | 'WhatsApp' | 'Outro';

/** Lote de compra */
export interface Compra {
  id: string;
  produto: string;
  categoria: string;
  fornecedor: string;
  link?: string;
  dataCompra: string;
  qtdComprada: number;
  custoUnitario: number;
  freteCompra: number;
  outrosCustos: number;
  observacoes?: string;
}

/** Venda detalhada */
export interface Venda {
  id: string;
  idLote: string;
  produto: string;
  qtdVendida: number;
  precoUnitario: number;
  dataVenda: string;
  canal: CanalVenda;
  taxaPercentual: number;
  freteVendedor: number;
  desconto: number;
  outrosCustos: number;
  status: StatusVenda;
  observacoes?: string;
}

export interface Configuracoes {
  taxaMlPadrao: number;
  diasAlertaAmarelo: number;
  diasAlertaVermelho: number;
  margemMinima: number;
  alertaEstoqueBaixo: number;
  fretePadrao: number;
  canalPadrao: CanalVenda;
  categorias: string[];
  fornecedores: string[];
  canais: string[];
}

/** Compra com cálculos derivados */
export interface CompraCalculada extends Compra {
  custoTotalCompra: number;
  custoTotalReal: number;
  custoUnitarioReal: number;
  qtdVendida: number;
  estoqueAtual: number;
  valorParado: number;
  primeiraVenda?: string;
  ultimaVenda?: string;
  diasEmEstoque: number;
  status: StatusEstoque;
  margemMedia?: number;
}

/** Venda com cálculos derivados */
export interface VendaCalculada extends Venda {
  receitaBruta: number;
  taxaValor: number;
  receitaLiquida: number;
  custoUnitarioReal: number;
  custoTotalProporcional: number;
  lucroBruto: number;
  lucroLiquido: number;
  margemLiquida: number;
}

/** KPIs consolidados */
export interface KpiResumo {
  totalInvestido: number;
  capitalParado: number;
  receitaBruta: number;
  receitaLiquida: number;
  taxasTotal: number;
  fretesTotal: number;
  descontosTotal: number;
  lucroBruto: number;
  lucroLiquido: number;
  margemLiquida: number;
  qtdVendida: number;
  qtdLotes: number;
  qtdLotesEstoque: number;
  qtdLotesVendidos: number;
  ticketMedio: number;
}

/** Banco JSON */
export interface Database {
  compras: Compra[];
  vendas: Venda[];
  configuracoes: Configuracoes;
  metadata: { versao: string; ultimaAtualizacao: string };
}
