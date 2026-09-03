/**
 * Da caixa de entrada para o razão: escolha do lote e criação das vendas.
 *
 * Fica no cliente, junto do resto do motor de cálculo, porque depende do
 * estoque calculado — e estoque, no Lucrato, é derivado das vendas do lote.
 *
 * Módulo puro: recebe o retrato atual da base e devolve o que gravar. Quem
 * grava é o DataService, pelo caminho de escrita de sempre.
 */
import type { ComputedPurchase, Sale } from '../models/models';
import { normalizarChaveProduto } from './matching';

/** Item da caixa, como o servidor grava em `users/{uid}/mlInbox`. */
export interface ItemDaCaixa {
  externalId: string;
  mlOrderId: string;
  mlItemId: string;
  mlVariationId?: string;
  mlPackId?: string;
  mlShipmentId?: string;
  /** Produto do vínculo, ou o título do anúncio quando ainda não há vínculo. */
  produto: string;
  vinculado: boolean;
  quantitySold: number;
  unitPrice: number;
  saleDate: string;
  feePercentage: number;
  shippingType: 'correios' | 'flex';
  sellerShipping: number;
  flexRefund?: number;
  discount: number;
  estorno?: number;
  status: Sale['status'];
  notes: string;
  estado: 'pendente' | 'aplicado' | 'ignorado';
}

/** Por que um item não pôde entrar sozinho. */
export type MotivoPendencia = 'sem_vinculo' | 'sem_estoque';

export interface PlanoDeAplicacao {
  /** Vendas novas, já com id e lote. */
  novas: Sale[];
  /** Vendas que já existiam e mudaram (situação, estorno, frete). */
  atualizadas: Sale[];
  /** `externalId` dos itens cobertos pelo plano — viram "aplicado". */
  aplicados: string[];
  /** Itens que continuam esperando, com o motivo. */
  pendentes: { externalId: string; motivo: MotivoPendencia }[];
}

/** Campos que a ingestão controla; o resto de uma venda editada à mão é preservado. */
const CAMPOS_DA_INGESTAO = [
  'unitPrice',
  'feePercentage',
  'shippingType',
  'sellerShipping',
  'flexRefund',
  'discount',
  'estorno',
  'status',
] as const;

/** Lotes do produto com estoque, do mais antigo para o mais novo. */
function lotesDisponiveis(chave: string, lotes: readonly ComputedPurchase[]): ComputedPurchase[] {
  return lotes
    .filter(l => normalizarChaveProduto(l.product) === chave && l.currentStock > 0)
    .sort((a, b) => {
      const da = a.receiptDate || a.purchaseDate;
      const dbb = b.receiptDate || b.purchaseDate;
      return da === dbb ? a.id.localeCompare(b.id) : da.localeCompare(dbb);
    });
}

function proximoNumero(ids: readonly string[]): number {
  let maior = 0;
  for (const id of ids) {
    const m = /^V(\d+)$/.exec(id);
    if (m) maior = Math.max(maior, Number(m[1]));
  }
  return maior + 1;
}

/** Monta a venda a partir do item da caixa, já com lote e quantidade da fatia. */
function vendaDoItem(
  item: ItemDaCaixa,
  id: string,
  batchId: string,
  quantidade: number,
  sufixo: string,
): Sale {
  return {
    id,
    batchId,
    product: item.produto,
    quantitySold: quantidade,
    unitPrice: item.unitPrice,
    saleDate: item.saleDate,
    channel: 'Mercado Livre',
    feePercentage: item.feePercentage,
    shippingType: item.shippingType,
    sellerShipping: item.sellerShipping,
    ...(item.flexRefund !== undefined ? { flexRefund: item.flexRefund } : {}),
    ...(item.estorno !== undefined ? { estorno: item.estorno } : {}),
    discount: item.discount,
    otherCosts: 0,
    status: item.status,
    notes: item.notes,
    source: 'mercadolivre',
    externalId: item.externalId + sufixo,
    mlOrderId: item.mlOrderId,
    mlItemId: item.mlItemId,
    ...(item.mlVariationId ? { mlVariationId: item.mlVariationId } : {}),
    ...(item.mlPackId ? { mlPackId: item.mlPackId } : {}),
    ...(item.mlShipmentId ? { mlShipmentId: item.mlShipmentId } : {}),
  };
}

/**
 * Rateia um valor do pedido entre as fatias, proporcional à quantidade.
 * Sem isso, uma venda dividida em dois lotes cobraria o frete inteiro duas vezes.
 */
function fatia(valor: number, quantidade: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((valor * quantidade * 100) / total) / 100;
}

