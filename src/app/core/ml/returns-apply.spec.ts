/**
 * Devolução do Mercado Livre → devolução do Lucrato.
 *
 * O motor de devoluções já é testado à exaustão em outro lugar; o que se prova
 * aqui é a tradução: a devolução cai na venda certa, o estoque volta ao lote de
 * onde saiu e nada é criado duas vezes.
 */
import { DevolucaoDoMl, planejarDevolucoes, ratearInteiro } from './returns-apply';
import type { Return, Sale } from '../models/models';
import { makeReturn, makeSale } from '../../../testing/fixtures';

function venda(over: Partial<Sale> = {}): Sale {
  return {
    ...makeSale({ id: 'V001', batchId: 'C001', product: 'Furadeira Bosch', quantitySold: 1 }),
    externalId: '2000017682273464:MLB1',
    source: 'mercadolivre',
    ...over,
  };
}

function devolucao(over: Partial<DevolucaoDoMl> = {}): DevolucaoDoMl {
  return {
    claimId: '5108684499',
    externalIdVenda: '2000017682273464:MLB1',
    mlOrderId: '2000017682273464',
    mlItemId: 'MLB1',
    requestDate: '2026-08-20',
    returnShipping: 42.9,
    destination: 'Estoque',
    reason: 'Outro',
    estado: 'pendente',
    ...over,
  };
}

describe('criacao da devolucao', () => {
  it('cai na venda certa, pelo externalId', () => {
    const plano = planejarDevolucoes([devolucao()], [venda()], []);
    expect(plano.novas).toHaveLength(1);
    expect(plano.novas[0].saleId).toBe('V001');
    expect(plano.novas[0].batchId).toBe('C001');
  });

  it('traz o custo real do frete de devolucao', () => {
    const [d] = planejarDevolucoes([devolucao()], [venda()], []).novas;
    expect(d.returnShipping).toBeCloseTo(42.9, 2);
  });

  it('sem data de chegada, nasce como solicitada e nao mexe em dinheiro', () => {
    const [d] = planejarDevolucoes([devolucao()], [venda()], []).novas;
    expect(d.arrivalDate).toBeUndefined();
  });

  it('com envio entregue, ja nasce finalizada', () => {
    const [d] = planejarDevolucoes(
      [devolucao({ arrivalDate: '2026-08-25' })],
      [venda()],
      [],
    ).novas;
    expect(d.arrivalDate).toBe('2026-08-25');
  });

  it('carimba origem e reclamacao para auditoria', () => {
    const [d] = planejarDevolucoes([devolucao()], [venda()], []).novas;
    expect(d.source).toBe('mercadolivre');
    expect(d.externalId).toBe('5108684499');
    expect(d.notes).toContain('5108684499');
  });

  it('herda produto e canal da venda', () => {
    const [d] = planejarDevolucoes([devolucao()], [venda()], []).novas;
    expect(d.product).toBe('Furadeira Bosch');
    expect(d.channel).toBe('Mercado Livre');
  });
});

describe('venda ainda nao lancada', () => {
  it('sem venda no razao, a devolucao espera', () => {
    const plano = planejarDevolucoes([devolucao()], [], []);
    expect(plano.novas).toHaveLength(0);
    expect(plano.pendentes).toEqual([{ claimId: '5108684499', motivo: 'sem_venda' }]);
  });

  it('venda de outro pedido nao serve', () => {
    const outra = venda({ externalId: '999:MLB9' });
    expect(planejarDevolucoes([devolucao()], [outra], []).pendentes).toHaveLength(1);
  });
});

describe('venda dividida entre lotes', () => {
  const fatias = [
    venda({ id: 'V001', batchId: 'C001', quantitySold: 2, externalId: '2000017682273464:MLB1#1' }),
    venda({ id: 'V002', batchId: 'C002', quantitySold: 1, externalId: '2000017682273464:MLB1#2' }),
  ];

  it('gera uma devolucao por fatia, para o estoque voltar ao lote certo', () => {
    const plano = planejarDevolucoes([devolucao()], fatias, []);
    expect(plano.novas.map(d => [d.batchId, d.quantity])).toEqual([
      ['C001', 2],
      ['C002', 1],
    ]);
  });

  it('rateia o frete da devolucao entre as fatias', () => {
    const plano = planejarDevolucoes([devolucao({ returnShipping: 30 })], fatias, []);
    expect(plano.novas.reduce((s, d) => s + d.returnShipping, 0)).toBeCloseTo(30, 2);
    expect(plano.novas[0].returnShipping).toBeCloseTo(20, 2);
  });

  it('cada fatia recebe um externalId proprio', () => {
    const plano = planejarDevolucoes([devolucao()], fatias, []);
    expect(plano.novas.map(d => d.externalId)).toEqual(['5108684499#1', '5108684499#2']);
  });
});

