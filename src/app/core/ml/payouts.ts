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

/**
 * De onde o dinheiro vem.
 *
 * `credito` é dinheiro que entra na conta **sem pedido atrás** — bonificação,
 * ajuste, devolução de tarifa. O Mercado Pago os trata como pagamento comum
 * (`operation_type: money_transfer`) e os libera junto com o resto.
 */
export type TipoDeRecebivel = 'pedido' | 'credito';

/** Um pagamento como o servidor grava em `users/{uid}/mlPayouts`. */
export interface PagamentoDoMl {
  /** Chave do documento: todo pagamento tem, inclusive os sem pedido. */
  paymentId: string;
  /** Vazio quando o crédito não vem de um pedido. */
  orderId: string;
  /** Instante ISO da liberação, como o Mercado Pago informa. */
  liberaEm: string;
  /** Instante ISO da aprovação. Serve para reconhecer liberação imediata. */
  aprovadoEm: string;
  /** `pending`, `released` — o que o Mercado Pago disser. */
  situacaoMl: string;
  /** O que o comprador pagou. */
  bruto: number;
  /** O depósito. `null` quando o Mercado Pago não informou — nunca estimado. */
  liquido: number | null;
}

/** Um recebível, com a venda do razão quando ela existe. */
export interface Recebivel {
  paymentId: string;
  /** Vazio quando é crédito da conta. */
  orderId: string;
  tipo: TipoDeRecebivel;
  /**
   * Dia da liberação no fuso do vendedor, `YYYY-MM-DD`.
   *
   * É chave de agrupamento (`porDia`), critério de ordenação e das comparações
   * de janela (`liberaEm < hoje`, `liberaEm <= em7`). Continua sendo o dia por
   * isso — a hora vive em `liberaEmInstante`, ao lado.
   */
  liberaEm: string;
  /**
   * O instante exato da liberação, como o Mercado Pago informou.
   *
   * Vem com o offset deles (`-04:00`), e não com o do Brasil: quem exibir tem
   * de converter pelo fuso do vendedor, senão mostra uma hora a menos.
   */
  liberaEmInstante: string;
  situacao: SituacaoDoRecebivel;
  bruto: number;
  liquido: number | null;
  /** Vazio quando o pedido ainda não foi casado com uma venda. */
  produto: string;
  vendaId: string;
  /**
   * `false` quando nenhuma venda do razão carrega este número de pedido.
   * Sempre `false` em crédito da conta — que nunca terá venda.
   */
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
   * Parte do total em PEDIDOS que ainda não têm venda no razão.
   *
   * Continua somada: o dinheiro entra tenha ou não venda conciliada. Isto aqui
   * só explica de onde vem a parte que a tela não consegue nomear — e aponta
   * para uma ação, que é conciliar.
   */
  naoConciliado: { total: number; pedidos: number };
  /**
   * Crédito que entra sem pedido atrás: bonificação, ajuste, devolução de
   * tarifa. Separado do acima de propósito — não há o que conciliar aqui, e
   * misturar os dois transformaria um recado acionável em ruído.
   */
  creditos: { total: number; itens: number };
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
 * Liberação imediata: o dinheiro ficou disponível na própria aprovação.
 *
 * Nesses pagamentos o Mercado Pago devolve `money_release_date` igual ao
 * `date_approved` e o líquido igual ao bruto — e deixa o `money_release_status`
 * em `pending` para sempre. Sem reconhecer o padrão, eles se acumulariam como
 * "atrasado" para o resto da vida: na conta real eram R$ 187,79 de falso alarme,
 * de junho e agosto.
 */
function liberacaoImediata(p: PagamentoDoMl): boolean {
  const libera = Date.parse(p.liberaEm);
  const aprova = Date.parse(p.aprovadoEm);
  if (!isFinite(libera) || !isFinite(aprova)) return false;
  return libera <= aprova;
}

function situacaoDoPagamento(
  p: PagamentoDoMl,
  liberaEm: string,
  hoje: string,
): SituacaoDoRecebivel {
  if (p.situacaoMl === 'released' || liberacaoImediata(p)) return 'liberado';
  return liberaEm < hoje ? 'atrasado' : 'retido';
}

/**
 * Cruza o que o Mercado Pago informou com as vendas do razão.
 *
 * **Todo pagamento entra**, tenha ou não venda correspondente, tenha ou não
 * pedido. Quem decide se o dinheiro vem é o Mercado Pago, não o estado do seu
 * razão.
 *
 * Isso não é teoria — foi medido duas vezes:
 *   - descartar pagamento sem venda casada escondia um terço do caixa;
 *   - buscar só a partir de pedidos escondia os créditos da conta, que o
 *     Mercado Pago libera junto e o app soma na mesma linha do dia.
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
    const liberaEm = diaLocalDeISO(p.liberaEm);
    if (!liberaEm) continue;

    const venda = p.orderId ? doRazao.get(p.orderId) : undefined;
    const situacao = situacaoDoPagamento(p, liberaEm, dia);

    recebiveis.push({
      paymentId: p.paymentId,
      orderId: p.orderId,
      tipo: p.orderId ? 'pedido' : 'credito',
      liberaEm,
      liberaEmInstante: p.liberaEm,
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
  let creditosTotal = 0;
  let creditosItens = 0;

  const dias = new Map<string, number>();

  for (const r of recebiveis) {
    if (r.situacao === 'liberado') continue;
    if (r.liquido === null) {
      semLiquido++;
      continue;
    }

    const valor = zeroSeNulo(r.liquido);
    retidoAgora += valor;

    if (r.tipo === 'credito') {
      creditosTotal += valor;
      creditosItens++;
    } else if (!r.conciliado) {
      // Só pedido conta como "falta conciliar": crédito da conta nunca terá
      // venda, e pedi-la seria mandar o usuário atrás de algo que não existe.
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
    creditos: { total: centavos(creditosTotal), itens: creditosItens },
  };
}

/**
 * Recebível de um pedido, para a tela de vendas cruzar em O(1).
 * Crédito da conta fica de fora: não há venda para casar com ele.
 */
export function porOrderId(recebiveis: readonly Recebivel[]): Map<string, Recebivel> {
  const mapa = new Map<string, Recebivel>();
  for (const r of recebiveis) {
    if (r.orderId) mapa.set(r.orderId, r);
  }
  return mapa;
}
