/**
 * Normalização do faturamento cru da API.
 *
 * Os exemplos são os da própria documentação do Mercado Livre (arquivada em
 * `refs/mercadolivre/provisoes.md` e `relatorios-de-faturamento.md`), para o
 * teste falhar se o contrato mudar em vez de só repetir o que o código faz.
 */
import { normalizarDetalhe, normalizarPeriodo } from './billing';

describe('normalizacao do periodo', () => {
  const cru = () => ({
    amount: 30.46,
    unpaid_amount: 0.0,
    period: { date_from: '2020-02-19', date_to: '2020-03-18' },
    key: '2020-03-01',
    expiration_date: '2020-03-24',
    period_status: 'CLOSED',
  });

  it('preserva a janela real, que nao e o mes civil', () => {
    // A chave é 2020-03-01, mas o ciclo cobre de 19/02 a 18/03. Assumir o mês
    // civil colocaria vendas no período errado.
    const p = normalizarPeriodo(cru())!;
    expect(p.key).toBe('2020-03-01');
    expect(p.dateFrom).toBe('2020-02-19');
    expect(p.dateTo).toBe('2020-03-18');
    expect(p.totalMl).toBeCloseTo(30.46, 10);
    expect(p.status).toBe('CLOSED');
  });

  it('reconhece periodo aberto', () => {
    expect(normalizarPeriodo({ ...cru(), period_status: 'OPEN' })!.status).toBe('OPEN');
  });

  it('estado desconhecido nao vira aberto por acidente', () => {
    // Só o período aberto é reconsultado todo dia; um estado estranho tratado
    // como aberto faria a rodada diária puxar 12 períodos sem necessidade.
    expect(normalizarPeriodo({ ...cru(), period_status: 'WHATEVER' })!.status).toBe('CLOSED');
  });

  it('descarta periodo sem chave', () => {
    expect(normalizarPeriodo({ ...cru(), key: undefined })).toBeNull();
  });
});

describe('normalizacao do detalhe', () => {
  const cru = () => ({
    charge_info: {
      creation_date_time: '2024-11-14T10:36:38',
      detail_id: 126303124,
      transaction_detail: 'Taxa de parcelamento (acréscimo no valor pago pelo comprador)',
      detail_amount: 2.75,
      detail_type: 'CHARGE',
      detail_sub_type: 'CFONPN',
    },
    discount_info: { charge_amount_without_discount: 2.75, discount_amount: 0 },
    sales_info: [{ order_id: 2000009839350282, transaction_amount: 100 }],
    shipping_info: null,
    items_info: null,
    document_info: { document_id: 3454540850 },
    currency_info: { currency_id: 'BRL' },
  });

  it('achata a linha para o que a conciliacao precisa', () => {
    const d = normalizarDetalhe(cru())!;
    expect(d).toEqual({
      detailId: 126303124,
      subTipo: 'CFONPN',
      tipo: 'CHARGE',
      rotulo: 'Taxa de parcelamento (acréscimo no valor pago pelo comprador)',
      valor: 2.75,
      orderId: '2000009839350282',
    });
  });

  it('o id do pedido vira texto, nao numero', () => {
    // O Mercado Livre manda number; a venda guarda string. Comparar os dois
    // sem converter faria todo pedido parecer sem venda correspondente.
    expect(typeof normalizarDetalhe(cru())!.orderId).toBe('string');
  });

  it('cobranca sem venda associada fica sem pedido', () => {
    const d = normalizarDetalhe({ ...cru(), sales_info: [] })!;
    expect(d.orderId).toBe('');
  });

  it('reconhece bonificacao', () => {
    const bruto = cru();
    bruto.charge_info.detail_type = 'BONUS';
    bruto.charge_info.detail_sub_type = 'BXD';
    bruto.charge_info.transaction_detail = 'Bonificação do cargo por venda';
    expect(normalizarDetalhe(bruto)!.tipo).toBe('BONUS');
  });

  it('valor negativo vira positivo: o sinal vem do tipo da linha', () => {
    const bruto = cru();
    bruto.charge_info.detail_amount = -2.75;
    bruto.charge_info.detail_type = 'BONUS';
    expect(normalizarDetalhe(bruto)!.valor).toBeCloseTo(2.75, 10);
  });

  it('descarta linha sem id de detalhe', () => {
    const bruto = cru();
    bruto.charge_info.detail_id = 0;
    expect(normalizarDetalhe(bruto)).toBeNull();
  });
});