describe('idempotencia', () => {
  const existente: Return = {
    ...makeReturn({ id: 'D001', saleId: 'V001', batchId: 'C001', quantity: 1 }),
    externalId: '5108684499',
    source: 'mercadolivre',
    returnShipping: 42.9,
    destination: 'Estoque',
  };

  it('reclamacao ja registrada nao vira devolucao nova', () => {
    const plano = planejarDevolucoes([devolucao()], [venda()], [existente]);
    expect(plano.novas).toHaveLength(0);
    expect(plano.aplicadas).toContain('5108684499');
  });

  it('chegada do produto finaliza a devolucao existente', () => {
    const plano = planejarDevolucoes(
      [devolucao({ arrivalDate: '2026-08-25' })],
      [venda()],
      [existente],
    );
    expect(plano.atualizadas).toHaveLength(1);
    expect(plano.atualizadas[0].arrivalDate).toBe('2026-08-25');
    expect(plano.atualizadas[0].id).toBe('D001');
  });

  it('atualizacao preserva o que voce escreveu', () => {
    const comNota = { ...existente, notes: 'cliente arrependeu', resolution: 'reembolsado' };
    const plano = planejarDevolucoes(
      [devolucao({ arrivalDate: '2026-08-25' })],
      [venda()],
      [comNota],
    );
    expect(plano.atualizadas[0].notes).toBe('cliente arrependeu');
    expect(plano.atualizadas[0].resolution).toBe('reembolsado');
  });

  it('nada mudou: nao gera atualizacao a toa', () => {
    const plano = planejarDevolucoes([devolucao()], [venda()], [existente]);
    expect(plano.atualizadas).toHaveLength(0);
  });
});

describe('numeracao', () => {
  it('continua a sequencia das devolucoes existentes', () => {
    const antiga = makeReturn({ id: 'D007', saleId: 'V001', batchId: 'C001' });
    const plano = planejarDevolucoes([devolucao()], [venda()], [antiga]);
    expect(plano.novas[0].id).toBe('D008');
  });
});

/**
 * Até setembro/2026 a ingestão IGNORAVA a quantidade: toda devolução do ML era
 * criada pela venda inteira. Quem devolvesse 1 de 3 unidades tinha as 3
 * revertidas — estoque inflado, faturamento derrubado, e nenhum sinal na tela.
 */
describe('devolucao parcial', () => {
  it('devolve so o que o comprador mandou de volta', () => {
    const v = venda({ quantitySold: 3 });
    const [d] = planejarDevolucoes([devolucao({ quantity: 1 })], [v], []).novas;
    expect(d.quantity).toBe(1);
  });

  it('sem o campo, continua sendo a venda inteira', () => {
    // Registro gravado antes do campo existir: o comportamento antigo vale,
    // senao a primeira sincronizacao depois do deploy reescreveria o historico.
    const v = venda({ quantitySold: 3 });
    const [d] = planejarDevolucoes([devolucao()], [v], []).novas;
    expect(d.quantity).toBe(3);
  });

  it('nao devolve mais do que foi vendido', () => {
    const v = venda({ quantitySold: 2 });
    const [d] = planejarDevolucoes([devolucao({ quantity: 9 })], [v], []).novas;
    expect(d.quantity).toBe(2);
  });

  it('quantidade zero nao cria devolucao nenhuma', () => {
    const plano = planejarDevolucoes([devolucao({ quantity: 0 })], [venda()], []);
    expect(plano.novas).toHaveLength(0);
    // Ainda assim e dada por resolvida: nao fica voltando na caixa.
    expect(plano.aplicadas).toContain('5108684499');
  });

  it('o frete acompanha o que voltou, nao o que foi vendido', () => {
    const v = venda({ quantitySold: 3 });
    const [d] = planejarDevolucoes([devolucao({ quantity: 1, returnShipping: 30 })], [v], []).novas;
    expect(d.returnShipping).toBeCloseTo(30, 2);
  });
});

