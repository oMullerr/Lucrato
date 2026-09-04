/**
 * Conciliação com o faturamento do Mercado Livre.
 *
 * A venda ingerida traz a comissão que veio no pedido (`sale_fee`). A fatura
 * traz o que o Mercado Livre realmente cobrou no fim do mês — e os dois números
 * não são obrigados a bater: campanha comercial, bonificação por devolução,
 * publicidade e taxa de parcelamento entram na fatura sem passar pelo pedido.
 *
 * Este módulo faz duas coisas, as duas puras:
 *   - agrega o detalhe da fatura por rótulo e por pedido (usado no servidor);
 *   - confronta esse agregado com o que o Lucrato registrou (usado na tela).
 *
 * O servidor traz o fato e o app compara, como em `reconcile.ts` e `alerts.ts`.
 * Assim a conciliação se refaz sozinha quando você corrige uma venda, sem
 * precisar consultar o Mercado Livre de novo.
 */
import type { ComputedSale } from '../models/models';

/**
 * Para onde uma cobrança aponta no modelo do Lucrato.
 *
 * São só três porque o Lucrato só modela dois custos de plataforma: comissão
 * (`feePercentage`) e frete do vendedor (`sellerShipping`). Todo o resto que o
 * Mercado Livre cobra é, por definição, custo que o app ainda não conhece — e
 * mostrar isso separado, com o rótulo do próprio Mercado Livre, vale mais do
 * que inventar uma taxonomia que a documentação não publica.
 */
export type Balde = 'comissao' | 'frete' | 'outros';

/**
 * Versão da agregação gravada em `mlBilling`.
 *
 * A soma por balde é calculada na hora de gravar, então mexer na classificação
 * abaixo deixa o que já está gravado desatualizado — e desatualizado, numa tela
 * de conciliação, é pior do que ausente. Subir este número faz o servidor
 * recoletar os períodos antigos na próxima rodada.
 *
 * 2 — códigos reais do Brasil (CVVML, CVVPRC, CDSB, CXDE, CXDED e cancelamentos).
 */
export const VERSAO_AGREGACAO = 2;

/** Cobrança ou bonificação, como o Mercado Livre classifica a linha. */
export type TipoDeLinha = 'CHARGE' | 'BONUS';

/**
 * De-para dos códigos de cobrança.
 *
 * A documentação só publica os genéricos (`CV`, `CXD`, `BXD`). Os do Brasil
 * foram lidos da fatura real: o Mercado Livre desmembrou a tarifa de venda em
 * "custo por vender na plataforma" e "custo por cobrar com Mercado Pago", como
 * a própria página de provisões avisa que faria para o MLB.
 *
 * Os dois juntos são o `sale_fee` que chega no pedido — por isso os dois vão
 * para `comissao`. A taxa de parcelamento e a de recebimento ficam de fora: são
 * acréscimo pago pelo comprador e tarifa de conta, não tarifa da venda.
 *
 * `BXD` fica de fora de propósito: o Mercado Livre usa o MESMO código para
 * "Bonificação do cargo por venda" e "Bonificação cargo por Mercado Envios"
 * (está assim no exemplo do resumo de faturamento). Só o rótulo separa os dois.
 */
const CODIGOS: Readonly<Record<string, Balde>> = {
  // Genéricos, como a documentação nomeia.
  CV: 'comissao',
  BV: 'comissao',
  CXD: 'frete',

  // Tarifa de venda no Brasil, desmembrada.
  CVVML: 'comissao', // Custo por vender no Mercado Livre
  BVVML: 'comissao',
  CVVPRC: 'comissao', // Custo por cobrar no Mercado Pago
  BVVPRC: 'comissao',

  // Envios.
  CDSB: 'frete', // Tarifa do Mercado Envios
  BDSB: 'frete',
  CXDE: 'frete', // Tarifa de envio extra ou intermunicipal
  BXDE: 'frete',
  CXDED: 'frete', // Tarifa de devolução por envio externo ou intermunicipal
  BXDED: 'frete',
};

