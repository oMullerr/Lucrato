/**
 * Sincronização dos anúncios.
 *
 * O bloco de `decidirDestino` é o mais importante do arquivo: é o único caminho
 * da integração que APAGA dado. Metade dos testes existe para provar que ele
 * NÃO apaga — busca vazia, confirmação vazia, anúncio encerrado mas vivo. Uma
 * busca que falhe pela metade não pode limpar a coleção inteira.
 */
import { MlItemNormalizado, decidirDestino, normalizarItem, skuDoAnuncio } from './items';

/** Anúncio real da conta, com o formato que `/items/bulk` devolve. */
const cru = () => ({
  id: 'MLB7524694378',
  title: 'Robô Aspirador De Pó Wap Robot W90 Pérola Automático',
  price: 370,
  available_quantity: 2,
  sold_quantity: 7,
  status: 'active',
  sub_status: [],
  listing_type_id: 'gold_pro',
  category_id: 'MLB271599',
  catalog_product_id: 'MLB19351234',
  permalink: 'https://produto.mercadolivre.com.br/MLB-7524694378',
  secure_thumbnail: 'https://http2.mlstatic.com/D_NQ_NP_2X_123-O.webp',
  shipping: { mode: 'me2', logistic_type: 'drop_off', free_shipping: true },
  attributes: [{ id: 'SELLER_SKU', value_name: 'WAP-W90' }],
  variations: [],
});

/** Como um anúncio excluído volta: encerrado, com `deleted` no sub_status. */
const excluido = (id: string): MlItemNormalizado =>
  normalizarItem({ ...cru(), id, status: 'closed', sub_status: ['deleted'] });

/** Encerrado sem exclusão: some da busca, mas continua existindo. */
const encerrado = (id: string): MlItemNormalizado =>
  normalizarItem({ ...cru(), id, status: 'closed', sub_status: [] });

const mapa = (itens: MlItemNormalizado[]) => new Map(itens.map(i => [i.id, i]));

describe('SKU do anuncio', () => {
  it('le do atributo SELLER_SKU', () => {
    expect(skuDoAnuncio(cru())).toBe('WAP-W90');
  });

  it('cai para o campo legado quando nao ha atributo', () => {
    // O Mercado Livre guarda em dois lugares por razões históricas; o vínculo
    // automático por SKU depende de achar nos dois.
    const semAtributo = { ...cru(), attributes: [], seller_custom_field: 'WAP-W90-LEGADO' };
    expect(skuDoAnuncio(semAtributo)).toBe('WAP-W90-LEGADO');
  });

  it('o atributo tem prioridade sobre o legado', () => {
    const ambos = { ...cru(), seller_custom_field: 'ANTIGO' };
    expect(skuDoAnuncio(ambos)).toBe('WAP-W90');
  });

  it('sem SKU devolve nulo, nao string vazia', () => {
    // `null` é o que a tela usa para saber que não dá para sugerir por SKU.
    expect(skuDoAnuncio({ ...cru(), attributes: [{ id: 'SELLER_SKU', value_name: '  ' }] })).toBeNull();
    expect(skuDoAnuncio({ ...cru(), attributes: [] })).toBeNull();
  });
});

describe('normalizacao do anuncio', () => {
  it('traz o que a tela de vinculo precisa', () => {
    const i = normalizarItem(cru());
    expect(i.id).toBe('MLB7524694378');
    expect(i.sku).toBe('WAP-W90');
    expect(i.price).toBeCloseTo(370, 10);
    expect(i.availableQuantity).toBe(2);
    expect(i.status).toBe('active');
    expect(i.freeShipping).toBe(true);
    expect(i.logisticType).toBe('drop_off');
  });

  it('guarda o sub_status, que e o que distingue excluido de encerrado', () => {
    expect(normalizarItem(cru()).subStatus).toEqual([]);
    expect(excluido('MLB1').subStatus).toEqual(['deleted']);
  });

  it('sub_status ausente vira lista vazia, nao undefined', () => {
    const semSub = { ...cru() } as Record<string, unknown>;
    delete semSub['sub_status'];
    expect(normalizarItem(semSub).subStatus).toEqual([]);
  });

  it('catalogo ausente vira nulo', () => {
    expect(normalizarItem({ ...cru(), catalog_product_id: '' }).catalogProductId).toBeNull();
  });
});

describe('o que remover — o caminho que apaga dado', () => {
  it('anuncio excluido no Mercado Livre sai', () => {
    // Caso real: 118 de 128 anúncios da conta estavam nesse estado.
    const d = decidirDestino(['VIVO', 'MORTO'], ['VIVO'], mapa([excluido('MORTO')]));
    expect(d.remover).toEqual(['MORTO']);
    expect(d.atualizar).toHaveLength(0);
  });

  it('anuncio que nem a consulta direta reconhece sai', () => {
    const d = decidirDestino(['VIVO', 'SUMIU'], ['VIVO'], mapa([excluido('OUTRO')]));
    expect(d.remover).toEqual(['SUMIU']);
  });

  it('encerrado mas vivo NAO sai — e atualizado', () => {
    // Sem isso ele ficaria congelado como "ativo" para sempre, no topo da lista.
    const d = decidirDestino(['VIVO', 'ENCERRADO'], ['VIVO'], mapa([encerrado('ENCERRADO')]));
    expect(d.remover).toHaveLength(0);
    expect(d.atualizar.map(i => i.id)).toEqual(['ENCERRADO']);
    expect(d.atualizar[0].status).toBe('closed');
  });

  it('o que a busca devolveu nunca e tocado', () => {
    const d = decidirDestino(['A', 'B'], ['A', 'B'], mapa([excluido('A')]));
    expect(d.remover).toHaveLength(0);
    expect(d.atualizar).toHaveLength(0);
  });
});

describe('as travas contra apagar o que nao devia', () => {
  it('busca vazia nao remove NADA', () => {
    // Conta sem nenhum anúncio é raro; busca falhando não é. Se um dia a
    // listagem voltar vazia por instabilidade, isso limparia tudo.
    const d = decidirDestino(['A', 'B', 'C'], [], mapa([excluido('A'), excluido('B')]));
    expect(d.remover).toHaveLength(0);
    expect(d.atualizar).toHaveLength(0);
  });

  it('confirmacao vazia nao remove NADA', () => {
    // Se a consulta de confirmação falhar inteira, ausência na busca sozinha
    // não é motivo suficiente para apagar.
    const d = decidirDestino(['VIVO', 'MORTO'], ['VIVO'], new Map());
    expect(d.remover).toHaveLength(0);
  });

  it('sem candidatos nao faz nada', () => {
    const d = decidirDestino(['A'], ['A'], new Map());
    expect(d).toEqual({ remover: [], atualizar: [] });
  });

  it('base vazia nao quebra', () => {
    expect(decidirDestino([], ['A'], new Map())).toEqual({ remover: [], atualizar: [] });
  });
});

describe('o caso da conta real', () => {
  it('128 guardados, 10 vivos, 118 excluidos', () => {
    const guardados = Array.from({ length: 128 }, (_, i) => `MLB${i}`);
    const vivos = guardados.slice(0, 10);
    const confirmados = mapa(guardados.slice(10).map(excluido));

    const d = decidirDestino(guardados, vivos, confirmados);
    expect(d.remover).toHaveLength(118);
    expect(d.atualizar).toHaveLength(0);
  });
});
