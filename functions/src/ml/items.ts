/**
 * Sincronização dos anúncios do vendedor.
 *
 * Traz título, SKU, preço, estoque e modo de envio de cada anúncio para
 * `users/{uid}/mlItems/{itemId}`, que é a base da tela de vínculo: é por ali
 * que um anúncio passa a apontar para um produto do Lucrato.
 *
 * Somente leitura: nada é enviado de volta ao Mercado Livre.
 */
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { HttpsError, onCall } from 'firebase-functions/v2/https';

import { ML_CLIENT_ID, ML_CLIENT_SECRET } from '../config';
import { criarMlClient, MlClient } from './client';

/** Teto defensivo: acima disso a conta é grande demais para uma chamada só. */
const MAX_ITENS = 5_000;
/** O multiget aceita vários ids; 20 mantém a URL curta e a resposta digerível. */
const LOTE_DETALHE = 20;
/** `search_type=scan` devolve até 100 por página. */
const PAGINA_SCAN = 100;

export interface MlItemNormalizado {
  id: string;
  title: string;
  /** SKU do vendedor, quando preenchido no anúncio. É a chave do vínculo automático. */
  sku: string | null;
  price: number;
  availableQuantity: number;
  soldQuantity: number;
  status: string;
  /**
   * Detalhe do status. `deleted` aqui é o que separa "anúncio encerrado, que
   * ainda existe" de "anúncio excluído, que não existe mais".
   */
  subStatus: string[];
  listingTypeId: string;
  categoryId: string;
  catalogProductId: string | null;
  permalink: string;
  thumbnail: string;
  shippingMode: string;
  logisticType: string;
  freeShipping: boolean;
  variations: { id: string; sku: string | null; availableQuantity: number; price: number }[];
}

type Bruto = Record<string, unknown>;

const texto = (v: unknown): string => (typeof v === 'string' ? v : '');
const numero = (v: unknown): number => (typeof v === 'number' && isFinite(v) ? v : 0);

/**
 * Sobe a URL da miniatura para https.
 *
 * O Mercado Livre nem sempre preenche `secure_thumbnail`, e o `thumbnail` vem
 * em `http://`. Numa página servida por https isso não aparece de jeito
 * nenhum: o navegador bloqueia como conteúdo misto, e o nosso CSP (`img-src`
 * aceita só `https:`) barra de novo. O mesmo arquivo existe em https no
 * mlstatic — conferido: 200 image/jpeg no mesmo caminho.
 *
 * A imagem quebrada não derruba a tela, e é justamente por isso que passa: a
 * página funciona, só fica sem foto.
 */
