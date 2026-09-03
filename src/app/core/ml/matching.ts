/**
 * Casamento entre anúncios do Mercado Livre e produtos do Lucrato.
 *
 * Módulo puro, sem Angular e sem Firebase: é compartilhado com as Cloud
 * Functions (ver `functions/tsconfig.json`), para que a chave gravada no
 * servidor seja exatamente a mesma que a tela calcula. Se as duas pontas
 * divergirem, vínculo some sem explicação.
 */

/**
 * Chave canônica de um produto: minúsculas, sem acento, sem pontuação e com
 * espaços colapsados. É o que liga `Purchase.product` a um anúncio.
 */
export function normalizarChaveProduto(nome: string): string {
  return (nome ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/** Trigramas de uma string já normalizada, com bordas para valorizar início e fim. */
function trigramas(texto: string): Set<string> {
  const base = `  ${texto} `;
  const saida = new Set<string>();
  for (let i = 0; i < base.length - 2; i++) saida.add(base.slice(i, i + 3));
  return saida;
}

/**
 * Semelhança entre dois nomes, de 0 a 1 (coeficiente de Dice sobre trigramas).
 *
 * Trigrama tolera plural, abreviação e ordem trocada de palavras melhor do que
 * comparar palavra a palavra, que é o erro comum aqui.
 */
export function similaridade(a: string, b: string): number {
  const na = normalizarChaveProduto(a);
  const nb = normalizarChaveProduto(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;

  const ta = trigramas(na);
  const tb = trigramas(nb);
  let comuns = 0;
  for (const t of ta) if (tb.has(t)) comuns++;
  return (2 * comuns) / (ta.size + tb.size);
}

/** Abaixo disso a sugestão é ruído e não deve nem aparecer marcada. */
export const LIMIAR_SUGESTAO = 0.55;

export type OrigemSugestao = 'sku' | 'titulo';

export interface Sugestao {
  /** Chave normalizada do produto sugerido. */
  productKey: string;
  /** Nome como aparece no Lucrato, para exibir. */
  produto: string;
  /** 1 quando veio de SKU exato. */
  score: number;
  origem: OrigemSugestao;
}

export interface ProdutoCandidato {
  /** `Purchase.product`, texto livre como o usuário digitou. */
  produto: string;
  /** `Purchase.sku`, quando preenchido. */
  sku?: string;
}

/**
 * Sugere o produto de um anúncio.
 *
 * SKU igual vence sempre: é informação que o próprio vendedor cadastrou, então
 * não faz sentido deixar o título discordar dela. Sem SKU, cai no título e só
 * sugere acima do limiar.
 */
export function sugerirProduto(
  anuncio: { title: string; sku?: string | null },
  candidatos: readonly ProdutoCandidato[],
): Sugestao | null {
  const skuAnuncio = (anuncio.sku ?? '').trim().toLowerCase();

  if (skuAnuncio) {
    const porSku = candidatos.find((c) => (c.sku ?? '').trim().toLowerCase() === skuAnuncio);
    if (porSku) {
      return {
        productKey: normalizarChaveProduto(porSku.produto),
        produto: porSku.produto,
        score: 1,
        origem: 'sku',
      };
    }
  }

  let melhor: Sugestao | null = null;
  for (const c of candidatos) {
    const score = similaridade(anuncio.title, c.produto);
    if (score >= LIMIAR_SUGESTAO && (!melhor || score > melhor.score)) {
      melhor = {
        productKey: normalizarChaveProduto(c.produto),
        produto: c.produto,
        score,
        origem: 'titulo',
      };
    }
  }
  return melhor;
}
