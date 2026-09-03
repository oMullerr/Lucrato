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
    listingTypeId: texto(raw['listing_type_id']),
    categoryId: texto(raw['category_id']),
    catalogProductId: texto(raw['catalog_product_id']) || null,
    permalink: texto(raw['permalink']),
    thumbnail: texto(raw['secure_thumbnail']) || texto(raw['thumbnail']),
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

      // Grava em lotes; o Firestore aceita 500 operações por batch.
      for (let i = 0; i < itens.length; i += 400) {
        const batch = db.batch();
        for (const item of itens.slice(i, i + 400)) {
          batch.set(
            db.doc(`users/${uid}/mlItems/${item.id}`),
            { ...item, updatedAt: Timestamp.now() },
            { merge: true },
          );
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

      logger.info('Anúncios sincronizados', { uid, total: itens.length });
      return { total: itens.length };
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
