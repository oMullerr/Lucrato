/**
 * Alertas de operação dos anúncios.
 *
 * Cada alerta aqui existe porque aponta para uma ação concreta. Métrica que só
 * informa não vira alerta — vira coluna na tabela. O que entra nesta lista é o
 * que está custando dinheiro agora e tem conserto.
 */
import type { ComputedPurchase, ComputedSale, Settings } from '../models/models';
import { calcular } from '../pricing/pricing';
import { normalizarChaveProduto } from './matching';

/** Anúncio como a tela conhece, com as métricas já sincronizadas. */
export interface AnuncioParaAlerta {
  id: string;
  title: string;
  status: string;
  availableQuantity: number;
  price: number;
  visits30d?: number;
}

export type TipoAlerta =
  | 'ativo_sem_estoque'
  | 'pausado_com_estoque'
  | 'preco_abaixo_do_minimo'
  | 'margem_baixa'
  | 'sem_conversao';

export type Severidade = 'alta' | 'media' | 'baixa';

export interface Alerta {
  tipo: TipoAlerta;
  severidade: Severidade;
  itemId: string;
  titulo: string;
  /** Números que a mensagem usa. */
  dados: Record<string, string | number>;
}

/** Visitas mínimas para cobrar conversão. Abaixo disso é amostra pequena demais. */
export const MINIMO_DE_VISITAS = 50;
/** Janela de vendas considerada nos alertas. */
export const JANELA_DIAS = 30;

const SEVERIDADE: Record<TipoAlerta, Severidade> = {
  ativo_sem_estoque: 'alta',
  /* Grave porque é dinheiro que ainda NÃO se perdeu: o anúncio está no ar
     agora, e a próxima venda fecha abaixo do seu piso. Tem conserto imediato —
     mudar o preço ou tirar do ar. */
  preco_abaixo_do_minimo: 'alta',
  sem_conversao: 'media',
  margem_baixa: 'media',
  pausado_com_estoque: 'baixa',
};

const ORDEM: Record<Severidade, number> = { alta: 0, media: 1, baixa: 2 };

/** Mesma ordem do FIFO do razão: recebimento (ou compra) e, no empate, o id. */
function ordemFifo(a: ComputedPurchase, b: ComputedPurchase): number {
  const da = a.receiptDate || a.purchaseDate;
  const db = b.receiptDate || b.purchaseDate;
  return da === db ? a.id.localeCompare(b.id) : da.localeCompare(db);
}

function diasAtras(dias: number, ref: Date): string {
  const d = new Date(ref);
  d.setDate(d.getDate() - dias);
  return d.toISOString().slice(0, 10);
}

/**
 * Gera os alertas a partir do que já está sincronizado.
 *
 * Puro: recebe o retrato atual e devolve a lista, ordenada por gravidade.
 * A tela não decide nada, só desenha.
 */
