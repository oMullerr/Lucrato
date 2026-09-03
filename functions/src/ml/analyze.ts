/**
 * Dados de mercado para a calculadora.
 *
 * Junta numa chamada só o que a tela precisa para parar de chutar: a comissão
 * real da categoria (que varia por tipo de anúncio e faixa de preço), o frete
 * estimado para o vendedor e como o anúncio está na disputa do catálogo.
 *
 * Somente leitura, como todo o resto da integração.
 */
import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { HttpsError, onCall } from 'firebase-functions/v2/https';

import { ML_CLIENT_ID, ML_CLIENT_SECRET, SITE_ID } from '../config';
import { extrairItemId } from '../../../src/app/core/ml/item-id';
import { criarMlClient, MlClient } from './client';

type Bruto = Record<string, unknown>;

const texto = (v: unknown): string => (typeof v === 'string' ? v : '');
const numero = (v: unknown): number => (typeof v === 'number' && isFinite(v) ? v : 0);

/** Tipos de anúncio do marketplace, do mais barato ao mais exposto. */
const TIPOS = ['gold_special', 'gold_pro'] as const;

export interface ComissaoDoTipo {
  listingTypeId: string;
  /** Fração: 0.12 para 12%. */
  percentageFee: number;
  /** Custo fixo por unidade vendida. */
  fixedFee: number;
  /** Quanto o Mercado Livre cobra ao todo neste preço. */
  saleFeeAmount: number;
}

export interface AnaliseDoMl {
  item?: {
    id: string;
    title: string;
    price: number;
    categoryId: string;
    listingTypeId: string;
    thumbnail: string;
    permalink: string;
    soldQuantity: number;
    availableQuantity: number;
    freeShipping: boolean;
    logisticType: string;
    catalogProductId: string | null;
  };
  comissoes: ComissaoDoTipo[];
  /** Frete estimado que o vendedor pagaria. `null` quando não dá para estimar. */
  freteEstimado: number | null;
  concorrencia?: {
    status: string;
    priceToWin: number | null;
    precoAtual: number;
  };
}

/**
 * Comissões por tipo de anúncio.
 *
 * O `percentage_fee` de MLB muda com a categoria e com a faixa de preço, e o
 * custo fixo depende do tipo de logística — por isso categoria, preço e
 * logística vão todos na consulta.
 */
export async function buscarComissoes(
  cliente: MlClient,
  categoryId: string,
  preco: number,
  logisticType: string,
): Promise<ComissaoDoTipo[]> {
  const saidas: ComissaoDoTipo[] = [];

  for (const tipo of TIPOS) {
    const r = await cliente
      .get<Bruto | Bruto[]>(`/sites/${SITE_ID}/listing_prices`, {
        category_id: categoryId,
        price: preco,
        listing_type_id: tipo,
        currency_id: 'BRL',
        logistic_type: logisticType || undefined,
        shipping_mode: logisticType ? 'me2' : undefined,
      })
      .catch(() => null);

    const dados = (Array.isArray(r) ? r[0] : r) as Bruto | null;
    if (!dados) continue;

    const detalhe = (dados['sale_fee_details'] ?? {}) as Bruto;
    saidas.push({
      listingTypeId: texto(dados['listing_type_id']) || tipo,
      percentageFee: numero(detalhe['percentage_fee']) / 100,
      fixedFee: numero(detalhe['fixed_fee']),
      saleFeeAmount: numero(dados['sale_fee_amount']),
    });
  }

  return saidas;
}

/** Frete que o vendedor pagaria neste preço, na logística informada. */
export async function estimarFrete(
  cliente: MlClient,
  mlUserId: string,
  preco: number,
  listingTypeId: string,
  logisticType: string,
  dimensoes: string,
): Promise<number | null> {
  const r = await cliente
    .get<Bruto>(`/users/${mlUserId}/shipping_options/free`, {
      item_price: preco,
      listing_type_id: listingTypeId || 'gold_special',
      mode: 'me2',
      condition: 'new',
      logistic_type: logisticType || undefined,
      dimensions: dimensoes || undefined,
      free_shipping: 'true',
      verbose: 'true',
    })
    .catch(() => null);

  if (!r) return null;
  const cobertura = ((r['coverage'] ?? {}) as Bruto)['all_country'] as Bruto | undefined;
  if (!cobertura) return null;
  return numero(cobertura['list_cost']);
}