const ENVIO = /env[ií]o|frete|shipping/i;
const VENDA = /venda|venta|\bsale\b/i;

/**
 * Diz a qual custo do Lucrato uma linha da fatura corresponde.
 *
 * Cobrança desconhecida cai em `outros` de propósito: chutar que uma tarifa
 * nova é comissão faria a comissão do app parecer errada quando o errado é o
 * palpite. Bonificação é o único caso que usa o rótulo, porque precisa devolver
 * o dinheiro ao mesmo balde de onde ele saiu.
 */
export function classificarCobranca(subTipo: string, rotulo: string, tipo: TipoDeLinha): Balde {
  const direto = CODIGOS[(subTipo ?? '').trim().toUpperCase()];
  if (direto) return direto;

  if (tipo === 'BONUS') {
    if (ENVIO.test(rotulo)) return 'frete';
    if (VENDA.test(rotulo)) return 'comissao';
  }
  return 'outros';
}

/** Uma linha do detalhe da fatura, já limpa do payload do Mercado Livre. */
export interface DetalheBruto {
  detailId: number;
  subTipo: string;
  tipo: TipoDeLinha;
  /** `transaction_detail`: o texto que o Mercado Livre mostra na fatura. */
  rotulo: string;
  /** Sempre positivo, como o Mercado Livre manda. O sinal vem de `tipo`. */
  valor: number;
  /** Vazio quando a cobrança não é de pedido nenhum (publicidade, por ex.). */
  orderId: string;
}

/** Total por rótulo, para explicar de onde vem cada real. */
export interface LinhaDoFaturamento {
  rotulo: string;
  subTipo: string;
  balde: Balde;
  /** Líquido: cobranças menos bonificações do mesmo rótulo. */
  valor: number;
  linhas: number;
}

/** O que o Mercado Livre cobrou de um pedido, já somado. */
export interface CobrancaDoPedido {
  orderId: string;
  comissao: number;
  frete: number;
  outros: number;
}

/** Um período de faturamento, do jeito que o servidor grava em `mlBilling`. */
export interface PeriodoDeFaturamento {
  /** Primeiro dia do mês, no formato que a API usa como chave. */
  key: string;
  /** O ciclo NÃO é o mês civil: pode ir de 19/02 a 18/03. */
  dateFrom: string;
  dateTo: string;
  status: 'OPEN' | 'CLOSED';
  /** Total do período conforme o próprio Mercado Livre. */
  totalMl: number;
  cobrado: Record<Balde, number>;
  porRotulo: LinhaDoFaturamento[];
  porPedido: CobrancaDoPedido[];
  detalhes: number;
  /** Passou do teto de linhas: os totais valem, o detalhe está incompleto. */
  truncado: boolean;
  /** Com qual versão da classificação estes números foram somados. */
  versao: number;
}

const zerado = (): Record<Balde, number> => ({ comissao: 0, frete: 0, outros: 0 });

/** Dinheiro em centavos: evita 0.1 + 0.2 aparecer como diferença. */
const arredondar = (v: number): number => Math.round(v * 100) / 100;

/**
 * Soma o detalhe de um período por rótulo e por pedido.
 *
 * Bonificação entra com sinal negativo: ela devolve uma cobrança. É o mesmo
 * critério que o Mercado Livre usa para fechar o total do período, então os
 * dois números têm de conversar.
 */
