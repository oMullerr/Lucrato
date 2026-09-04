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

/** Um recebível, com a venda do razão quando ela existe. */
export interface Recebivel {
  orderId: string;
  /** Dia da liberação no fuso do vendedor. */
  liberaEm: string;
  situacao: SituacaoDoRecebivel;
  bruto: number;
  liquido: number | null;
  /** Vazio quando o pedido ainda não foi casado com uma venda. */
  produto: string;
  vendaId: string;
  /** `false` quando nenhuma venda do razão carrega este número de pedido. */
  conciliado: boolean;
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
   * Parte do total que ainda não tem venda no razão.
   *
   * Continua somada: o dinheiro entra tenha ou não venda conciliada. Isto aqui
   * só explica de onde vem a parte que a tela não consegue nomear.
   */
  naoConciliado: { total: number; pedidos: number };
  /**
   * Recebíveis sem valor líquido informado.
   *
   * Ficam fora das somas de propósito: um caixa previsto com número inventado
   * é pior do que um caixa previsto incompleto e assumido.
   */
  semLiquido: number;
}

const zeroSeNulo = (v: number | null): number => (v === null ? 0 : v);

/**
 * Venda do razão por número de pedido.
 *
 * Uma order pode ter virado várias vendas (FIFO divide entre lotes); para dar
 * nome ao recebível basta a primeira fatia.
 */
interface VendaDoPedido {
  produto: string;
  vendaId: string;
}

function porPedido(vendas: readonly ComputedSale[]): Map<string, VendaDoPedido> {
  const mapa = new Map<string, VendaDoPedido>();
  for (const v of vendas) {
    const id = v.mlOrderId;
    if (!id || mapa.has(id)) continue;
    mapa.set(id, { produto: v.product, vendaId: v.id });
  }
  return mapa;
}

/**
 * Cruza o que o Mercado Pago informou com as vendas do razão.
 *
 * **Todo pagamento entra**, tenha ou não venda correspondente. Quem decide se o
 * dinheiro vem é o Mercado Pago, não o estado do seu razão: uma venda digitada
 * antes da integração não carrega o número do pedido, e descartá-la por isso
 * fazia a tela prometer menos do que vai cair.
 *
 * Isso não é teoria — foi medido: 2 dos 8 pedidos pendentes não tinham venda
 * casada, e a tela mostrava R$ 1.350,80 quando o Mercado Pago dizia R$ 2.002,44.
 * Um terço do caixa sumindo em silêncio.
 *
 * A venda, quando existe, só acrescenta contexto: o nome do produto e o
 * lançamento. O que ela nunca faz é decidir se a linha aparece.
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
      produto: venda?.produto ?? '',
      vendaId: venda?.vendaId ?? '',
      conciliado: venda !== undefined,
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
  let naoConciliadoTotal = 0;
  let naoConciliadoPedidos = 0;

  const dias = new Map<string, number>();

  for (const r of recebiveis) {
    if (r.situacao === 'liberado') continue;
    if (r.liquido === null) {
      semLiquido++;
      continue;
    }

    const valor = zeroSeNulo(r.liquido);
    retidoAgora += valor;

    if (!r.conciliado) {
      naoConciliadoTotal += valor;
      naoConciliadoPedidos++;
    }

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
    naoConciliado: {
      total: centavos(naoConciliadoTotal),
      pedidos: naoConciliadoPedidos,
    },
  };
}

/** Recebível de um pedido, para a tela de vendas cruzar em O(1). */
export function porOrderId(recebiveis: readonly Recebivel[]): Map<string, Recebivel> {
  const mapa = new Map<string, Recebivel>();
  for (const r of recebiveis) mapa.set(r.orderId, r);
  return mapa;
}
