/**
 * Normalização do pagamento do Mercado Pago.
 *
 * Os exemplos são respostas REAIS da conta, colhidas no espião que decidiu a
 * rota (2026-09-04). Se o Mercado Pago mudar o contrato, é aqui que quebra —
 * em vez de a tela passar a mostrar caixa errado em silêncio.
 */
import { jaResolvido, normalizarPagamento } from './payouts';

/** Pedido 2000018260149664: R$ 178 pagos, R$ 149,52 depositados. */
const cru = () => ({
  id: 177011312292,
  status: 'approved',
  status_detail: 'accredited',
  money_release_date: '2026-09-11T18:54:14.000-04:00',
  money_release_status: 'pending',
  money_release_schema: null,
  transaction_amount: 178,
  transaction_amount_refunded: 0,
  transaction_details: {
    net_received_amount: 149.52,
    total_paid_amount: 178,
    overpaid_amount: 0,
  },
  fee_details: [],
});

describe('normalizacao do pagamento', () => {
  it('guarda data, situacao, bruto e liquido', () => {
    expect(normalizarPagamento('2000018260149664', cru())).toEqual({
      orderId: '2000018260149664',
      paymentId: '177011312292',
      liberaEm: '2026-09-11T18:54:14.000-04:00',
      situacaoMl: 'pending',
      bruto: 178,
      liquido: 149.52,
    });
  });

  it('o id do pagamento vira texto, nao numero', () => {
    // Ele é chave de documento e vai para a tela; number perderia precisão
    // acima de 2^53 e compararia diferente do que o Firestore guardou.
    expect(typeof normalizarPagamento('1', cru())!.paymentId).toBe('string');
  });

  it('sem liquido informado, o campo fica nulo — nunca estimado', () => {
    // Estimar o depósito a partir da comissão erraria: medido na conta real,
    // um pedido de R$ 115 deposita R$ 79,95 e a comissão era R$ 20,70.
    const bruto = cru();
    bruto.transaction_details = { total_paid_amount: 178, overpaid_amount: 0 } as never;
    expect(normalizarPagamento('1', bruto)!.liquido).toBeNull();
  });

  it('liquido zero e um valor, nao ausencia', () => {
    const bruto = cru();
    bruto.transaction_details.net_received_amount = 0;
    expect(normalizarPagamento('1', bruto)!.liquido).toBe(0);
  });

  it('reconhece pagamento ja liberado', () => {
    const bruto = cru();
    bruto.money_release_status = 'released';
    expect(normalizarPagamento('1', bruto)!.situacaoMl).toBe('released');
  });

  it('sem data de liberacao nao vira recebivel', () => {
    const bruto = cru();
    bruto.money_release_date = '';
    expect(normalizarPagamento('1', bruto)).toBeNull();
  });

  it('sem id nao vira recebivel', () => {
    const bruto = cru();
    bruto.id = 0 as never;
    expect(normalizarPagamento('1', bruto)).toBeNull();
  });
});

describe('o que nao precisa ser perguntado de novo', () => {
  const AGORA = new Date('2026-09-04T12:00:00Z');
  const pago = (over = {}) => ({
    orderId: '1',
    paymentId: '2',
    liberaEm: '2026-08-20T12:00:00Z',
    situacaoMl: 'released',
    bruto: 178,
    liquido: 149.52,
    ...over,
  });

  it('liberado ha mais de tres dias esta resolvido', () => {
    // Cada pedido custa duas chamadas; reconsultar o que já caiu faria a
    // rodada crescer com o histórico em vez de encolher.
    expect(jaResolvido(pago(), AGORA)).toBe(true);
  });

  it('liberado ontem ainda e reconsultado', () => {
    // A liberação pode voltar atrás (disputa, chargeback) logo depois.
    expect(jaResolvido(pago({ liberaEm: '2026-09-03T12:00:00Z' }), AGORA)).toBe(false);
  });

  it('pendente sempre e reconsultado', () => {
    expect(jaResolvido(pago({ situacaoMl: 'pending' }), AGORA)).toBe(false);
  });

  it('pedido nunca consultado entra na fila', () => {
    expect(jaResolvido(undefined, AGORA)).toBe(false);
  });

  it('data corrompida nao trava o pedido como resolvido', () => {
    expect(jaResolvido(pago({ liberaEm: 'nada' }), AGORA)).toBe(false);
  });
});