export function agregarPeriodo(
  base: Pick<PeriodoDeFaturamento, 'key' | 'dateFrom' | 'dateTo' | 'status' | 'totalMl'>,
  detalhes: readonly DetalheBruto[],
  truncado = false,
): PeriodoDeFaturamento {
  const cobrado = zerado();
  const rotulos = new Map<string, LinhaDoFaturamento>();
  const pedidos = new Map<string, CobrancaDoPedido>();

  for (const d of detalhes) {
    const balde = classificarCobranca(d.subTipo, d.rotulo, d.tipo);
    const sinal = d.tipo === 'BONUS' ? -1 : 1;
    const valor = sinal * (isFinite(d.valor) ? d.valor : 0);

    cobrado[balde] += valor;

    const chave = `${d.subTipo}|${d.rotulo}`;
    const linha = rotulos.get(chave);
    if (linha) {
      linha.valor += valor;
      linha.linhas++;
    } else {
      rotulos.set(chave, {
        rotulo: d.rotulo,
        subTipo: d.subTipo,
        balde,
        valor,
        linhas: 1,
      });
    }

    if (!d.orderId) continue;
    const pedido = pedidos.get(d.orderId) ?? { orderId: d.orderId, ...zerado() };
    pedido[balde] += valor;
    pedidos.set(d.orderId, pedido);
  }

  for (const linha of rotulos.values()) linha.valor = arredondar(linha.valor);
  for (const pedido of pedidos.values()) {
    pedido.comissao = arredondar(pedido.comissao);
    pedido.frete = arredondar(pedido.frete);
    pedido.outros = arredondar(pedido.outros);
  }

  return {
    ...base,
    cobrado: {
      comissao: arredondar(cobrado.comissao),
      frete: arredondar(cobrado.frete),
      outros: arredondar(cobrado.outros),
    },
    // Maior primeiro: quem explica mais dinheiro aparece antes.
    porRotulo: [...rotulos.values()].sort((a, b) => Math.abs(b.valor) - Math.abs(a.valor)),
    porPedido: [...pedidos.values()],
    detalhes: detalhes.length,
    truncado,
    versao: VERSAO_AGREGACAO,
  };
}

/* ───────────────────────────── Confronto ───────────────────────────── */

export type Veredito = 'ok' | 'divergente';

export interface ConfrontoDoPedido {
  orderId: string;
  /** Produto do Lucrato — o que você reconhece, não o título do anúncio. */
  produto: string;
  data: string;
  cobrado: Record<Balde, number>;
  registrado: { comissao: number; frete: number };
  /** Cobrado menos registrado. Positivo = o Mercado Livre cobrou mais. */
  diferenca: number;
  veredito: Veredito;
}

export interface Confronto {
  /** Só os pedidos que existem dos dois lados — é a conta que fecha. */
  cobradoComparavel: number;
  registradoComparavel: number;
  diferenca: number;
  /** Pedidos comparáveis, maior divergência primeiro. */
  pedidos: ConfrontoDoPedido[];
  divergentes: number;
  /** Cobrado de pedidos que o Lucrato não reconhece pelo id. */
  semVenda: { total: number; pedidos: number };
  /** Cobrado sem pedido nenhum: publicidade, tarifas de conta. */
  semPedido: number;
  /** Vendas do Mercado Livre no período que a fatura ainda não cobrou. */
  semCobranca: { total: number; vendas: number };
}

/**
 * Quanto uma diferença pode ser só arredondamento.
 *
 * Um centavo por linha, com folga: abaixo disso não há o que investigar, e
 * apontar um alerta por causa de arredondamento faria a tela ser ignorada.
 */
export const TOLERANCIA = 0.05;

/** Comissão e frete que o Lucrato registrou para uma venda. */
function registradoDaVenda(v: ComputedSale): { comissao: number; frete: number } {
  // Venda cancelada ou em disputa não conta como receita, e o Mercado Livre
  // devolve o que cobrou. Comparar a comissão dela contra a fatura acusaria
  // divergência em toda venda cancelada.
  if (!v.countsAsRevenue) return { comissao: 0, frete: 0 };

  // No Flex o frete é pago à transportadora particular, não ao Mercado Livre
  // (regra do negócio, definida em 2026-09-03). Se aparecer cobrança de envio
  // num pedido Flex, a diferença tem de aparecer — e não ser silenciada aqui.
  // `shippingEffective` é negativo para Correios: é custo.
  const daVenda = v.shippingType === 'flex' ? 0 : -v.shippingEffective;

  // O frete da devolução também é cobrado na fatura (tarifa de devolução por
  // envio externo). No Lucrato ele mora na devolução, não na venda — mas é
  // custo do mesmo pedido, então entra na comparação de frete.
  return { comissao: v.feeAmount, frete: daVenda + v.returnShippingTotal };
}