export function gerarAlertas(
  anuncios: readonly AnuncioParaAlerta[],
  vinculos: ReadonlyMap<string, { produto: string }>,
  vendas: readonly ComputedSale[],
  lotes: readonly ComputedPurchase[],
  settings: Settings | null,
  ref: Date = new Date(),
): Alerta[] {
  const margemMinima = settings?.minimumMargin ?? 0.1;
  const desde = diasAtras(JANELA_DIAS, ref);

  // Estoque do Lucrato por produto, para saber o que está parado.
  const estoquePorChave = new Map<string, number>();
  for (const lote of lotes) {
    const chave = normalizarChaveProduto(lote.product);
    if (!chave) continue;
    estoquePorChave.set(chave, (estoquePorChave.get(chave) ?? 0) + lote.currentStock);
  }

  /* Custo da PRÓXIMA unidade a sair, por produto — o lote mais antigo com
     estoque, que é o mesmo FIFO que o razão usa ao lançar a venda. É ele que
     decide quanto a venda de amanhã custa, e por isso é ele que entra na
     previsão de margem. */
  const custoDoProximo = new Map<string, number>();
  for (const lote of [...lotes].sort(ordemFifo)) {
    const chave = normalizarChaveProduto(lote.product);
    if (!chave || lote.currentStock <= 0 || custoDoProximo.has(chave)) continue;
    custoDoProximo.set(chave, lote.actualUnitCost);
  }

  // Vendas por anúncio: quantidade recente, margem realizada e os custos que
  // a plataforma cobrou de verdade.
  const porAnuncio = new Map<string, {
    unidades: number; receita: number; lucro: number;
    comissaoSoma: number; freteSoma: number; unidadesTotais: number; vendas: number;
  }>();
  for (const v of vendas) {
    if (!v.mlItemId || !v.countsAsRevenue) continue;
    const atual = porAnuncio.get(v.mlItemId)
      ?? { unidades: 0, receita: 0, lucro: 0, comissaoSoma: 0, freteSoma: 0, unidadesTotais: 0, vendas: 0 };
    if (v.saleDate >= desde) atual.unidades += v.effectiveQuantity;
    atual.receita += v.grossRevenue;
    atual.lucro += v.netProfit;
    atual.comissaoSoma += v.feePercentage;
    atual.vendas += 1;
    // Frete líquido por unidade: o que saiu menos o que voltou.
    atual.freteSoma += v.shippingCostEffective - v.shippingCreditEffective;
    atual.unidadesTotais += v.effectiveQuantity;
    porAnuncio.set(v.mlItemId, atual);
  }

  const alertas: Alerta[] = [];

  for (const anuncio of anuncios) {
    const ativo = anuncio.status === 'active';
    const vinculo = vinculos.get(anuncio.id);
    const historico = porAnuncio.get(anuncio.id);

    // Anúncio no ar sem estoque: aparece na busca e não converte.
    if (ativo && anuncio.availableQuantity === 0) {
      alertas.push({
        tipo: 'ativo_sem_estoque',
        severidade: SEVERIDADE.ativo_sem_estoque,
        itemId: anuncio.id,
        titulo: anuncio.title,
        dados: {},
      });
    }

    // Pausado com estoque parado: capital imobilizado sem chance de vender.
    if (!ativo && vinculo) {
      const parado = estoquePorChave.get(normalizarChaveProduto(vinculo.produto)) ?? 0;
      if (parado > 0) {
        alertas.push({
          tipo: 'pausado_com_estoque',
          severidade: SEVERIDADE.pausado_com_estoque,
          itemId: anuncio.id,
          titulo: anuncio.title,
          dados: { estoque: parado },
        });
      }
    }

    /* Preço do anúncio abaixo do seu piso, ANTES de vender.
     *
     * `margem_baixa`, logo abaixo, olha para trás: só acusa depois que a venda
     * ruim já aconteceu. Este olha para frente — pega o preço que está no ar
     * agora, o custo do lote que sairia na próxima venda e a comissão que a
     * plataforma vem cobrando, e responde se essa venda fecharia acima do
     * mínimo. É o caso do plano: "seja porque você mudou o preço, seja porque
     * o custo do lote novo subiu".
     *
     * Só com vínculo e com estoque: sem lote não há custo, e sem custo
     * qualquer margem seria invenção. Sem estoque quem fala é
     * `ativo_sem_estoque`, e dois alertas para o mesmo anúncio viram ruído.
     */
    let precoAbaixo = false;
    if (ativo && vinculo) {
      const custo = custoDoProximo.get(normalizarChaveProduto(vinculo.produto));
      if (custo !== undefined && anuncio.price > 0) {
        const previsao = calcular({
          precoVenda: anuncio.price,
          custoProduto: custo,
          custosExtras: 0,
          /* Zero de propósito: o motor de lucro do app também não tira imposto
             por venda — no MEI o DAS é fixo e mora na tela Fiscal. Descontar
             aqui faria este alerta discordar de toda a base. */
          impostoPct: 0,
          comissaoPct: historico && historico.vendas > 0
            ? historico.comissaoSoma / historico.vendas
            : (settings?.defaultMlFee ?? 0.12),
          taxaFixa: 0,
          frete: historico && historico.unidadesTotais > 0
            ? Math.max(0, historico.freteSoma / historico.unidadesTotais)
            : 0,
          quantidade: 1,
        });

        if (previsao.margemContribuicao < margemMinima) {
          precoAbaixo = true;
          alertas.push({
            tipo: 'preco_abaixo_do_minimo',
            severidade: SEVERIDADE.preco_abaixo_do_minimo,
            itemId: anuncio.id,
            titulo: anuncio.title,
            dados: {
              margem: Math.round(previsao.margemContribuicao * 1000) / 10,
              minima: Math.round(margemMinima * 1000) / 10,
              lucro: Math.round(previsao.lucroUnitario * 100) / 100,
            },
          });
        }
      }
    }

    /* Margem realizada abaixo da sua meta — com a comissão real, não a
       estimada. Suprimida quando a previsão acima já disparou: as duas
       apontam o mesmo anúncio, e a acionável é a que fala do preço que ainda
       está no ar. Duas linhas para o mesmo problema tiram da lista a chance de
       ser lida. */
    if (!precoAbaixo && historico && historico.receita > 0) {
      const margem = historico.lucro / historico.receita;
      if (margem < margemMinima) {
        alertas.push({
          tipo: 'margem_baixa',
          severidade: SEVERIDADE.margem_baixa,
          itemId: anuncio.id,
          titulo: anuncio.title,
          dados: {
            margem: Math.round(margem * 1000) / 10,
            minima: Math.round(margemMinima * 1000) / 10,
          },
        });
      }
    }

    // Audiência sem venda: o problema é a oferta, não a exposição.
    const visitas = anuncio.visits30d ?? 0;
    if (ativo && visitas >= MINIMO_DE_VISITAS && (historico?.unidades ?? 0) === 0) {
      alertas.push({
        tipo: 'sem_conversao',
        severidade: SEVERIDADE.sem_conversao,
        itemId: anuncio.id,
        titulo: anuncio.title,
        dados: { visitas },
      });
    }
  }

  return alertas.sort(
    (a, b) => ORDEM[a.severidade] - ORDEM[b.severidade] || a.titulo.localeCompare(b.titulo, 'pt-BR'),
  );
}