/**
 * Decide o que entra no razão.
 *
 * Regras:
 *  - sem vínculo confirmado, o item espera — o sistema não inventa produto;
 *  - o lote é o mais antigo com estoque (FIFO); se a quantidade não couber nos
 *    lotes disponíveis, nada é gravado e o item espera;
 *  - venda já aplicada é reconhecida pelo `externalId` e só é atualizada nos
 *    campos que a ingestão controla, preservando o que foi editado à mão.
 */
export function planejarAplicacao(
  itens: readonly ItemDaCaixa[],
  lotes: readonly ComputedPurchase[],
  vendas: readonly Sale[],
): PlanoDeAplicacao {
  const plano: PlanoDeAplicacao = { novas: [], atualizadas: [], aplicados: [], pendentes: [] };

  const jaAplicadas = new Map<string, Sale[]>();
  for (const v of vendas) {
    if (!v.externalId) continue;
    const base = v.externalId.split('#')[0];
    const lista = jaAplicadas.get(base) ?? [];
    lista.push(v);
    jaAplicadas.set(base, lista);
  }

  // Estoque consumido dentro desta mesma rodada, para duas vendas do mesmo
  // produto não disputarem a mesma unidade.
  const consumido = new Map<string, number>();
  const disponivel = (l: ComputedPurchase) => l.currentStock - (consumido.get(l.id) ?? 0);

  let numero = proximoNumero(vendas.map(v => v.id));

  // Ordem cronológica: o FIFO só faz sentido se as vendas antigas vierem antes.
  const fila = [...itens].sort((a, b) => a.saleDate.localeCompare(b.saleDate));

  for (const item of fila) {
    const existentes = jaAplicadas.get(item.externalId);
    if (existentes?.length) {
      // Já está no razão: só reflete o que mudou no pedido.
      for (const venda of existentes) {
        const mudou = CAMPOS_DA_INGESTAO.some(
          campo => (venda[campo] ?? undefined) !== (item[campo as keyof ItemDaCaixa] ?? undefined),
        );
        if (mudou) {
          plano.atualizadas.push({
            ...venda,
            unitPrice: item.unitPrice,
            feePercentage: item.feePercentage,
            shippingType: item.shippingType,
            sellerShipping: fatia(item.sellerShipping, venda.quantitySold, item.quantitySold),
            ...(item.flexRefund !== undefined
              ? { flexRefund: fatia(item.flexRefund, venda.quantitySold, item.quantitySold) }
              : {}),
            ...(item.estorno !== undefined
              ? { estorno: fatia(item.estorno, venda.quantitySold, item.quantitySold) }
              : {}),
            discount: fatia(item.discount, venda.quantitySold, item.quantitySold),
            status: item.status,
          });
        }
      }
      plano.aplicados.push(item.externalId);
      continue;
    }

    if (!item.vinculado) {
      plano.pendentes.push({ externalId: item.externalId, motivo: 'sem_vinculo' });
      continue;
    }

    const chave = normalizarChaveProduto(item.produto);
    const candidatos = lotesDisponiveis(chave, lotes);
    const total = candidatos.reduce((s, l) => s + disponivel(l), 0);
    if (total < item.quantitySold) {
      plano.pendentes.push({ externalId: item.externalId, motivo: 'sem_estoque' });
      continue;
    }

    // Cabe: divide entre os lotes mais antigos.
    let restante = item.quantitySold;
    const fatias: { lote: ComputedPurchase; quantidade: number }[] = [];
    for (const lote of candidatos) {
      if (restante <= 0) break;
      const usa = Math.min(restante, disponivel(lote));
      if (usa <= 0) continue;
      fatias.push({ lote, quantidade: usa });
      consumido.set(lote.id, (consumido.get(lote.id) ?? 0) + usa);
      restante -= usa;
    }

    const dividido = fatias.length > 1;
    fatias.forEach((f, i) => {
      const id = `V${String(numero++).padStart(3, '0')}`;
      const venda = vendaDoItem(item, id, f.lote.id, f.quantidade, dividido ? `#${i + 1}` : '');
      // Valores do pedido inteiro precisam ser rateados entre as fatias.
      venda.sellerShipping = fatia(item.sellerShipping, f.quantidade, item.quantitySold);
      venda.discount = fatia(item.discount, f.quantidade, item.quantitySold);
      if (item.flexRefund !== undefined) {
        venda.flexRefund = fatia(item.flexRefund, f.quantidade, item.quantitySold);
      }
      if (item.estorno !== undefined) {
        venda.estorno = fatia(item.estorno, f.quantidade, item.quantitySold);
      }
      plano.novas.push(venda);
    });

    plano.aplicados.push(item.externalId);
  }

  return plano;
}
