/**
 * Devolução do Mercado Livre → devolução do Lucrato.
 *
 * O motor de devoluções já é testado à exaustão em outro lugar; o que se prova
 * aqui é a tradução: a devolução cai na venda certa, o estoque volta ao lote de
 * onde saiu e nada é criado duas vezes.
 */
import { DevolucaoDoMl, planejarDevolucoes } from './returns-apply';
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
