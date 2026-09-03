/**
 * Devoluções do Mercado Livre viram devoluções do Lucrato.
 *
 * O motor de devoluções já existe e é bem definido: só mexe em dinheiro quando
 * a devolução é FINALIZADA (`arrivalDate` preenchida), e o destino decide se a
 * unidade volta ao estoque. Aqui só se traduz o que a plataforma informa para
 * esses campos — nenhuma regra de dinheiro nova.
 */
import type { Return, ReturnDestination, ReturnReason, Sale } from '../models/models';

/** Devolução como o servidor grava em `users/{uid}/mlReturns`. */
export interface DevolucaoDoMl {
  /** `claim_id` no Mercado Livre. Chave de idempotência. */
  claimId: string;
  /** `${orderId}:${itemId}` — casa com o `externalId` da venda. */
  externalIdVenda: string;
  mlOrderId: string;
  mlItemId: string;
  requestDate: string;
  /** Preenchida quando o envio da devolução foi entregue. */
  arrivalDate?: string;
  returnShipping: number;
  /** Destino inferido pelo endereço do envio. Revisável na tela de devoluções. */
  destination: ReturnDestination;
  reason: ReturnReason;
  estado: 'pendente' | 'aplicado' | 'ignorado';
}

export type MotivoPendenteDevolucao = 'sem_venda';

export interface PlanoDeDevolucoes {
  novas: Return[];
  atualizadas: Return[];
  aplicadas: string[];
  pendentes: { claimId: string; motivo: MotivoPendenteDevolucao }[];
}

/** Campos que a integração controla; o resto do que você editar é preservado. */
const CAMPOS_DA_INGESTAO = ['arrivalDate', 'returnShipping', 'destination'] as const;

function proximoNumero(ids: readonly string[]): number {
  let maior = 0;
  for (const id of ids) {
    const m = /^D(\d+)$/.exec(id);
    if (m) maior = Math.max(maior, Number(m[1]));
  }
  return maior + 1;
}

/** Rateio do frete da devolução entre as fatias da venda. */
function fatia(valor: number, quantidade: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((valor * quantidade * 100) / total) / 100;
}

/**
 * Traduz as devoluções do Mercado Livre em devoluções do Lucrato.
 *
 * Uma venda dividida entre lotes gera uma devolução por fatia, para o estoque
 * voltar ao lote de onde saiu. A devolução só é criada quando a venda já está
 * no razão — sem venda, não há o que devolver.
 */
export function planejarDevolucoes(
  itens: readonly DevolucaoDoMl[],
  vendas: readonly Sale[],
  devolucoes: readonly Return[],
): PlanoDeDevolucoes {
  const plano: PlanoDeDevolucoes = { novas: [], atualizadas: [], aplicadas: [], pendentes: [] };

  const vendasPorChave = new Map<string, Sale[]>();
  for (const v of vendas) {
    if (!v.externalId) continue;
    const base = v.externalId.split('#')[0];
    const lista = vendasPorChave.get(base) ?? [];
    lista.push(v);
    vendasPorChave.set(base, lista);
  }

  const existentesPorChave = new Map<string, Return[]>();
  for (const d of devolucoes) {
    if (!d.externalId) continue;
    const base = d.externalId.split('#')[0];
    const lista = existentesPorChave.get(base) ?? [];
    lista.push(d);
    existentesPorChave.set(base, lista);
  }

  let numero = proximoNumero(devolucoes.map(d => d.id));

  for (const item of itens) {
    const jaExistem = existentesPorChave.get(item.claimId);
    if (jaExistem?.length) {
      // Já registrada: só reflete o que a plataforma mudou.
      for (const atual of jaExistem) {
        const mudou = CAMPOS_DA_INGESTAO.some(
          campo => (atual[campo] ?? undefined) !== (item[campo] ?? undefined),
        );
        if (mudou) {
          plano.atualizadas.push({
            ...atual,
            ...(item.arrivalDate ? { arrivalDate: item.arrivalDate } : {}),
            returnShipping: fatia(item.returnShipping, atual.quantity, somaQuantidade(jaExistem)),
            destination: item.destination,
          });
        }
      }
      plano.aplicadas.push(item.claimId);
      continue;
    }

    const fatiasDaVenda = vendasPorChave.get(item.externalIdVenda);
    if (!fatiasDaVenda?.length) {
      plano.pendentes.push({ claimId: item.claimId, motivo: 'sem_venda' });
      continue;
    }

    const totalVendido = fatiasDaVenda.reduce((s, v) => s + v.quantitySold, 0);
    const dividido = fatiasDaVenda.length > 1;

    fatiasDaVenda.forEach((venda, i) => {
      plano.novas.push({
        id: `D${String(numero++).padStart(3, '0')}`,
        saleId: venda.id,
        batchId: venda.batchId,
        product: venda.product,
        channel: venda.channel,
        quantity: venda.quantitySold,
        requestDate: item.requestDate,
        ...(item.arrivalDate ? { arrivalDate: item.arrivalDate } : {}),
        returnShipping: fatia(item.returnShipping, venda.quantitySold, totalVendido),
        destination: item.destination,
        reason: item.reason,
        notes: `Mercado Livre · reclamação ${item.claimId}`,
        source: 'mercadolivre',
        externalId: dividido ? `${item.claimId}#${i + 1}` : item.claimId,
      });
    });

    plano.aplicadas.push(item.claimId);
  }

  return plano;
}

function somaQuantidade(devolucoes: readonly Return[]): number {
  return devolucoes.reduce((s, d) => s + d.quantity, 0);
}
