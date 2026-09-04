/**
 * Leitura da página do anúncio.
 *
 * Módulo puro: recebe um documento e devolve o que dá para saber sem chamar
 * ninguém. O Mercado Livre muda o HTML com frequência, então a extração é em
 * camadas — do dado estruturado (que muda pouco) para o texto visível (que
 * muda muito). Quando nada casa, devolve zero em vez de chutar: o painel
 * prefere pedir o preço a você do que mostrar um número inventado.
 */
import { extrairItemId } from '../../src/app/core/ml/item-id';

export interface DadosDaPagina {
  /** `MLB...`, ou vazio quando a página não é de anúncio. */
  itemId: string;
  titulo: string;
  /** Preço anunciado. Zero quando não deu para ler. */
  preco: number;
}

/**
 * Converte o preço como o Brasil escreve: `1.234,56`.
 *
 * O ponto é separador de milhar, não decimal — `parseFloat` sozinho leria
 * "1.234,56" como 1.234 e erraria por mil vezes.
 */
export function precoBr(texto: string): number {
  const limpo = (texto ?? '').replace(/[^\d.,]/g, '');
  if (!limpo) return 0;

  const semMilhar = limpo.replace(/\.(?=\d{3}(\D|$))/g, '');
  const n = Number(semMilhar.replace(',', '.'));
  return isFinite(n) && n > 0 ? n : 0;
}

function conteudoDaMeta(doc: Document, seletor: string): string {
  const el = doc.querySelector(seletor);
  return el?.getAttribute('content') ?? '';
}

function textoDe(doc: Document, seletor: string): string {
  return doc.querySelector(seletor)?.textContent?.trim() ?? '';
}

/**
 * Preço do anúncio, tentando do mais estável ao menos estável:
 *   1. `<meta itemprop="price">` — dado estruturado, sobrevive a redesenho;
 *   2. o bloco de preço da página, juntando reais e centavos;
 *   3. o primeiro valor monetário visível.
 */
export function lerPreco(doc: Document): number {
  const meta = conteudoDaMeta(doc, 'meta[itemprop="price"]');
  if (meta) {
    const n = Number(meta);
    if (isFinite(n) && n > 0) return n;
    const br = precoBr(meta);
    if (br > 0) return br;
  }

  const bloco = doc.querySelector('.ui-pdp-price__second-line') ?? doc.body;
  const reais = bloco?.querySelector('.andes-money-amount__fraction')?.textContent ?? '';
  const centavos = bloco?.querySelector('.andes-money-amount__cents')?.textContent ?? '';
  if (reais) {
    const n = precoBr(centavos ? `${reais},${centavos}` : reais);
    if (n > 0) return n;
  }

  return 0;
}

export function lerTitulo(doc: Document): string {
  return (
    conteudoDaMeta(doc, 'meta[itemprop="name"]') ||
    textoDe(doc, 'h1.ui-pdp-title') ||
    textoDe(doc, 'h1')
  );
}

/**
 * Lê a página inteira.
 *
 * O id sai da URL, não do HTML: é o único lugar em que o Mercado Livre é
 * obrigado a ser estável, porque é o endereço.
 */
export function lerPagina(doc: Document, url: string): DadosDaPagina {
  const itemId = extrairItemId(url);
  if (!itemId) return { itemId: '', titulo: '', preco: 0 };

  return { itemId, titulo: lerTitulo(doc), preco: lerPreco(doc) };
}
