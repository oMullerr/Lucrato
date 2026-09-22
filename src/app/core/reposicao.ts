/**
 * O que comprar, quanto, e até quando.
 *
 * O app respondia "o que eu tenho" (Estoque) e "o que eu ganhei" (Painel,
 * Análises), mas não a pergunta que vem depois e custa dinheiro nas duas
 * direções: repor cedo demais empata capital, repor tarde demais perde venda
 * com o anúncio no ar. Todos os números para responder já estavam no sistema —
 * faltava cruzá-los.
 *
 * O PRAZO DO FORNECEDOR É MEDIDO, NÃO PERGUNTADO. Cada lote guarda a data da
 * compra e a do recebimento, então quanto aquele fornecedor demora está escrito
 * no seu próprio histórico. Pedir o prazo num formulário seria pedir de volta
 * um dado que já foi dado — e que envelheceria sem ninguém lembrar de mexer.
 *
 * Mediana, não média: uma entrega que atrasou dois meses não pode virar o
 * prazo normal do fornecedor.
 *
 * Módulo PURO: recebe o retrato calculado e devolve a lista. Sem signals, sem
 * consulta, sem formatação.
 */
import type { ComputedPurchase, ComputedSale } from './models/models';

/** Janela de venda usada para medir o ritmo. Um trimestre absorve sazonalidade curta. */
export const JANELA_PADRAO_DIAS = 90;

/**
 * Quantos dias de estoque a compra deve deixar DEPOIS de chegar.
 *
 * Sem isto, a sugestão repõe exatamente o que falta para o prazo e a próxima
 * compra vira imediata: o estoque fica raspando o zero o tempo todo.
 */
export const COBERTURA_ALVO_DIAS = 30;

/** Prazo assumido quando não há nenhum recebimento no histórico para medir. */
export const PRAZO_PADRAO_DIAS = 15;

/**
 * Vendas distintas na janela para o produto contar como demanda.
 *
 * DUAS não é número escolhido a esmo: é o mínimo que consegue mostrar
 * repetição. Com uma venda só não há como separar o produto que você revende
 * sempre daquele que apareceu, vendeu e acabou — e o segundo é a maioria de
 * quem garimpa oferta.
 *
 * Sem este corte a lista tinha 36 linhas numa base real, 22 delas apoiadas numa
 * única venda em 90 dias, todas com estoque zero. Isso não é pauta de compra: é
 * a lista de tudo que já passou pela loja. Mesmo princípio do
 * `MINIMO_DE_VISITAS` dos alertas — abaixo de certa amostra, o número não
 * significa nada.
 */
export const MINIMO_DE_VENDAS = 2;

export type Urgencia = 'atrasado' | 'critico' | 'atencao';

export interface SugestaoDeCompra {
  produto: string;
  /** Fornecedor do lote mais recente deste produto. */
  fornecedor: string;
  /** Unidades disponíveis hoje, somando os lotes. */
  estoque: number;
  /** Unidades vendidas por dia, no ritmo da janela. */
  velocidadeDiaria: number;
  /** Dias que o estoque ainda cobre nesse ritmo. */
  coberturaDias: number;
  /** Prazo entre pedir e receber, deste fornecedor. */
  prazoDias: number;
  /** `false` quando o prazo é o padrão, por não haver recebimento para medir. */
  prazoMedido: boolean;
  /**
   * Dias que ainda restam para fazer o pedido sem furar o estoque.
   * Negativo significa que a janela já passou.
   */
  diasParaPedir: number;
  /** Unidades sugeridas: cobre o prazo e ainda deixa `COBERTURA_ALVO_DIAS`. */
  quantidade: number;
  urgencia: Urgencia;
  /** De onde saiu o ritmo, para a tela poder dizer o quanto confiar. */
  base: { dias: number; unidades: number; vendas: number };
}

const ORDEM: Record<Urgencia, number> = { atrasado: 0, critico: 1, atencao: 2 };

/** Dia (YYYY-MM-DD) de `dias` atrás. */
function desde(dias: number, ref: Date): string {
  const d = new Date(ref);
  d.setDate(d.getDate() - dias);
  return d.toISOString().slice(0, 10);
}

