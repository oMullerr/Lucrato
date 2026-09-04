/**
 * Recebíveis do Mercado Pago.
 *
 * Esta tela promete "isto vai cair na sua conta", então o compromisso dos
 * testes é não deixar nenhum número aparecer sem lastro: valor estimado por
 * nós, venda que não vai gerar caixa e pedido que o razão não reconhece
 * precisam ficar de fora, não somados por descuido.
 */
import {
  PagamentoDoMl,
  juntarRecebiveis,
  porOrderId,
  resumirCaixa,
} from './payouts';
import { calculateSale } from '../services/calculations';
import type { ComputedSale, Purchase, Return, Sale } from '../models/models';
import { makePurchase, makeReturn, makeSale } from '../../../testing/fixtures';

/** Meio-dia UTC evita que o fuso do vendedor jogue o dia para trás. */
const HOJE = new Date('2026-09-04T15:00:00Z');

const COMPRA: Purchase = makePurchase({ id: 'C001', product: 'Furadeira', unitCost: 100 });

function venda(over: Partial<Sale> = {}, devolucoes: Return[] = []): ComputedSale {
  const v = makeSale({
    id: 'V001',
    batchId: 'C001',
    product: 'Furadeira',
    saleDate: '2026-08-20',
    quantitySold: 1,
    unitPrice: 300,
    mlOrderId: '2000001',
    source: 'mercadolivre',
    ...over,
  });
  return calculateSale(v, [COMPRA], devolucoes);
}

function pagamento(over: Partial<PagamentoDoMl> = {}): PagamentoDoMl {
  return {
    paymentId: '177011312292',
    orderId: '2000001',
    liberaEm: '2026-09-11T18:54:14.000-04:00',
    // Bem antes de qualquer `liberaEm` usado nos testes: liberação só é
    // imediata quando a data de liberação NÃO é posterior à da aprovação.
    aprovadoEm: '2026-08-20T12:00:00Z',
    situacaoMl: 'pending',
    bruto: 178,
    liquido: 149.52,
    ...over,
  };
}

