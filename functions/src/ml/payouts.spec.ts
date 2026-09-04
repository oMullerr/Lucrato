/**
 * Normalização do pagamento do Mercado Pago.
 *
 * Os exemplos são respostas REAIS da conta. O caso central é o par que passou
 * despercebido: um pagamento de venda e um crédito sem pedido liberando no
 * MESMO instante — o app do Mercado Pago soma os dois na linha do dia, e a
 * primeira versão só enxergava o primeiro.
 */
import { jaResolvido, normalizarPagamento } from './payouts';

/** Pedido 2000018143858990: R$ 287 pagos, R$ 238,21 depositados. */
const venda = () => ({
  id: 175858466634,
  status: 'approved',
  status_detail: 'accredited',
  operation_type: 'regular_payment',
  money_release_date: '2026-09-04T15:44:23.000-04:00',
  money_release_status: 'pending',
  date_approved: '2026-08-27T09:27:30.000-04:00',
  transaction_amount: 287,
  transaction_details: { net_received_amount: 238.21, total_paid_amount: 287 },
  order: { id: '2000018143858990', type: 'mercadolibre' },
});

/** O crédito de R$ 0,80 que libera no mesmo instante — e não tem pedido. */
const credito = () => ({
  id: 174914022141,
  status: 'approved',
  status_detail: 'accredited',
  operation_type: 'money_transfer',
  money_release_date: '2026-09-04T15:44:23.000-04:00',
  money_release_status: 'pending',
  date_approved: '2026-08-27T09:27:28.000-04:00',
  transaction_amount: 0.8,
  transaction_details: { net_received_amount: 0.8, total_paid_amount: 0.8 },
});

/** Tentativa recusada: a busca devolve, mas não é dinheiro. */
const recusado = () => ({
  id: 176023677765,
  status: 'rejected',
  operation_type: 'regular_payment',
  money_release_date: null,
  money_release_status: 'pending',
  transaction_amount: 19,
  transaction_details: { net_received_amount: 0, total_paid_amount: 0 },
  order: { id: '2000018256632318' },
});

describe('pagamento de venda', () => {
  it('guarda pagamento, pedido, data, situacao, bruto e liquido', () => {
    expect(normalizarPagamento(venda())).toEqual({
      paymentId: '175858466634',
      orderId: '2000018143858990',
      liberaEm: '2026-09-04T15:44:23.000-04:00',
      aprovadoEm: '2026-08-27T09:27:30.000-04:00',
      situacaoMl: 'pending',
      bruto: 287,
      liquido: 238.21,
    });
  });

  it('guarda a data de aprovacao', () => {
    // Sem ela não dá para reconhecer liberação imediata, e todo pagamento
    // desse tipo viraria atraso permanente na tela.
    expect(normalizarPagamento(venda())!.aprovadoEm).toBe('2026-08-27T09:27:30.000-04:00');
  });

  it('os ids viram texto, nao numero', () => {
    // São chave de documento e passam de 2^53; number perderia precisão.
    const p = normalizarPagamento(venda())!;
    expect(typeof p.paymentId).toBe('string');
    expect(typeof p.orderId).toBe('string');
  });
});

describe('credito sem pedido', () => {
  it('entra no caixa, com pedido vazio', () => {
    // É o caso que a versão anterior não via: R$ 0,80 e R$ 0,90 liberando
    // junto com uma venda, somados pelo Mercado Pago na mesma linha do dia.
    const p = normalizarPagamento(credito())!;
    expect(p.paymentId).toBe('174914022141');
    expect(p.orderId).toBe('');
    expect(p.liquido).toBeCloseTo(0.8, 10);
  });

  it('libera no mesmo instante da venda, e os dois sobrevivem', () => {
    const a = normalizarPagamento(venda())!;
    const b = normalizarPagamento(credito())!;
    expect(a.liberaEm).toBe(b.liberaEm);
    expect(a.paymentId).not.toBe(b.paymentId);
    // 238,21 + 0,80 = 239,01, que é o que o app mostra.
    expect(a.liquido! + b.liquido!).toBeCloseTo(239.01, 10);
  });
});

describe('o que nao e dinheiro fica de fora', () => {
  it('tentativa recusada nao entra', () => {
    expect(normalizarPagamento(recusado())).toBeNull();
  });

  it('sem data de liberacao nao entra, mesmo aprovado', () => {
    const b = { ...venda(), money_release_date: null };
    expect(normalizarPagamento(b)).toBeNull();
  });

  it('status diferente de aprovado nao entra, mesmo com data', () => {
    // Dinheiro em disputa ainda pode não acontecer.
    expect(normalizarPagamento({ ...venda(), status: 'in_mediation' })).toBeNull();
  });

  it('sem id nao entra', () => {
    expect(normalizarPagamento({ ...venda(), id: 0 })).toBeNull();
  });
});

describe('liquido', () => {
  it('sem valor informado, fica nulo — nunca estimado', () => {
    const b = { ...venda(), transaction_details: { total_paid_amount: 287 } };
    expect(normalizarPagamento(b)!.liquido).toBeNull();
  });

  it('zero e um valor, nao ausencia', () => {
    const b = { ...venda(), transaction_details: { net_received_amount: 0 } };
    expect(normalizarPagamento(b)!.liquido).toBe(0);
  });
});

describe('o que nao precisa ser perguntado de novo', () => {
  const AGORA = new Date('2026-09-04T12:00:00Z');
  const pago = (over = {}) => ({
    paymentId: '2',
    orderId: '1',
    liberaEm: '2026-08-20T12:00:00Z',
    aprovadoEm: '2026-08-01T12:00:00Z',
    situacaoMl: 'released',
    bruto: 178,
    liquido: 149.52,
    ...over,
  });

  it('liberado ha mais de tres dias esta resolvido', () => {
    expect(jaResolvido(pago(), AGORA)).toBe(true);
  });

  it('liberado ontem ainda e reconsultado', () => {
    // A liberação pode voltar atrás (disputa, chargeback) logo depois.
    expect(jaResolvido(pago({ liberaEm: '2026-09-03T12:00:00Z' }), AGORA)).toBe(false);
  });

  it('pendente sempre e reconsultado', () => {
    expect(jaResolvido(pago({ situacaoMl: 'pending' }), AGORA)).toBe(false);
  });

  it('pagamento nunca visto entra na fila', () => {
    expect(jaResolvido(undefined, AGORA)).toBe(false);
  });

  it('data corrompida nao trava o pagamento como resolvido', () => {
    expect(jaResolvido(pago({ liberaEm: 'nada' }), AGORA)).toBe(false);
  });
});
