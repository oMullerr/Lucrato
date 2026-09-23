/**
 * Normalização da devolução do Mercado Livre.
 *
 * O foco aqui é `unidadesDevolvidas`. Até setembro/2026 a ingestão nem olhava
 * para esse número: toda devolução era criada pela venda inteira, então quem
 * devolvesse 1 de 3 unidades tinha as 3 revertidas no razão — estoque inflado,
 * faturamento derrubado, e nenhum sinal na tela dizendo que algo estava errado.
 *
 * A armadilha que motiva metade destes casos: o ML manda `return_quantity` como
 * STRING decimal (`"1.0"`), não como número. Um `typeof v === 'number'` sozinho
 * devolveria zero para todo mundo, e a correção teria nascido morta —
 * silenciosamente, porque zero cai no mesmo caminho de "a API não informou".
 */
import { destinoDaDevolucao, unidadesDevolvidas } from './returns';

type Bruto = Record<string, unknown>;

const retornoCom = (orders: unknown): Bruto => ({ orders });

describe('unidades devolvidas', () => {
  it('le a string decimal que a API manda', () => {
    expect(unidadesDevolvidas(retornoCom([{ return_quantity: '1.0' }]))).toBe(1);
    expect(unidadesDevolvidas(retornoCom([{ return_quantity: '3.0' }]))).toBe(3);
  });

  it('aceita numero tambem, caso a API mude de ideia', () => {
    expect(unidadesDevolvidas(retornoCom([{ return_quantity: 2 }]))).toBe(2);
  });

  it('soma as linhas quando ha mais de uma', () => {
    expect(
      unidadesDevolvidas(retornoCom([{ return_quantity: '1.0' }, { return_quantity: '2.0' }])),
    ).toBe(3);
  });

  it('sem informacao, devolve undefined para quem chama decidir', () => {
    // `undefined` e diferente de zero de proposito: zero significaria "o ML
    // disse que nao volta nada", e ausencia significa "o ML nao disse".
    expect(unidadesDevolvidas({})).toBeUndefined();
    expect(unidadesDevolvidas(retornoCom([]))).toBeUndefined();
    expect(unidadesDevolvidas(retornoCom('nao e lista'))).toBeUndefined();
    expect(unidadesDevolvidas(retornoCom([{}]))).toBeUndefined();
  });

  it('ignora linha com quantidade invalida ou zerada', () => {
    expect(unidadesDevolvidas(retornoCom([{ return_quantity: '0' }]))).toBeUndefined();
    expect(unidadesDevolvidas(retornoCom([{ return_quantity: 'abacaxi' }]))).toBeUndefined();
    expect(unidadesDevolvidas(retornoCom([{ return_quantity: null }]))).toBeUndefined();
    // Uma linha valida entre invalidas ainda conta.
    expect(
      unidadesDevolvidas(retornoCom([{ return_quantity: 'x' }, { return_quantity: '2.0' }])),
    ).toBe(2);
  });

  it('nunca devolve fracao — unidade de estoque e inteira', () => {
    expect(unidadesDevolvidas(retornoCom([{ return_quantity: '1.4' }]))).toBe(1);
    expect(unidadesDevolvidas(retornoCom([{ return_quantity: '1.6' }]))).toBe(2);
    // Arredondar para baixo nao pode zerar uma devolucao que existe.
    expect(unidadesDevolvidas(retornoCom([{ return_quantity: '0.4' }]))).toBe(1);
  });
});

describe('destino do produto devolvido', () => {
  it('voltando para o vendedor, pode voltar ao estoque', () => {
    expect(destinoDaDevolucao([{ destination: { name: 'seller_address' } }])).toBe('Estoque');
  });

  it('indo para o deposito do ML, o padrao e ressarcido', () => {
    expect(destinoDaDevolucao([{ destination: { name: 'warehouse' } }])).toBe('Ressarcido');
  });

  it('sem envio conhecido, assume estoque', () => {
    expect(destinoDaDevolucao([])).toBe('Estoque');
  });
});