describe('devolucao parcial de venda dividida entre lotes', () => {
  const fatias = [
    venda({ id: 'V001', batchId: 'C001', quantitySold: 2, externalId: '2000017682273464:MLB1#1' }),
    venda({ id: 'V002', batchId: 'C002', quantitySold: 1, externalId: '2000017682273464:MLB1#2' }),
  ];

  it('reparte proporcionalmente, sem sobrar nem faltar unidade', () => {
    const plano = planejarDevolucoes([devolucao({ quantity: 2 })], fatias, []);
    expect(plano.novas.reduce((s, d) => s + d.quantity, 0)).toBe(2);
  });

  it('uma unidade so vai para a fatia de maior peso', () => {
    // 1 unidade sobre pesos [2,1]: C001 leva, C002 nao vira devolucao de zero.
    const plano = planejarDevolucoes([devolucao({ quantity: 1 })], fatias, []);
    expect(plano.novas).toHaveLength(1);
    expect(plano.novas[0].batchId).toBe('C001');
    expect(plano.novas[0].quantity).toBe(1);
  });

  it('o frete inteiro fica com a fatia que recebeu as unidades', () => {
    const plano = planejarDevolucoes([devolucao({ quantity: 1, returnShipping: 30 })], fatias, []);
    expect(plano.novas[0].returnShipping).toBeCloseTo(30, 2);
  });

  it('o sufixo do externalId segue o indice ORIGINAL da fatia', () => {
    // Se o ML revisar a quantidade e a outra fatia entrar depois, o id da que
    // ja existe nao pode mudar — e o que segura a idempotencia.
    const plano = planejarDevolucoes([devolucao({ quantity: 1 })], fatias, []);
    expect(plano.novas[0].externalId).toBe('5108684499#1');
  });
});

describe('quantidade revisada pelo Mercado Livre', () => {
  const existente: Return = {
    ...makeReturn({ id: 'D001', saleId: 'V001', batchId: 'C001', quantity: 1 }),
    externalId: '5108684499',
    source: 'mercadolivre',
    returnShipping: 42.9,
    destination: 'Estoque',
  };

  it('linha unica adota o numero novo', () => {
    const v = venda({ quantitySold: 3 });
    const plano = planejarDevolucoes([devolucao({ quantity: 2 })], [v], [existente]);
    expect(plano.atualizadas).toHaveLength(1);
    expect(plano.atualizadas[0].quantity).toBe(2);
  });

  it('mesma quantidade nao gera atualizacao a toa', () => {
    const plano = planejarDevolucoes([devolucao({ quantity: 1 })], [venda()], [existente]);
    expect(plano.atualizadas).toHaveLength(0);
  });

  it('venda dividida: a divisao fica como entrou', () => {
    // Redistribuir entre linhas ja existentes duplica ou some com unidade de
    // estoque quando feito errado. Enquanto nao houver caso real, nao se mexe.
    const fatias = [
      venda({ id: 'V001', batchId: 'C001', quantitySold: 2, externalId: '2000017682273464:MLB1#1' }),
      venda({ id: 'V002', batchId: 'C002', quantitySold: 1, externalId: '2000017682273464:MLB1#2' }),
    ];
    const duas: Return[] = [
      { ...existente, id: 'D001', saleId: 'V001', batchId: 'C001', quantity: 2, externalId: '5108684499#1' },
      { ...existente, id: 'D002', saleId: 'V002', batchId: 'C002', quantity: 1, externalId: '5108684499#2' },
    ];
    const plano = planejarDevolucoes([devolucao({ quantity: 1 })], fatias, duas);
    expect(plano.novas).toHaveLength(0);
    expect(plano.atualizadas).toHaveLength(0);
  });
});

describe('rateio inteiro', () => {
  it('a soma sempre fecha com o total', () => {
    // A propriedade que importa: rateio que perde ou inventa unidade some com
    // estoque. Varrida sobre varias formas de dividir, nao um caso escolhido.
    for (const total of [1, 2, 3, 5, 7, 10]) {
      for (const pesos of [[1, 1], [2, 1], [3, 3, 1], [5, 2, 2], [1, 1, 1, 1]]) {
        const partes = ratearInteiro(total, pesos);
        expect(partes.reduce((a, b) => a + b, 0)).toBe(total);
        expect(partes.every(Number.isInteger)).toBe(true);
      }
    }
  });

  it('nunca devolve parte negativa', () => {
    expect(ratearInteiro(3, [2, 1]).every(n => n >= 0)).toBe(true);
  });

  it('total zero ou pesos zerados devolvem tudo zero', () => {
    expect(ratearInteiro(0, [2, 1])).toEqual([0, 0]);
    expect(ratearInteiro(5, [0, 0])).toEqual([0, 0]);
  });

  it('empate no resto desempata pela ordem, para ser deterministico', () => {
    // 1 unidade sobre pesos iguais: sempre a primeira, nunca um sorteio.
    expect(ratearInteiro(1, [1, 1])).toEqual([1, 0]);
    expect(ratearInteiro(1, [1, 1])).toEqual([1, 0]);
  });

  it('distribui sem enviesar quando divide exato', () => {
    expect(ratearInteiro(4, [1, 1])).toEqual([2, 2]);
    expect(ratearInteiro(6, [2, 1])).toEqual([4, 2]);
  });
});