const emHttps = (url: string): string => url.replace(/^http:\/\//i, 'https://');

/**
 * SKU do vendedor. O Mercado Livre guarda em dois lugares por razões
 * históricas: no atributo `SELLER_SKU` e no antigo `seller_custom_field`.
 */
export function skuDoAnuncio(raw: Bruto): string | null {
  const attrs = Array.isArray(raw['attributes']) ? (raw['attributes'] as Bruto[]) : [];
  const attr = attrs.find((a) => a['id'] === 'SELLER_SKU');
  const doAtributo = texto(attr?.['value_name']).trim();
  if (doAtributo) return doAtributo;
  const legado = texto(raw['seller_custom_field']).trim();
  return legado || null;
}

/** Converte a resposta crua do anúncio no formato que a tela consome. */
export function normalizarItem(raw: Bruto): MlItemNormalizado {
  const shipping = (raw['shipping'] ?? {}) as Bruto;
  const variacoesBrutas = Array.isArray(raw['variations']) ? (raw['variations'] as Bruto[]) : [];

  return {
    id: texto(raw['id']),
    title: texto(raw['title']),
    sku: skuDoAnuncio(raw),
    price: numero(raw['price']),
    availableQuantity: numero(raw['available_quantity']),
    soldQuantity: numero(raw['sold_quantity']),
    status: texto(raw['status']),
    subStatus: Array.isArray(raw['sub_status'])
      ? (raw['sub_status'] as unknown[]).map(texto).filter(Boolean)
      : [],
    listingTypeId: texto(raw['listing_type_id']),
    categoryId: texto(raw['category_id']),
    catalogProductId: texto(raw['catalog_product_id']) || null,
    permalink: texto(raw['permalink']),
    thumbnail: emHttps(texto(raw['secure_thumbnail']) || texto(raw['thumbnail'])),
    shippingMode: texto(shipping['mode']),
    logisticType: texto(shipping['logistic_type']),
    freeShipping: shipping['free_shipping'] === true,
    variations: variacoesBrutas.map((v) => ({
      id: String(v['id'] ?? ''),
      sku: skuDoAnuncio(v),
      availableQuantity: numero(v['available_quantity']),
      price: numero(v['price']),
    })),
  };
}

/** Percorre todos os ids de anúncio do vendedor usando scroll. */
export async function listarIdsDeAnuncios(cliente: MlClient, mlUserId: number): Promise<string[]> {
  const ids: string[] = [];
  let scrollId: string | undefined;

  while (ids.length < MAX_ITENS) {
    const pagina = await cliente.get<{ results?: string[]; scroll_id?: string }>(
      `/users/${mlUserId}/items/search`,
      { search_type: 'scan', limit: PAGINA_SCAN, scroll_id: scrollId },
    );
    const lote = pagina.results ?? [];
    if (lote.length === 0) break;
    ids.push(...lote);
    scrollId = pagina.scroll_id;
    if (!scrollId) break;
  }

  return ids.slice(0, MAX_ITENS);
}

/** Busca os detalhes em blocos. Usa `/items/bulk`, que substitui o antigo `/items?ids=`. */
export async function buscarDetalhes(
  cliente: MlClient,
  ids: readonly string[],
): Promise<MlItemNormalizado[]> {
  const itens: MlItemNormalizado[] = [];

  for (let i = 0; i < ids.length; i += LOTE_DETALHE) {
    const bloco = ids.slice(i, i + LOTE_DETALHE);
    const resposta = await cliente.get<Bruto[]>('/items/bulk', { ids: bloco.join(',') });
    for (const entrada of resposta ?? []) {
      const status = numero(entrada['status_code']) || numero(entrada['code']);
      const corpo = (entrada['body'] ?? entrada) as Bruto;
      if (status && status !== 200) continue;
      if (!texto(corpo['id'])) continue;
      itens.push(normalizarItem(corpo));
    }
  }

  return itens;
}

/**
 * O que fazer com cada anúncio guardado que a busca não devolveu.
 *
 * Anúncio excluído no Mercado Livre some da busca, mas a sincronização só
 * gravava — nunca removia. Na conta real isso deixou 118 de 128 anúncios
 * (92%) congelados na tela, quatro deles marcados como ativos, aparecendo no
 * topo da lista à frente dos que realmente existem.
 *
 * O caminho óbvio — apagar tudo que a busca não trouxe — é perigoso: uma busca
 * que falhe pela metade limparia a coleção inteira. Por isso **ausência na
 * busca nunca basta**. Cada candidato é confirmado em `/items/bulk`, e só sai
 * quando o próprio Mercado Livre diz que foi excluído.
 *
 * Duas travas contra o desastre inverso:
 *   - busca vazia não remove nada (conta vazia é raro; busca falhando não é);
 *   - confirmação que não devolveu NADA também não remove nada.
 *
 * Puro de propósito: é o caminho que apaga dado, e precisa ser testável sem rede.
 */
export function decidirDestino(
  guardados: readonly string[],
  encontrados: readonly string[],
  confirmados: ReadonlyMap<string, MlItemNormalizado>,
): { remover: string[]; atualizar: MlItemNormalizado[] } {
  const vazio = { remover: [], atualizar: [] };
  if (encontrados.length === 0) return vazio;

  const vivos = new Set(encontrados);
  const candidatos = guardados.filter((id) => !vivos.has(id));
  if (candidatos.length === 0) return vazio;
  if (confirmados.size === 0) return vazio;

  const remover: string[] = [];
  const atualizar: MlItemNormalizado[] = [];

  for (const id of candidatos) {
    const confirmado = confirmados.get(id);
    // Nem a consulta direta reconhece: o anúncio não existe mais.
    if (!confirmado) {
      remover.push(id);
      continue;
    }
    if (confirmado.subStatus.includes('deleted')) {
      remover.push(id);
      continue;
    }
    // Existe, mas saiu da busca — encerrado. Atualiza para a tela parar de
    // mostrá-lo com o status velho.
    atualizar.push(confirmado);
  }

  return { remover, atualizar };
}

/** Sincroniza os anúncios do vendedor conectado. */
export const mlSyncItems = onCall(
  {
    enforceAppCheck: false,
    secrets: [ML_CLIENT_ID, ML_CLIENT_SECRET],
    timeoutSeconds: 540,
    memory: '512MiB',
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Faça login para sincronizar os anúncios.');
    }
    const uid = request.auth.uid;
    const db = getFirestore();

    const segredo = await db.doc(`users/${uid}/secret/ml`).get();
    const mlUserId = segredo.exists ? Number(segredo.get('mlUserId')) : 0;
    if (!mlUserId) {
      throw new HttpsError('failed-precondition', 'Conecte a conta do Mercado Livre primeiro.');
    }

    const cliente = criarMlClient(uid, ML_CLIENT_ID.value(), ML_CLIENT_SECRET.value());

    try {
      const ids = await listarIdsDeAnuncios(cliente, mlUserId);
      const itens = await buscarDetalhes(cliente, ids);

      // Reconciliação: o que está guardado e não veio na busca pode ter sido
      // excluído — mas isso é confirmado antes de qualquer remoção.
      const guardados = (await db.collection(`users/${uid}/mlItems`).listDocuments()).map(
        (ref) => ref.id,
      );
      const vivos = new Set(ids);
      const candidatos = guardados.filter((id) => !vivos.has(id));

      const confirmados = new Map<string, MlItemNormalizado>();
      if (ids.length > 0 && candidatos.length > 0) {
        for (const item of await buscarDetalhes(cliente, candidatos)) {
          confirmados.set(item.id, item);
        }
      }

      const { remover, atualizar } = decidirDestino(guardados, ids, confirmados);

      // Grava em lotes; o Firestore aceita 500 operações por batch.
      const gravar = [...itens, ...atualizar];
      for (let i = 0; i < gravar.length; i += 400) {
        const batch = db.batch();
        for (const item of gravar.slice(i, i + 400)) {
          batch.set(
            db.doc(`users/${uid}/mlItems/${item.id}`),
            { ...item, updatedAt: Timestamp.now() },
            { merge: true },
          );
        }
        await batch.commit();
      }

      for (let i = 0; i < remover.length; i += 400) {
        const batch = db.batch();
        for (const id of remover.slice(i, i + 400)) {
          batch.delete(db.doc(`users/${uid}/mlItems/${id}`));
        }
        await batch.commit();
      }

      await db.doc(`users/${uid}/db/ml`).set(
        {
          itemsCount: itens.length,
          itemsSyncedAt: Timestamp.now(),
          lastSyncAt: Timestamp.now(),
          lastError: null,
        },
        { merge: true },
      );

      logger.info('Anúncios sincronizados', {
        uid,
        total: itens.length,
        removidos: remover.length,
        encerrados: atualizar.length,
      });
      return { total: itens.length, removidos: remover.length };
    } catch (err) {
      const motivo = String((err as Error).message);
      await db.doc(`users/${uid}/db/ml`).set(
        { lastError: motivo, updatedAt: Timestamp.now() },
        { merge: true },
      );
      if (motivo === 'reconexao_necessaria') {
        throw new HttpsError('failed-precondition', 'Reconecte a conta do Mercado Livre.');
      }
      logger.error('Falha ao sincronizar anúncios', { uid, motivo });
      throw new HttpsError('internal', 'Não deu para sincronizar os anúncios agora.');
    }
  },
);
