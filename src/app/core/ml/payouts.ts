/**
 * Quando o dinheiro da venda cai na conta.
 *
 * O resto do app responde "quanto eu lucrei". Isto responde outra pergunta:
 * "quanto entra, e quando". Uma venda lucrativa cujo dinheiro só libera em 28
 * dias é lucro no papel e aperto no caixa — e até aqui o Lucrato não tinha como
 * mostrar isso.
 *
 * O valor líquido vem PRONTO do Mercado Pago (`net_received_amount`), nunca de
 * conta nossa. Medido na conta real: um pedido de R$ 115 deposita R$ 79,95,
 * enquanto a comissão sozinha era R$ 20,70 — o frete também sai da operação.
 * Reconstruir esse número erraria por R$ 14,35 num pedido só.
 *
 * Módulo puro, compartilhado com as functions.
 */
import type { ComputedSale } from '../models/models';
import { diaLocalDeISO } from './order-mapping';

export type SituacaoDoRecebivel = 'retido' | 'liberado' | 'atrasado';

/** Um pagamento como o servidor grava em `users/{uid}/mlPayouts`. */
export interface PagamentoDoMl {
  orderId: string;
  paymentId: string;
  /** Instante ISO da liberação, como o Mercado Pago informa. */
  liberaEm: string;
  /** `pending`, `released` — o que o Mercado Pago disser. */
  situacaoMl: string;
  /** O que o comprador pagou. */
  bruto: number;
  /** O depósito. `null` quando o Mercado Pago não informou — nunca estimado. */
  liquido: number | null;
}

/** Um recebível já cruzado com a venda do razão. */
export interface Recebivel {
  orderId: string;
  /** Dia da liberação no fuso do vendedor. */
  liberaEm: string;
  situacao: SituacaoDoRecebivel;
  bruto: number;
  liquido: number | null;
  produto: string;
  vendaId: string;
}

export interface ResumoDeCaixa {
  /** Tudo que ainda não caiu, inclusive o que passou da data. */
  retidoAgora: number;
  liberaEm7: number;
  liberaEm30: number;
  /** Passou da data prevista e o Mercado Pago ainda não liberou. */
  atrasado: number;
  /** Quanto entra por dia, só do que ainda está por vir. */
  porDia: { dia: string; valor: number }[];
  /**
   * Recebíveis sem valor líquido informado.
   *
   * Ficam fora das somas de propósito: um caixa previsto com número inventado
   * é pior do que um caixa previsto incompleto e assumido.
   */
  semLiquido: number;
}

const zeroSeNulo = (v: number | null): number => (v === null ? 0 : v);

/** Soma as fatias de uma mesma order: FIFO pode ter dividido a venda em várias. */
interface VendaDoPedido {
  produto: string;
  vendaId: string;
  conta: boolean;
}

function porPedido(vendas: readonly ComputedSale[]): Map<string, VendaDoPedido> {
  const mapa = new Map<string, VendaDoPedido>();
  for (const v of vendas) {
    const id = v.mlOrderId;
    if (!id) continue;
    const atual = mapa.get(id);
    if (atual) {
      // Basta uma fatia contar como receita para o pedido valer: uma devolução
      // parcial não faz o dinheiro do resto deixar de cair.
      atual.conta = atual.conta || v.countsAsRevenue;
    } else {
      mapa.set(id, { produto: v.product, vendaId: v.id, conta: v.countsAsRevenue });
    }
  }
  return mapa;
}

/**
 * Cruza o que o Mercado Pago informou com as vendas do razão.
 *
 * Pagamento sem venda correspondente fica de fora: seria uma linha que você não
 * reconhece, e a tela não tem como explicá-la. Isso acontece com venda digitada
 * antes da integração, que ainda não carrega o número do pedido.
 */
export function juntarRecebiveis(
  pagamentos: readonly PagamentoDoMl[],
  vendas: readonly ComputedSale[],
  hoje: Date = new Date(),
): Recebivel[] {
  const doRazao = porPedido(vendas);
  const dia = diaLocalDeISO(hoje.toISOString());
  const recebiveis: Recebivel[] = [];

  for (const p of pagamentos) {
    const venda = doRazao.get(p.orderId);
    // Venda cancelada ou em disputa não vira caixa a receber.
    if (!venda || !venda.conta) continue;

    const liberaEm = diaLocalDeISO(p.liberaEm);
    if (!liberaEm) continue;

    const liberado = p.situacaoMl === 'released';
    const situacao: SituacaoDoRecebivel = liberado
      ? 'liberado'
      : liberaEm < dia
        ? 'atrasado'
        : 'retido';

    recebiveis.push({
      orderId: p.orderId,
      liberaEm,
      situacao,
      bruto: p.bruto,
      liquido: p.liquido,
      produto: venda.produto,
      vendaId: venda.vendaId,
    });
  }

  // Mais perto de cair primeiro: é a ordem em que a pergunta é feita.
  return recebiveis.sort((a, b) => a.liberaEm.localeCompare(b.liberaEm));
}

function diasDepois(dias: number, ref: Date): string {
  const d = new Date(ref);
  d.setDate(d.getDate() + dias);
  return diaLocalDeISO(d.toISOString());
}

/** Agrega os recebíveis nas janelas que interessam para decidir. */
export function resumirCaixa(
  recebiveis: readonly Recebivel[],
  hoje: Date = new Date(),
): ResumoDeCaixa {
  const em7 = diasDepois(7, hoje);
  const em30 = diasDepois(30, hoje);

  let retidoAgora = 0;
  let liberaEm7 = 0;
  let liberaEm30 = 0;
  let atrasado = 0;
  let semLiquido = 0;

  const dias = new Map<string, number>();

  for (const r of recebiveis) {
    if (r.situacao === 'liberado') continue;
    if (r.liquido === null) {
      semLiquido++;
      continue;
    }

    const valor = zeroSeNulo(r.liquido);
    retidoAgora += valor;

    if (r.situacao === 'atrasado') {
      atrasado += valor;
      continue;
    }

    if (r.liberaEm <= em7) liberaEm7 += valor;
    if (r.liberaEm <= em30) liberaEm30 += valor;
    dias.set(r.liberaEm, (dias.get(r.liberaEm) ?? 0) + valor);
  }

  const centavos = (v: number) => Math.round(v * 100) / 100;

  return {
    retidoAgora: centavos(retidoAgora),
    liberaEm7: centavos(liberaEm7),
    liberaEm30: centavos(liberaEm30),
    atrasado: centavos(atrasado),
    porDia: [...dias.entries()]
      .map(([dia, valor]) => ({ dia, valor: centavos(valor) }))
      .sort((a, b) => a.dia.localeCompare(b.dia)),
    semLiquido,
  };
}

/** Recebível de um pedido, para a tela de vendas cruzar em O(1). */
export function porOrderId(recebiveis: readonly Recebivel[]): Map<string, Recebivel> {
  const mapa = new Map<string, Recebivel>();
  for (const r of recebiveis) mapa.set(r.orderId, r);
  return mapa;
}
