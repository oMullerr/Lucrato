/**
 * Montagem da entrada do cálculo.
 *
 * O compromisso destes testes é a honestidade da procedência: quando a
 * extensão não tem a comissão real, ela precisa dizer que está estimando. Um
 * número apresentado como exato quando é chute é pior do que não ter número.
 */
import { AnaliseDoMl, PADRAO, SeusNumeros, comissaoDe, montarEntrada } from './analise';
import { COMISSAO_PADRAO } from './config';
import { calcular } from '../../src/app/core/pricing/pricing';

const analise = (over: Partial<AnaliseDoMl> = {}): AnaliseDoMl => ({
  item: {
    id: 'MLB1',
    title: 'Furadeira',
    price: 300,
    listingTypeId: 'gold_special',
    freeShipping: true,
  },
  comissoes: [
    { listingTypeId: 'gold_special', percentageFee: 0.1332, fixedFee: 6, saleFeeAmount: 45.96 },
    { listingTypeId: 'gold_pro', percentageFee: 0.1732, fixedFee: 6, saleFeeAmount: 57.96 },
  ],
  freteEstimado: 23.25,
  ...over,
});

const seus = (over: Partial<SeusNumeros> = {}): SeusNumeros => ({ ...PADRAO, ...over });

describe('escolha da comissao', () => {
  it('usa o tipo do anuncio que esta na tela, nao o primeiro da lista', () => {
    // Clássico e Premium cobram percentuais bem diferentes.
    expect(comissaoDe(analise(), 'gold_pro').percentual).toBeCloseTo(0.1732, 10);
    expect(comissaoDe(analise(), 'gold_special').percentual).toBeCloseTo(0.1332, 10);
  });

  it('sem tipo informado, segue o tipo do proprio anuncio', () => {
    const c = comissaoDe(analise());
    expect(c.percentual).toBeCloseTo(0.1332, 10);
    expect(c.origem).toBe('real');
  });

  it('sem analise, usa o padrao do app e assume que e estimativa', () => {
    const c = comissaoDe(null);
    expect(c.percentual).toBeCloseTo(COMISSAO_PADRAO, 10);
    expect(c.taxaFixa).toBe(0);
    expect(c.origem).toBe('padrao');
  });

  it('lista vazia ou percentual invalido tambem cai no padrao', () => {
    expect(comissaoDe(analise({ comissoes: [] })).origem).toBe('padrao');
    expect(
      comissaoDe(analise({
        comissoes: [{ listingTypeId: 'gold_special', percentageFee: 0, fixedFee: 0, saleFeeAmount: 0 }],
      })).origem,
    ).toBe('padrao');
  });
});

describe('montagem da entrada', () => {
  it('o preco da pagina manda sobre o da API', () => {
    // Quem está olhando o anúncio vê o preço da página; divergir dele faria o
    // painel parecer quebrado.
    const m = montarEntrada(279.9, analise(), seus());
    expect(m.entrada.precoVenda).toBeCloseTo(279.9, 10);
  });

  it('quando a leitura da pagina falha, a API cobre', () => {
    expect(montarEntrada(0, analise(), seus()).entrada.precoVenda).toBeCloseTo(300, 10);
  });

  it('sem preco de lugar nenhum, o calculo devolve zero em vez de NaN', () => {
    const m = montarEntrada(0, null, seus({ custoProduto: 100 }));
    expect(m.entrada.precoVenda).toBe(0);
    expect(calcular(m.entrada).lucroLiquido).toBe(0);
  });

  it('frete informado a mao vence o estimado', () => {
    const m = montarEntrada(300, analise(), seus({ freteManual: 40 }));
    expect(m.entrada.frete).toBeCloseTo(40, 10);
    expect(m.procedencia.frete).toBe('manual');
  });

  it('frete zerado a mao e uma escolha, nao ausencia', () => {
    // Retirada em mãos: zero é o valor certo e não pode virar o estimado.
    const m = montarEntrada(300, analise(), seus({ freteManual: 0 }));
    expect(m.entrada.frete).toBe(0);
    expect(m.procedencia.frete).toBe('manual');
  });

  it('sem estimativa e sem valor a mao, o frete fica explicitamente ausente', () => {
    const m = montarEntrada(300, analise({ freteEstimado: null }), seus());
    expect(m.entrada.frete).toBe(0);
    expect(m.procedencia.frete).toBe('nenhum');
  });

  it('quantidade minima e um, mesmo se vier zero ou quebrada', () => {
    expect(montarEntrada(300, null, seus({ quantidade: 0 })).entrada.quantidade).toBe(1);
    expect(montarEntrada(300, null, seus({ quantidade: 2.7 })).entrada.quantidade).toBe(2);
  });

  it('numero negativo digitado nao vira credito', () => {
    const m = montarEntrada(300, analise(), seus({ custoProduto: -50, custosExtras: -3 }));
    expect(m.entrada.custoProduto).toBe(0);
    expect(m.entrada.custosExtras).toBe(0);
  });
});

describe('a conta e a mesma do app', () => {
  it('com a comissao real, bate com o motor de pricing', () => {
    const m = montarEntrada(300, analise(), seus({ custoProduto: 100, freteManual: 0 }));
    const r = calcular(m.entrada);

    // 300 − 13,32% − 6 de taxa fixa = 254,04 recebido; menos 100 de custo.
    expect(r.valorRecebido).toBeCloseTo(254.04, 10);
    expect(r.lucroLiquido).toBeCloseTo(154.04, 10);
    expect(m.procedencia.comissao).toBe('real');
  });

  it('sem o Lucrato aberto, o numero sai com o padrao e marcado como estimativa', () => {
    const m = montarEntrada(300, null, seus({ custoProduto: 100, freteManual: 0 }));
    const r = calcular(m.entrada);

    expect(r.valorRecebido).toBeCloseTo(264, 10); // 300 − 12%
    expect(m.procedencia.comissao).toBe('padrao');
  });
});