describe('cruzar pagamento com venda', () => {
  it('vira recebivel com o liquido que o Mercado Pago informou', () => {
    // Números reais da conta: R$ 178 pagos, R$ 149,52 depositados.
    const [r] = juntarRecebiveis([pagamento()], [venda()], HOJE);
    expect(r.bruto).toBeCloseTo(178, 10);
    expect(r.liquido).toBeCloseTo(149.52, 10);
    expect(r.produto).toBe('Furadeira');
    expect(r.vendaId).toBe('V001');
  });

  it('a data vira o dia no fuso do vendedor', () => {
    // 11/09 às 18:54 em -04:00 é 11/09 no Brasil — e não 12/09.
    expect(juntarRecebiveis([pagamento()], [venda()], HOJE)[0].liberaEm).toBe('2026-09-11');
  });

  it('pedido sem venda correspondente CONTINUA no caixa', () => {
    // Medido na conta real: 2 dos 8 pendentes não tinham venda casada, e
    // descartá-los fazia a tela mostrar R$ 1.350,80 quando o Mercado Pago
    // dizia R$ 2.002,44. O dinheiro entra tendo ou não venda no razão.
    const manual = venda({ mlOrderId: undefined, source: undefined });
    const r = juntarRecebiveis([pagamento()], [manual], HOJE);
    expect(r).toHaveLength(1);
    expect(r[0].conciliado).toBe(false);
    expect(r[0].liquido).toBeCloseTo(149.52, 10);
  });

  it('sem venda, o recebivel fica sem nome em vez de sumir', () => {
    const r = juntarRecebiveis([pagamento()], [], HOJE);
    expect(r[0].produto).toBe('');
    expect(r[0].vendaId).toBe('');
  });

  it('com venda casada, marca como conciliado e ganha o nome', () => {
    const r = juntarRecebiveis([pagamento()], [venda()], HOJE);
    expect(r[0].conciliado).toBe(true);
    expect(r[0].produto).toBe('Furadeira');
  });

  it('quem decide se o dinheiro vem e o Mercado Pago, nao o razao', () => {
    // A situação da venda no razão não muda o que o Mercado Pago vai depositar.
    // Filtrar por ela foi exatamente o que escondeu um terço do caixa.
    const cancelada = juntarRecebiveis([pagamento()], [venda({ status: 'Cancelada' })], HOJE);
    expect(cancelada).toHaveLength(1);
  });

  it('venda dividida entre lotes vira um recebivel so', () => {
    // O dinheiro é do pedido, não da fatia: contar duas vezes dobraria o caixa.
    const fatias = [
      venda({ id: 'V001', quantitySold: 2 }),
      venda({ id: 'V002', quantitySold: 1 }),
    ];
    expect(juntarRecebiveis([pagamento()], fatias, HOJE)).toHaveLength(1);
  });

  it('devolucao parcial nao apaga o caixa do resto do pedido', () => {
    const devolvida = venda({ id: 'V001', quantitySold: 2 }, [
      makeReturn({ saleId: 'V001', quantity: 1, arrivalDate: '2026-08-25' }),
    ]);
    expect(juntarRecebiveis([pagamento()], [devolvida], HOJE)).toHaveLength(1);
  });

  it('data invalida nao vira recebivel com dia vazio', () => {
    expect(juntarRecebiveis([pagamento({ liberaEm: 'nao-e-data' })], [venda()], HOJE)).toHaveLength(0);
  });

  it('credito sem pedido entra no caixa como credito', () => {
    // O caso que fez a tela ficar R$ 1,70 abaixo do app: um crédito de R$ 0,80
    // liberando no mesmo instante de uma venda. O Mercado Pago soma os dois na
    // linha do dia, e antes só o pagamento da venda era visto.
    const credito = pagamento({
      paymentId: '174914022141',
      orderId: '',
      liquido: 0.8,
      bruto: 0.8,
      liberaEm: '2026-09-04T15:44:23.000-04:00',
    });
    const [r] = juntarRecebiveis([credito], [venda()], HOJE);

    expect(r.tipo).toBe('credito');
    expect(r.orderId).toBe('');
    expect(r.conciliado).toBe(false);
    expect(r.liquido).toBeCloseTo(0.8, 10);
  });

  it('pagamento de venda e marcado como pedido', () => {
    expect(juntarRecebiveis([pagamento()], [venda()], HOJE)[0].tipo).toBe('pedido');
  });

  it('credito e venda liberando junto viram duas linhas', () => {
    // Somar 238,21 + 0,80 é o que reproduz os R$ 239,01 do app.
    const dois = [
      pagamento({ paymentId: 'A', orderId: '2000001', liquido: 238.21, liberaEm: '2026-09-04T15:44:23.000-04:00' }),
      pagamento({ paymentId: 'B', orderId: '', liquido: 0.8, liberaEm: '2026-09-04T15:44:23.000-04:00' }),
    ];
    const r = resumirCaixa(juntarRecebiveis(dois, [venda()], HOJE), HOJE);
    expect(r.porDia).toEqual([{ dia: '2026-09-04', valor: 239.01 }]);
  });

  it('ordena pelo que cai primeiro', () => {
    const pagamentos = [
      pagamento({ orderId: 'B', liberaEm: '2026-09-20T12:00:00Z' }),
      pagamento({ orderId: 'A', liberaEm: '2026-09-06T12:00:00Z' }),
    ];
    const vendas = [venda({ id: 'V1', mlOrderId: 'A' }), venda({ id: 'V2', mlOrderId: 'B' })];
    expect(juntarRecebiveis(pagamentos, vendas, HOJE).map(r => r.orderId)).toEqual(['A', 'B']);
  });
});

