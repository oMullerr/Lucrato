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
  /**
   * Unidades que o comprador está devolvendo (`orders[].return_quantity`).
   *
   * Ausente em registros gravados antes de setembro/2026, quando este campo não
   * existia e a devolução era sempre criada pela venda inteira — é por isso que
   * `planejarDevolucoes` cai na quantidade da venda quando não há número aqui.
   */
  quantity?: number;
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
 * Reparte `total` unidades entre fatias, proporcionalmente a `pesos`.
 *
 * Unidade é inteira: não dá para devolver 0,6 de um produto. O método é o do
 * maior resto — cada fatia leva o piso da sua parte e as sobras vão para quem
 * tem o maior resto —, e a soma bate com `total` exatamente.
 *
 * Por que proporcional, e não "tira da primeira fatia até acabar": uma venda
 * dividida entre lotes tem CUSTOS DIFERENTES por fatia. Devolver sempre pelo
 * começo liberaria sistematicamente o custo do lote mais antigo, enviesando o
 * lucro na mesma direção toda vez. Ninguém sabe de qual lote veio a peça que
 * voltou; proporcional é a única repartição que não escolhe um lado.
 */
export function ratearInteiro(total: number, pesos: readonly number[]): number[] {
  const soma = pesos.reduce((a, b) => a + b, 0);
  if (soma <= 0 || total <= 0) return pesos.map(() => 0);

  const exatos = pesos.map((p) => (total * p) / soma);
  const partes = exatos.map(Math.floor);
  let sobra = total - partes.reduce((a, b) => a + b, 0);

  // Maior resto primeiro; empate desempata pela ordem, para ser determinístico.
  const ordem = exatos
    .map((e, i) => ({ i, resto: e - Math.floor(e) }))
    .sort((a, b) => b.resto - a.resto || a.i - b.i);

  for (let k = 0; sobra > 0; k++, sobra--) partes[ordem[k % ordem.length].i]++;
  return partes;
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
      /* Quantidade revisada pelo ML só é adotada quando a devolução mora numa
         linha só. Com a venda dividida entre lotes, mexer no número exigiria
         redistribuir entre as linhas existentes — e uma redistribuição
         malfeita duplica ou some com unidade de estoque. Enquanto não houver
         caso real para calibrar isso, a divisão fica como entrou e a correção
         é sua, na tela. */
      const linhaUnica = jaExistem.length === 1 ? jaExistem[0] : null;
      const novaQtd =
        linhaUnica && item.quantity !== undefined && item.quantity > 0
          ? Math.min(item.quantity, quantidadeDaVenda(vendasPorChave, item.externalIdVenda))
          : null;

      for (const atual of jaExistem) {
        const mudouCampo = CAMPOS_DA_INGESTAO.some(
          campo => (atual[campo] ?? undefined) !== (item[campo] ?? undefined),
        );
        const mudouQtd = novaQtd !== null && novaQtd !== atual.quantity && atual === linhaUnica;
        if (mudouCampo || mudouQtd) {
          const quantidade = mudouQtd ? novaQtd! : atual.quantity;
          plano.atualizadas.push({
            ...atual,
            ...(item.arrivalDate ? { arrivalDate: item.arrivalDate } : {}),
            quantity: quantidade,
            returnShipping: fatia(
              item.returnShipping,
              quantidade,
              linhaUnica ? quantidade : somaQuantidade(jaExistem),
            ),
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
    /* `quantity` ausente é registro de antes de setembro/2026, quando a
       ingestão não trazia o número e a devolução era sempre pela venda inteira.
       Manter esse comportamento para os antigos evita reescrever, na primeira
       sincronização depois do deploy, devoluções que já estão conferidas. */
    const pedido = item.quantity ?? totalVendido;
    // O ML não deveria mandar mais do que foi vendido, mas o razão é nosso.
    const devolvidas = Math.max(0, Math.min(pedido, totalVendido));
    if (devolvidas === 0) {
      plano.aplicadas.push(item.claimId);
      continue;
    }

    const porFatia = ratearInteiro(devolvidas, fatiasDaVenda.map(v => v.quantitySold));
    /* O sufixo do `externalId` usa o índice ORIGINAL da fatia, não a posição
       entre as que receberam unidades. Se amanhã o ML revisar a quantidade e
       outra fatia entrar na conta, os ids das que já existem continuam os
       mesmos — que é o que segura a idempotência. */
    const dividido = fatiasDaVenda.length > 1;

    fatiasDaVenda.forEach((venda, i) => {
      const quantidade = porFatia[i];
      // Fatia que não recebeu nenhuma unidade não vira devolução de zero.
      if (quantidade <= 0) return;

      plano.novas.push({
        id: `D${String(numero++).padStart(3, '0')}`,
        saleId: venda.id,
        batchId: venda.batchId,
        product: venda.product,
        channel: venda.channel,
        quantity: quantidade,
        requestDate: item.requestDate,
        ...(item.arrivalDate ? { arrivalDate: item.arrivalDate } : {}),
        // Frete rateado pelo que cada fatia DEVOLVEU, não pelo que vendeu.
        returnShipping: fatia(item.returnShipping, quantidade, devolvidas),
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

/** Teto de unidades devolvíveis: o que a venda (ou suas fatias) vendeu. */
function quantidadeDaVenda(
  vendasPorChave: ReadonlyMap<string, Sale[]>,
  externalIdVenda: string,
): number {
  return (vendasPorChave.get(externalIdVenda) ?? []).reduce((s, v) => s + v.quantitySold, 0);
}
