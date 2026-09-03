/**
 * Alertas de operação dos anúncios.
 *
 * Cada alerta aqui existe porque aponta para uma ação concreta. Métrica que só
 * informa não vira alerta — vira coluna na tabela. O que entra nesta lista é o
 * que está custando dinheiro agora e tem conserto.
 */
import type { ComputedPurchase, ComputedSale, Settings } from '../models/models';
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
  sem_conversao: 'media',
  margem_baixa: 'media',
  pausado_com_estoque: 'baixa',
};

const ORDEM: Record<Severidade, number> = { alta: 0, media: 1, baixa: 2 };

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

  // Vendas por anúncio: quantidade recente e margem média realizada.
  const porAnuncio = new Map<string, { unidades: number; receita: number; lucro: number }>();
  for (const v of vendas) {
    if (!v.mlItemId || !v.countsAsRevenue) continue;
    const atual = porAnuncio.get(v.mlItemId) ?? { unidades: 0, receita: 0, lucro: 0 };
    if (v.saleDate >= desde) atual.unidades += v.effectiveQuantity;
    atual.receita += v.grossRevenue;
    atual.lucro += v.netProfit;
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

    // Margem realizada abaixo da sua meta — com a comissão real, não a estimada.
    if (historico && historico.receita > 0) {
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