describe('situacao do recebivel', () => {
  it('liberado quando o Mercado Pago diz que liberou', () => {
    const p = pagamento({ situacaoMl: 'released', liberaEm: '2026-08-20T18:23:12Z' });
    expect(juntarRecebiveis([p], [venda()], HOJE)[0].situacao).toBe('liberado');
  });

  it('retido enquanto a data nao chegou', () => {
    expect(juntarRecebiveis([pagamento()], [venda()], HOJE)[0].situacao).toBe('retido');
  });

  it('atrasado quando passou da data e ainda nao liberou', () => {
    const p = pagamento({ liberaEm: '2026-08-28T12:00:00Z', situacaoMl: 'pending' });
    expect(juntarRecebiveis([p], [venda()], HOJE)[0].situacao).toBe('atrasado');
  });

  it('data passada COM liberacao nao vira atraso', () => {
    // Sem esta regra, todo pedido antigo já pago apareceria como problema.
    const p = pagamento({ liberaEm: '2026-01-10T12:00:00Z', situacaoMl: 'released' });
    expect(juntarRecebiveis([p], [venda()], HOJE)[0].situacao).toBe('liberado');
  });

  it('liberacao imediata e liberada, mesmo com a situacao presa em pending', () => {
    // Caso real: pagamento 163215970812, R$ 161,81, aprovado e liberado no
    // mesmo instante de 08/06, líquido igual ao bruto — e `money_release_status`
    // em `pending` até hoje. Sem esta regra ele viraria atraso permanente:
    // eram R$ 187,79 de falso alarme na conta.
    const p = pagamento({
      paymentId: '163215970812',
      liberaEm: '2026-06-08T21:18:09.000-04:00',
      aprovadoEm: '2026-06-08T21:18:09.000-04:00',
      situacaoMl: 'pending',
      bruto: 161.81,
      liquido: 161.81,
    });
    expect(juntarRecebiveis([p], [], HOJE)[0].situacao).toBe('liberado');
  });

  it('atraso de verdade continua sendo atraso', () => {
    // A regra acima não pode engolir o caso legítimo: liberação prevista para
    // depois da aprovação, data vencida e ainda pendente.
    const p = pagamento({
      liberaEm: '2026-08-28T12:00:00Z',
      aprovadoEm: '2026-08-01T12:00:00Z',
      situacaoMl: 'pending',
    });
    expect(juntarRecebiveis([p], [], HOJE)[0].situacao).toBe('atrasado');
  });

  it('data de aprovacao ausente nao transforma tudo em liberado', () => {
    const p = pagamento({ aprovadoEm: '', liberaEm: '2026-08-28T12:00:00Z' });
    expect(juntarRecebiveis([p], [], HOJE)[0].situacao).toBe('atrasado');
  });
});

