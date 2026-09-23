/**
 * A pauta da tela inicial.
 *
 * O que se prova aqui é o CORTE — o que merece aparecer e em que ordem. Uma
 * lista que mostra tudo não é pauta: é outra tabela para rolar, e ninguém age
 * sobre ela. Os testes de "não vira pendência" valem tanto quanto os de "vira".
 */
import { montarPendencias, RetratoDoNegocio } from './pendencias';
import type { ComputedPurchase, ComputedReturn } from './models/models';

function lote(over: Partial<ComputedPurchase> = {}): ComputedPurchase {
  return { status: 'Em Estoque', idleValue: 0, ...over } as ComputedPurchase;
}

function devolucao(over: Partial<ComputedReturn> = {}): ComputedReturn {
  return { status: 'Finalizado', returnedRevenue: 0, ...over } as ComputedReturn;
}

function retrato(over: Partial<RetratoDoNegocio> = {}): RetratoDoNegocio {
  return {
    precisaReconectar: false,
    caixaEsperando: 0,
    caixaValor: 0,
    lotes: [],
    devolucoes: [],
    bandaFiscal: 'ok',
    usoDoTeto: 0.1,
    ...over,
  };
}

const tipos = (r: RetratoDoNegocio) => montarPendencias(r).map(p => p.tipo);

describe('negocio em ordem', () => {
  it('nada a fazer devolve lista vazia', () => {
    expect(montarPendencias(retrato())).toEqual([]);
  });

  it('estar dentro do teto NAO vira pendencia', () => {
    // Um aviso verde todo dia treina a pessoa a ignorar a lista inteira.
    expect(tipos(retrato({ bandaFiscal: 'ok', usoDoTeto: 0.4 }))).toEqual([]);
  });

  it('lote em estoque saudavel nao vira pendencia', () => {
    const lotes = [lote({ status: 'Em Estoque' }), lote({ status: 'Vendido' })];
    expect(tipos(retrato({ lotes }))).toEqual([]);
  });

  it('devolucao ja finalizada nao pede nada', () => {
    expect(tipos(retrato({ devolucoes: [devolucao({ status: 'Finalizado' })] }))).toEqual([]);
  });
});

describe('o que entra na pauta', () => {
  it('conta do ML precisando reconectar', () => {
    expect(tipos(retrato({ precisaReconectar: true }))).toContain('ml_reconectar');
  });

  it('venda capturada esperando decisao, com valor', () => {
    const [p] = montarPendencias(retrato({ caixaEsperando: 53, caixaValor: 12905.03 }));
    expect(p.tipo).toBe('caixa_esperando');
    expect(p.dados).toEqual({ total: 53, valor: 12905.03 });
  });

  it('estoque parado soma o capital imobilizado dos lotes parados', () => {
    const lotes = [
      lote({ status: 'Parado', idleValue: 300 }),
      lote({ status: 'Parado', idleValue: 200 }),
      // 'Atenção' ainda nao e 'Parado': nao entra nem soma.
      lote({ status: 'Atenção', idleValue: 999 }),
    ];
    const [p] = montarPendencias(retrato({ lotes }));
    expect(p.tipo).toBe('estoque_parado');
    expect(p.dados).toEqual({ total: 2, valor: 500 });
  });

  it('devolucao aberta soma o valor em risco', () => {
    const devolucoes = [
      devolucao({ status: 'Solicitado', returnedRevenue: 120 }),
      devolucao({ status: 'Solicitado', returnedRevenue: 80 }),
      devolucao({ status: 'Finalizado', returnedRevenue: 500 }),
    ];
    const [p] = montarPendencias(retrato({ devolucoes }));
    expect(p.tipo).toBe('devolucao_aberta');
    expect(p.dados).toEqual({ total: 2, valor: 200 });
  });

  it('teto do MEI a partir da banda de atencao', () => {
    expect(tipos(retrato({ bandaFiscal: 'warning', usoDoTeto: 0.82 }))).toContain('mei_teto');
    expect(tipos(retrato({ bandaFiscal: 'danger', usoDoTeto: 0.93 }))).toContain('mei_teto');
    expect(tipos(retrato({ bandaFiscal: 'over', usoDoTeto: 1.07 }))).toContain('mei_teto');
  });

  it('sem regime tributario, o teto nao e assunto', () => {
    expect(tipos(retrato({ bandaFiscal: null }))).toEqual([]);
  });

  it('percentual do teto vai arredondado para a mensagem', () => {
    const [p] = montarPendencias(retrato({ bandaFiscal: 'danger', usoDoTeto: 0.9267 }));
    expect(p.dados).toEqual({ pct: 93 });
  });
});

describe('ordem', () => {
  it('grave antes de medio', () => {
    const r = retrato({
      lotes: [lote({ status: 'Parado', idleValue: 10 })],
      caixaEsperando: 1,
      caixaValor: 50,
    });
    expect(tipos(r)).toEqual(['caixa_esperando', 'estoque_parado']);
  });

  it('reconectar vem antes de tudo: sem ele, todas as outras contas envelhecem', () => {
    const r = retrato({
      precisaReconectar: true,
      caixaEsperando: 5,
      caixaValor: 100,
      lotes: [lote({ status: 'Parado', idleValue: 10 })],
      bandaFiscal: 'over',
      usoDoTeto: 1.1,
    });
    expect(tipos(r)[0]).toBe('ml_reconectar');
  });

  it('banda de atencao do teto e media; estourado e grave', () => {
    const media = montarPendencias(retrato({ bandaFiscal: 'warning', usoDoTeto: 0.8 }));
    const grave = montarPendencias(retrato({ bandaFiscal: 'over', usoDoTeto: 1.2 }));
    expect(media[0].severidade).toBe('media');
    expect(grave[0].severidade).toBe('alta');
  });
});