/** Dados de mercado para um anúncio ou para uma categoria e preço. */
export const mlAnalyze = onCall(
  {
    enforceAppCheck: false,
    secrets: [ML_CLIENT_ID, ML_CLIENT_SECRET],
    timeoutSeconds: 120,
  },
  async (request): Promise<AnaliseDoMl> => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Faça login para consultar o Mercado Livre.');
    }
    const uid = request.auth.uid;
    const dados = (request.data ?? {}) as Bruto;

    const segredo = await getFirestore().doc(`users/${uid}/secret/ml`).get();
    const mlUserId = segredo.exists ? String(segredo.get('mlUserId') ?? '') : '';
    if (!mlUserId) {
      throw new HttpsError('failed-precondition', 'Conecte a conta do Mercado Livre primeiro.');
    }

    const cliente = criarMlClient(uid, ML_CLIENT_ID.value(), ML_CLIENT_SECRET.value());
    const itemId = extrairItemId(texto(dados['item']));
    let categoryId = texto(dados['categoryId']);
    let preco = numero(dados['preco']);
    let logisticType = '';
    let listingTypeId = '';
    let dimensoes = '';

    const saida: AnaliseDoMl = { comissoes: [], freteEstimado: null };

    try {
      if (itemId) {
        const item = await cliente.get<Bruto>(`/items/${itemId}`);
        const shipping = (item['shipping'] ?? {}) as Bruto;

        categoryId = texto(item['category_id']) || categoryId;
        preco = preco || numero(item['price']);
        logisticType = texto(shipping['logistic_type']);
        listingTypeId = texto(item['listing_type_id']);
        const dim = shipping['dimensions'];
        dimensoes = typeof dim === 'string' ? dim : '';

        saida.item = {
          id: texto(item['id']),
          title: texto(item['title']),
          price: numero(item['price']),
          categoryId,
          listingTypeId,
          thumbnail: texto(item['secure_thumbnail']) || texto(item['thumbnail']),
          permalink: texto(item['permalink']),
          soldQuantity: numero(item['sold_quantity']),
          availableQuantity: numero(item['available_quantity']),
          freeShipping: shipping['free_shipping'] === true,
          logisticType,
          catalogProductId: texto(item['catalog_product_id']) || null,
        };

        // Disputa de catálogo só existe para anúncio de catálogo.
        if (saida.item.catalogProductId) {
          const disputa = await cliente
            .get<Bruto>(`/items/${itemId}/price_to_win`, { version: 'v2' })
            .catch(() => null);
          if (disputa) {
            saida.concorrencia = {
              status: texto(disputa['status']),
              priceToWin: numero(disputa['price_to_win']) || null,
              precoAtual: numero(disputa['current_price']),
            };
          }
        }
      }

      if (!categoryId || preco <= 0) {
        throw new HttpsError(
          'invalid-argument',
          'Informe um anúncio do Mercado Livre ou uma categoria com preço.',
        );
      }

      saida.comissoes = await buscarComissoes(cliente, categoryId, preco, logisticType);
      saida.freteEstimado = await estimarFrete(
        cliente,
        mlUserId,
        preco,
        listingTypeId,
        logisticType,
        dimensoes,
      );

      return saida;
    } catch (err) {
      if (err instanceof HttpsError) throw err;
      const motivo = String((err as Error).message);
      logger.error('Falha ao analisar item', { uid, itemId, motivo });
      if (motivo === 'reconexao_necessaria') {
        throw new HttpsError('failed-precondition', 'Reconecte a conta do Mercado Livre.');
      }
      if (motivo.startsWith('ml_api_404')) {
        throw new HttpsError('not-found', 'Anúncio não encontrado no Mercado Livre.');
      }
      throw new HttpsError('internal', 'Não deu para consultar o Mercado Livre agora.');
    }
  },
);