describe('resumo do caixa', () => {
  const comVendas = (pagamentos: PagamentoDoMl[]) => {
    const vendas = pagamentos.map((p, i) =>
      venda({ id: `V${i}`, mlOrderId: p.orderId }),
    );
    return resumirCaixa(juntarRecebiveis(pagamentos, vendas, HOJE), HOJE);
  };

  it('soma o que ainda nao caiu', () => {
    const r = comVendas([
      pagamento({ orderId: 'A', liberaEm: '2026-09-06T12:00:00Z', liquido: 100 }),
      pagamento({ orderId: 'B', liberaEm: '2026-09-20T12:00:00Z', liquido: 50 }),
    ]);
    expect(r.retidoAgora).toBeCloseTo(150, 10);
  });

  it('o que ja caiu nao entra em lugar nenhum', () => {
    const r = comVendas([
      pagamento({ orderId: 'A', situacaoMl: 'released', liberaEm: '2026-08-01T12:00:00Z', liquido: 999 }),
    ]);
    expect(r.retidoAgora).toBe(0);
    expect(r.porDia).toHaveLength(0);
  });

  it('as janelas de 7 e 30 dias sao cumulativas', () => {
    const r = comVendas([
      pagamento({ orderId: 'A', liberaEm: '2026-09-06T12:00:00Z', liquido: 100 }),
      pagamento({ orderId: 'B', liberaEm: '2026-09-20T12:00:00Z', liquido: 50 }),
      pagamento({ orderId: 'C', liberaEm: '2026-11-01T12:00:00Z', liquido: 30 }),
    ]);
    expect(r.liberaEm7).toBeCloseTo(100, 10);
    expect(r.liberaEm30).toBeCloseTo(150, 10);
    expect(r.retidoAgora).toBeCloseTo(180, 10);
  });

  it('atrasado entra no retido e aparece a parte', () => {
    // Ele é dinheiro que ainda não caiu; escondê-lo do total mentiria sobre o
    // quanto está preso.
    const r = comVendas([
      pagamento({ orderId: 'A', liberaEm: '2026-08-28T12:00:00Z', liquido: 70 }),
      pagamento({ orderId: 'B', liberaEm: '2026-09-06T12:00:00Z', liquido: 100 }),
    ]);
    expect(r.atrasado).toBeCloseTo(70, 10);
    expect(r.retidoAgora).toBeCloseTo(170, 10);
    // O atrasado não tem data futura, então não polui a linha do tempo.
    expect(r.porDia.map(d => d.dia)).toEqual(['2026-09-06']);
  });

  it('sem liquido informado, fica fora da soma e e contado', () => {
    // Estimar o depósito seria prometer um número que não veio da fonte.
    const r = comVendas([
      pagamento({ orderId: 'A', liquido: null }),
      pagamento({ orderId: 'B', liberaEm: '2026-09-06T12:00:00Z', liquido: 100 }),
    ]);
    expect(r.retidoAgora).toBeCloseTo(100, 10);
    expect(r.semLiquido).toBe(1);
  });

  it('agrupa por dia o que entra', () => {
    const r = comVendas([
      pagamento({ orderId: 'A', liberaEm: '2026-09-06T12:00:00Z', liquido: 100 }),
      pagamento({ orderId: 'B', liberaEm: '2026-09-06T20:00:00Z', liquido: 25 }),
      pagamento({ orderId: 'C', liberaEm: '2026-09-08T12:00:00Z', liquido: 40 }),
    ]);
    expect(r.porDia).toEqual([
      { dia: '2026-09-06', valor: 125 },
      { dia: '2026-09-08', valor: 40 },
    ]);
  });

  it('o nao conciliado entra no total e aparece a parte', () => {
    // O total precisa bater com o app do Mercado Pago; a separação existe só
    // para explicar a parte que a tela não consegue nomear.
    const pagamentos = [
      pagamento({ orderId: 'A', liberaEm: '2026-09-06T12:00:00Z', liquido: 100 }),
      pagamento({ orderId: 'ORFAO', liberaEm: '2026-09-06T12:00:00Z', liquido: 502.12 }),
    ];
    const r = resumirCaixa(
      juntarRecebiveis(pagamentos, [venda({ id: 'V0', mlOrderId: 'A' })], HOJE),
      HOJE,
    );

    expect(r.retidoAgora).toBeCloseTo(602.12, 10);
    expect(r.naoConciliado).toEqual({ total: 502.12, pedidos: 1 });
    // E continua na linha do tempo: é dinheiro que entra naquele dia.
    expect(r.porDia).toEqual([{ dia: '2026-09-06', valor: 602.12 }]);
  });

  it('credito nao conta como "falta conciliar"', () => {
    // Mandar o usuário conciliar um crédito da conta seria mandá-lo atrás de
    // uma venda que não existe. São contadores separados de propósito.
    const pagamentos = [
      pagamento({ paymentId: 'A', orderId: 'SEM-VENDA', liquido: 100, liberaEm: '2026-09-06T12:00:00Z' }),
      pagamento({ paymentId: 'B', orderId: '', liquido: 0.8, liberaEm: '2026-09-06T12:00:00Z' }),
    ];
    const r = resumirCaixa(juntarRecebiveis(pagamentos, [], HOJE), HOJE);

    expect(r.naoConciliado).toEqual({ total: 100, pedidos: 1 });
    expect(r.creditos).toEqual({ total: 0.8, itens: 1 });
    expect(r.retidoAgora).toBeCloseTo(100.8, 10);
  });

  it('caixa vazio devolve zeros, nao NaN', () => {
    const r = resumirCaixa([], HOJE);
    expect(r).toEqual({
      retidoAgora: 0,
      liberaEm7: 0,
      liberaEm30: 0,
      atrasado: 0,
      porDia: [],
      semLiquido: 0,
      naoConciliado: { total: 0, pedidos: 0 },
      creditos: { total: 0, itens: 0 },
    });
  });
});

describe('indice por pedido', () => {
  it('permite a tela de vendas cruzar sem varrer a lista', () => {
    const recebiveis = juntarRecebiveis([pagamento()], [venda()], HOJE);
    expect(porOrderId(recebiveis).get('2000001')?.liquido).toBeCloseTo(149.52, 10);
  });
});