/** Diferença em dias entre dois dias de calendário (YYYY-MM-DD). */
function diasEntre(de: string, ate: string): number {
  const a = Date.parse(`${de}T00:00:00Z`);
  const b = Date.parse(`${ate}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return NaN;
  return Math.round((b - a) / 86_400_000);
}

function mediana(valores: readonly number[]): number | null {
  if (valores.length === 0) return null;
  const ordenados = [...valores].sort((a, b) => a - b);
  const meio = Math.floor(ordenados.length / 2);
  return ordenados.length % 2 === 1
    ? ordenados[meio]
    : (ordenados[meio - 1] + ordenados[meio]) / 2;
}

/**
 * Quanto este fornecedor costuma demorar entre o pedido e o recebimento.
 *
 * `null` quando não há nenhum lote dele já recebido. Lote sem `receiptDate`
 * ainda está em trânsito e não tem prazo fechado; um recebimento ANTES da
 * compra é erro de digitação e fica de fora, porque um prazo negativo
 * contaminaria a mediana.
 */
export function prazoDoFornecedor(
  lotes: readonly ComputedPurchase[],
  fornecedor?: string,
): number | null {
  const prazos: number[] = [];
  for (const l of lotes) {
    if (fornecedor !== undefined && l.supplier !== fornecedor) continue;
    if (!l.receiptDate || !l.purchaseDate) continue;
    const d = diasEntre(l.purchaseDate, l.receiptDate);
    if (Number.isNaN(d) || d < 0) continue;
    prazos.push(d);
  }
  return mediana(prazos);
}

/**
 * Cruza ritmo de venda, estoque e prazo do fornecedor.
 *
 * Só entra produto com DEMANDA MEDIDA na janela. Sem saída não há ritmo, e sem
 * ritmo qualquer sugestão seria chute — inclusive a de um produto encalhado,
 * que não precisa de reposição e sim de decisão sobre o que já está parado.
 * Produto com cobertura folgada também fica de fora: uma lista que inclui o
 * que está tranquilo deixa de ser pauta e vira relatório.
 */
export function sugerirReposicao(
  lotes: readonly ComputedPurchase[],
  vendas: readonly ComputedSale[],
  janelaDias: number = JANELA_PADRAO_DIAS,
  ref: Date = new Date(),
): SugestaoDeCompra[] {
  if (janelaDias <= 0) return [];
  const corte = desde(janelaDias, ref);

  const porProduto = new Map<string, {
    estoque: number;
    unidades: number;
    vendas: number;
    fornecedor: string;
    ultimaCompra: string;
  }>();

  const pega = (nome: string) => {
    const atual = porProduto.get(nome)
      ?? { estoque: 0, unidades: 0, vendas: 0, fornecedor: '', ultimaCompra: '' };
    porProduto.set(nome, atual);
    return atual;
  };

  for (const l of lotes) {
    const e = pega(l.product);
    if (l.currentStock > 0) e.estoque += l.currentStock;
    /* O fornecedor é o do lote MAIS RECENTE: é dele que você compraria de
       novo. Trocar de fornecedor no meio do caminho é comum, e usar o primeiro
       mediria o prazo de quem não atende mais. */
    if (l.purchaseDate > e.ultimaCompra) {
      e.ultimaCompra = l.purchaseDate;
      e.fornecedor = l.supplier;
    }
  }

  for (const v of vendas) {
    if (!v.countsAsRevenue || v.saleDate < corte) continue;
    const e = pega(v.product);
    e.unidades += v.effectiveQuantity;
    e.vendas += 1;
  }

  const prazoGeral = prazoDoFornecedor(lotes);
  const sugestoes: SugestaoDeCompra[] = [];

  for (const [produto, e] of porProduto) {
    if (e.unidades <= 0) continue;
    if (e.vendas < MINIMO_DE_VENDAS) continue;

    const velocidadeDiaria = e.unidades / janelaDias;
    const coberturaDias = velocidadeDiaria > 0 ? e.estoque / velocidadeDiaria : 0;

    const medido = prazoDoFornecedor(lotes, e.fornecedor) ?? prazoGeral;
    const prazoDias = medido ?? PRAZO_PADRAO_DIAS;
    const diasParaPedir = Math.floor(coberturaDias - prazoDias);

    /* Acima do prazo mais o alvo, a compra pode esperar. Entrar aqui só para
       dizer "está tudo bem" treinaria a pessoa a ignorar a lista inteira. */
    if (diasParaPedir > COBERTURA_ALVO_DIAS) continue;

    const alvo = velocidadeDiaria * (prazoDias + COBERTURA_ALVO_DIAS);
    const quantidade = Math.max(1, Math.ceil(alvo - e.estoque));

    const urgencia: Urgencia =
      e.estoque <= 0 || diasParaPedir < 0 ? 'atrasado'
      : diasParaPedir <= Math.max(3, prazoDias / 3) ? 'critico'
      : 'atencao';

    sugestoes.push({
      produto,
      fornecedor: e.fornecedor,
      estoque: e.estoque,
      velocidadeDiaria,
      coberturaDias,
      prazoDias,
      prazoMedido: medido !== null,
      diasParaPedir,
      quantidade,
      urgencia,
      base: { dias: janelaDias, unidades: e.unidades, vendas: e.vendas },
    });
  }

  /* A velocidade desempata ANTES do nome, e isso importa mais do que parece:
     quando tudo está sem estoque — o normal em quem garimpa oferta — o prazo
     restante é o mesmo para todos, e o desempate caía em ordem alfabética.
     Numa base real isso escondia a esmerilhadeira de 5 vendas atrás de itens
     de uma venda só, no topo da lista, por causa da letra inicial.

     Quem vende mais rápido perde mais por estar sem estoque, e é por isso que
     vem primeiro. */
  return sugestoes.sort(
    (a, b) => ORDEM[a.urgencia] - ORDEM[b.urgencia]
      || a.diasParaPedir - b.diasParaPedir
      || b.velocidadeDiaria - a.velocidadeDiaria
      || a.produto.localeCompare(b.produto),
  );
}