/**
 * Confronta a fatura do período com o que o Lucrato registrou.
 *
 * Uma venda pode ter sido dividida entre vários lotes (FIFO), então as fatias
 * do mesmo `mlOrderId` são somadas antes de comparar — senão cada fatia
 * pareceria cobrada a menos.
 */
export function confrontar(
  periodo: PeriodoDeFaturamento,
  vendas: readonly ComputedSale[],
): Confronto {
  const doLucrato = new Map<
    string,
    { comissao: number; frete: number; produto: string; data: string }
  >();

  for (const v of vendas) {
    const id = v.mlOrderId;
    if (!id) continue;
    const r = registradoDaVenda(v);
    const atual = doLucrato.get(id);
    if (atual) {
      atual.comissao += r.comissao;
      atual.frete += r.frete;
    } else {
      doLucrato.set(id, { ...r, produto: v.product, data: v.saleDate });
    }
  }

  const pedidos: ConfrontoDoPedido[] = [];
  let cobradoComparavel = 0;
  let registradoComparavel = 0;
  let semVendaTotal = 0;
  let semVendaPedidos = 0;
  const casados = new Set<string>();

  for (const c of periodo.porPedido) {
    const total = c.comissao + c.frete + c.outros;
    const meu = doLucrato.get(c.orderId);

    if (!meu) {
      // Normalmente é venda digitada à mão antes da integração: ela existe no
      // Lucrato, só não carrega o id do pedido. Fica fora da conta principal
      // para a diferença não virar "você ainda não conciliou".
      semVendaTotal += total;
      semVendaPedidos++;
      continue;
    }

    casados.add(c.orderId);
    const registrado = { comissao: meu.comissao, frete: meu.frete };
    const registradoTotal = registrado.comissao + registrado.frete;
    const diferenca = arredondar(total - registradoTotal);

    cobradoComparavel += total;
    registradoComparavel += registradoTotal;

    pedidos.push({
      orderId: c.orderId,
      produto: meu.produto,
      data: meu.data,
      cobrado: { comissao: c.comissao, frete: c.frete, outros: c.outros },
      registrado: {
        comissao: arredondar(registrado.comissao),
        frete: arredondar(registrado.frete),
      },
      diferenca,
      veredito: Math.abs(diferenca) > TOLERANCIA ? 'divergente' : 'ok',
    });
  }

  // Vendas do período que a fatura ainda não cobrou. Enquanto o período está
  // aberto isso é esperado; num período fechado é pergunta legítima.
  let semCobrancaTotal = 0;
  let semCobrancaVendas = 0;
  for (const [id, meu] of doLucrato) {
    if (casados.has(id)) continue;
    if (meu.data < periodo.dateFrom || meu.data > periodo.dateTo) continue;
    semCobrancaTotal += meu.comissao + meu.frete;
    semCobrancaVendas++;
  }

  const semPedido = arredondar(
    periodo.cobrado.comissao +
      periodo.cobrado.frete +
      periodo.cobrado.outros -
      periodo.porPedido.reduce((s, p) => s + p.comissao + p.frete + p.outros, 0),
  );

  return {
    cobradoComparavel: arredondar(cobradoComparavel),
    registradoComparavel: arredondar(registradoComparavel),
    diferenca: arredondar(cobradoComparavel - registradoComparavel),
    pedidos: pedidos.sort((a, b) => Math.abs(b.diferenca) - Math.abs(a.diferenca)),
    divergentes: pedidos.filter(p => p.veredito === 'divergente').length,
    semVenda: { total: arredondar(semVendaTotal), pedidos: semVendaPedidos },
    semPedido,
    semCobranca: { total: arredondar(semCobrancaTotal), vendas: semCobrancaVendas },
  };
}
