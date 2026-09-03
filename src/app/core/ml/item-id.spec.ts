/** Reconhecimento do código do anúncio no que o usuário colar. */
import { extrairItemId, pareceItemDoMl } from './item-id';

describe('extrair o codigo do anuncio', () => {
  it('aceita o codigo puro', () => {
    expect(extrairItemId('MLB4931831037')).toBe('MLB4931831037');
  });

  it('aceita o formato com traco, que e o da URL', () => {
    expect(extrairItemId('MLB-4931831037')).toBe('MLB4931831037');
  });

  it('aceita o link do produto', () => {
    const url = 'https://produto.mercadolivre.com.br/MLB-4931831037-furadeira-bosch-gsb-13-re-_JM';
    expect(extrairItemId(url)).toBe('MLB4931831037');
  });

  it('aceita o link de busca com parametros', () => {
    expect(extrairItemId('https://www.mercadolivre.com.br/p/MLB4931831037?pdp_filters=x')).toBe(
      'MLB4931831037',
    );
  });

  it('normaliza a caixa', () => {
    expect(extrairItemId('mlb-4931831037')).toBe('MLB4931831037');
  });

  it('funciona com outros paises', () => {
    expect(extrairItemId('MLA-930793214')).toBe('MLA930793214');
  });

  it('ignora espacos nas pontas', () => {
    expect(extrairItemId('  MLB4931831037  ')).toBe('MLB4931831037');
  });

  it('devolve vazio quando nao ha codigo', () => {
    expect(extrairItemId('furadeira bosch')).toBe('');
    expect(extrairItemId('')).toBe('');
    expect(extrairItemId(undefined as unknown as string)).toBe('');
  });

  it('nao confunde numero solto com anuncio', () => {
    expect(extrairItemId('4931831037')).toBe('');
  });

  it('exige digitos suficientes', () => {
    expect(extrairItemId('MLB-123')).toBe('');
  });
});

describe('pareceItemDoMl', () => {
  it('responde ao que a tela precisa saber', () => {
    expect(pareceItemDoMl('MLB4931831037')).toBe(true);
    expect(pareceItemDoMl('escova de dente')).toBe(false);
  });
});
