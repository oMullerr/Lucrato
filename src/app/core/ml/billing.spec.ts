/**
 * Conciliação com o faturamento do Mercado Livre.
 *
 * O que estes testes protegem é a honestidade do número: a diferença mostrada
 * tem de ser diferença de verdade. Metade deles existe para provar que a tela
 * NÃO acusa divergência onde não há uma — venda cancelada, venda dividida entre
 * lotes, arredondamento de centavo e venda ainda não conciliada não podem virar
 * alarme, senão o alarme deixa de significar alguma coisa.
 */
import {
  DetalheBruto,
  PeriodoDeFaturamento,
  TOLERANCIA,
  VERSAO_AGREGACAO,
  agregarPeriodo,
  classificarCobranca,
  confrontar,
} from './billing';
import { calculateSale } from '../services/calculations';
import type { ComputedSale, Purchase, Return, Sale } from '../models/models';
import { makePurchase, makeReturn, makeSale } from '../../../testing/fixtures';

const BASE = {
  key: '2026-09-01',
  dateFrom: '2026-08-19',
  dateTo: '2026-09-18',
  status: 'CLOSED' as const,
  totalMl: 0,
};

function detalhe(over: Partial<DetalheBruto> = {}): DetalheBruto {
  return {
    detailId: 1,
    subTipo: 'CV',
    tipo: 'CHARGE',
    rotulo: 'Cargo por venda',
    valor: 10,
    orderId: '2000001',
    ...over,
  };
}

const COMPRA: Purchase = makePurchase({ id: 'C001', product: 'Furadeira', unitCost: 100 });

function venda(over: Partial<Sale> = {}, devolucoes: Return[] = []): ComputedSale {
  const v = makeSale({
    id: 'V001',
    batchId: 'C001',
    product: 'Furadeira',
    saleDate: '2026-09-01',
    quantitySold: 1,
    unitPrice: 200,
    feePercentage: 0.12,
    sellerShipping: 20,
    mlOrderId: '2000001',
    source: 'mercadolivre',
    ...over,
  });
  return calculateSale(v, [COMPRA], devolucoes);
}

/* ─────────────────────────── Classificação ─────────────────────────── */

describe('classificacao das linhas da fatura', () => {
  it('reconhece os codigos que a documentacao nomeia', () => {
    expect(classificarCobranca('CV', 'Cargo por venda', 'CHARGE')).toBe('comissao');
    expect(classificarCobranca('CXD', 'Cargo por Mercado Envios', 'CHARGE')).toBe('frete');
  });

  // Os códigos abaixo foram lidos da fatura real da conta; a documentação só
  // publica os genéricos. Se o Mercado Livre trocar um deles, é aqui que quebra.
  it('reconhece a tarifa de venda do Brasil, que vem desmembrada', () => {
    // Os dois somados são o `sale_fee` que chega no pedido.
    expect(classificarCobranca('CVVML', 'Custo por vender no Mercado Livre', 'CHARGE')).toBe('comissao');
    expect(classificarCobranca('CVVPRC', 'Custo por cobrar no Mercado Pago', 'CHARGE')).toBe('comissao');
    expect(classificarCobranca('BVVML', 'Cancelamento do Custo por vender no Mercado Livre', 'BONUS')).toBe('comissao');
    expect(classificarCobranca('BVVPRC', 'Cancelamento do Custo por cobrar no Mercado Pago', 'BONUS')).toBe('comissao');
  });

  it('reconhece as tres tarifas de envio', () => {
    expect(classificarCobranca('CDSB', 'Tarifa do Mercado Envios', 'CHARGE')).toBe('frete');
    expect(classificarCobranca('CXDE', 'Tarifa de envio extra ou intermunicipal', 'CHARGE')).toBe('frete');
    expect(classificarCobranca('CXDED', 'Tarifa de devolução por envio externo', 'CHARGE')).toBe('frete');
  });

  it('parcelamento e taxa de recebimento nao sao tarifa de venda', () => {
    // O parcelamento é acréscimo pago pelo comprador e a taxa de recebimento é
    // tarifa de conta: nenhum dos dois entra no `sale_fee`, então tratá-los
    // como comissão faria a comissão do app parecer subestimada todo mês.
    expect(classificarCobranca('CVVFN', 'Taxa de parcelamento', 'CHARGE')).toBe('outros');
    expect(classificarCobranca('BVVFN', 'Cancelamento da taxa de parcelamento', 'BONUS')).toBe('outros');
    expect(classificarCobranca('CVVFNU', 'Taxa de recebimento', 'CHARGE')).toBe('outros');
  });

  it('separa as duas bonificacoes que compartilham o codigo BXD', () => {
    // O Mercado Livre usa BXD para as duas; só o rótulo distingue.
    expect(classificarCobranca('BXD', 'Bonificação do cargo por venda', 'BONUS')).toBe('comissao');
    expect(classificarCobranca('BXD', 'Bonificação cargo por Mercado Envios', 'BONUS')).toBe('frete');
  });

  it('nao chuta: cobranca desconhecida vai para outros', () => {
    // Taxa de parcelamento e publicidade existem na fatura e não têm campo no
    // Lucrato. Fingir que são comissão faria a comissão do app parecer errada.
    expect(classificarCobranca('CFONPN', 'Taxa de parcelamento', 'CHARGE')).toBe('outros');
    expect(classificarCobranca('PADS', 'Campanhas de publicidade - Product Ads', 'CHARGE')).toBe('outros');
    expect(classificarCobranca('', '', 'CHARGE')).toBe('outros');
  });

  it('bonificacao de publicidade nao credita comissao', () => {
    expect(classificarCobranca('BPADS', 'Bonificação de Product Ads', 'BONUS')).toBe('outros');
  });

  it('ignora caixa e espaco no codigo', () => {
    expect(classificarCobranca(' cv ', 'qualquer', 'CHARGE')).toBe('comissao');
  });
});

/* ───────────────────────────── Agregação ───────────────────────────── */

describe('agregacao do periodo', () => {
  it('soma por balde e por pedido', () => {
    const p = agregarPeriodo(BASE, [
      detalhe({ detailId: 1, subTipo: 'CV', valor: 24, orderId: '2000001' }),
      detalhe({ detailId: 2, subTipo: 'CXD', rotulo: 'Cargo por Mercado Envios', valor: 20, orderId: '2000001' }),
      detalhe({ detailId: 3, subTipo: 'CV', valor: 12, orderId: '2000002' }),
    ]);

    expect(p.cobrado.comissao).toBeCloseTo(36, 10);
    expect(p.cobrado.frete).toBeCloseTo(20, 10);
    expect(p.porPedido).toHaveLength(2);
    expect(p.porPedido.find(x => x.orderId === '2000001')).toEqual({
      orderId: '2000001',
      comissao: 24,
      frete: 20,
      outros: 0,
    });
  });

  it('bonificacao entra com sinal negativo, devolvendo a cobranca', () => {
    const p = agregarPeriodo(BASE, [
      detalhe({ detailId: 1, subTipo: 'CV', valor: 24 }),
      detalhe({
        detailId: 2,
        subTipo: 'BXD',
        tipo: 'BONUS',
        rotulo: 'Bonificação do cargo por venda',
        valor: 24,
      }),
    ]);

    expect(p.cobrado.comissao).toBeCloseTo(0, 10);
    expect(p.porPedido[0].comissao).toBeCloseTo(0, 10);
  });

  it('agrupa por rotulo e ordena pelo que explica mais dinheiro', () => {
    const p = agregarPeriodo(BASE, [
      detalhe({ detailId: 1, subTipo: 'CV', valor: 5 }),
      detalhe({ detailId: 2, subTipo: 'CV', valor: 7 }),
      detalhe({ detailId: 3, subTipo: 'PADS', rotulo: 'Product Ads', valor: 100, orderId: '' }),
    ]);

    expect(p.porRotulo[0].rotulo).toBe('Product Ads');
    const comissao = p.porRotulo.find(l => l.subTipo === 'CV')!;
    expect(comissao.valor).toBeCloseTo(12, 10);
    expect(comissao.linhas).toBe(2);
  });

  it('carimba a versao da classificacao', () => {
    // É o que permite o servidor recoletar o que foi somado com uma
    // classificação antiga, em vez de deixar número velho na tela.
    expect(agregarPeriodo(BASE, [detalhe()]).versao).toBe(VERSAO_AGREGACAO);
  });

  it('cobranca sem pedido nao vira pedido fantasma', () => {
    const p = agregarPeriodo(BASE, [detalhe({ subTipo: 'PADS', rotulo: 'Product Ads', orderId: '' })]);
    expect(p.porPedido).toHaveLength(0);
    expect(p.cobrado.outros).toBeCloseTo(10, 10);
  });
});

/* ───────────────────────────── Confronto ───────────────────────────── */

function periodo(detalhes: DetalheBruto[], over: Partial<PeriodoDeFaturamento> = {}) {
  return { ...agregarPeriodo(BASE, detalhes), ...over };
}

describe('confronto com o que o Lucrato registrou', () => {
  it('numeros iguais nao acusam divergencia', () => {
    // 200 × 12% = 24 de comissão, 20 de frete.
    const p = periodo([
      detalhe({ detailId: 1, subTipo: 'CV', valor: 24 }),
      detalhe({ detailId: 2, subTipo: 'CXD', rotulo: 'Cargo por Mercado Envios', valor: 20 }),
    ]);

    const c = confrontar(p, [venda()]);
    expect(c.cobradoComparavel).toBeCloseTo(44, 10);
    expect(c.registradoComparavel).toBeCloseTo(44, 10);
    expect(c.diferenca).toBeCloseTo(0, 10);
    expect(c.divergentes).toBe(0);
    expect(c.pedidos[0].veredito).toBe('ok');
  });

  it('acusa quando o Mercado Livre cobrou comissao maior', () => {
    const p = periodo([
      detalhe({ detailId: 1, subTipo: 'CV', valor: 34 }),
      detalhe({ detailId: 2, subTipo: 'CXD', rotulo: 'Cargo por Mercado Envios', valor: 20 }),
    ]);

    const c = confrontar(p, [venda()]);
    expect(c.diferenca).toBeCloseTo(10, 10);
    expect(c.divergentes).toBe(1);
    expect(c.pedidos[0].veredito).toBe('divergente');
  });

  it('cobranca que o Lucrato nao modela aparece como diferenca', () => {
    // Taxa de parcelamento e publicidade não existem no modelo de venda; o
    // valor tem de sobrar na conta em vez de sumir.
    const p = periodo([
      detalhe({ detailId: 1, subTipo: 'CV', valor: 24 }),
      detalhe({ detailId: 2, subTipo: 'CXD', rotulo: 'Cargo por Mercado Envios', valor: 20 }),
      detalhe({ detailId: 3, subTipo: 'CFONPN', rotulo: 'Taxa de parcelamento', valor: 2.75 }),
    ]);

    const c = confrontar(p, [venda()]);
    expect(c.pedidos[0].cobrado.outros).toBeCloseTo(2.75, 10);
    expect(c.diferenca).toBeCloseTo(2.75, 10);
  });

  it('centavo de arredondamento nao vira alarme', () => {
    const p = periodo([
      detalhe({ detailId: 1, subTipo: 'CV', valor: 24.01 }),
      detalhe({ detailId: 2, subTipo: 'CXD', rotulo: 'Cargo por Mercado Envios', valor: 20 }),
    ]);

    const c = confrontar(p, [venda()]);
    expect(Math.abs(c.diferenca)).toBeLessThanOrEqual(TOLERANCIA);
    expect(c.divergentes).toBe(0);
  });

  it('venda dividida entre lotes e somada antes de comparar', () => {
    // Uma order de 3 unidades que não coube num lote só vira duas vendas. Cada
    // fatia sozinha pareceria cobrada a menos.
    const p = periodo([detalhe({ detailId: 1, subTipo: 'CV', valor: 72, orderId: '2000001' })]);

    const fatias = [
      venda({ id: 'V001', quantitySold: 2, sellerShipping: 0, externalId: '2000001:MLB1:1' }),
      venda({ id: 'V002', quantitySold: 1, sellerShipping: 0, externalId: '2000001:MLB1:2' }),
    ];

    const c = confrontar(p, fatias);
    expect(c.pedidos).toHaveLength(1);
    // 3 × 200 × 12% = 72.
    expect(c.registradoComparavel).toBeCloseTo(72, 10);
    expect(c.divergentes).toBe(0);
  });

  it('venda cancelada nao cobra comissao que o Mercado Livre nao cobrou', () => {
    // A venda continua no razão com feePercentage, mas não conta como receita.
    const p = periodo([]);
    const c = confrontar(
      { ...p, porPedido: [{ orderId: '2000001', comissao: 0, frete: 0, outros: 0 }] },
      [venda({ status: 'Cancelada' })],
    );

    expect(c.registradoComparavel).toBeCloseTo(0, 10);
    expect(c.divergentes).toBe(0);
  });

  it('devolucao finalizada reduz a comissao registrada, como a bonificacao reduz a cobrada', () => {
    const p = periodo([
      detalhe({ detailId: 1, subTipo: 'CV', valor: 24 }),
      detalhe({
        detailId: 2,
        subTipo: 'BXD',
        tipo: 'BONUS',
        rotulo: 'Bonificação do cargo por venda',
        valor: 24,
      }),
    ]);

    const v = venda({ sellerShipping: 0 }, [
      makeReturn({ saleId: 'V001', quantity: 1, arrivalDate: '2026-09-10' }),
    ]);

    const c = confrontar(p, [v]);
    expect(c.registradoComparavel).toBeCloseTo(0, 10);
    expect(c.diferenca).toBeCloseTo(0, 10);
  });

  it('tarifa de devolucao casa com o frete que a devolucao registrou', () => {
    // No Lucrato o frete da devolução mora em `Return`, não em `Sale` — mas o
    // Mercado Livre cobra os dois no mesmo pedido. Ignorar isso acusaria
    // divergência em toda venda devolvida.
    const p = periodo([
      detalhe({
        detailId: 1,
        subTipo: 'CXDED',
        rotulo: 'Tarifa de devolução por envio externo ou intermunicipal',
        valor: 33,
      }),
    ]);

    const v = venda({ sellerShipping: 0 }, [
      makeReturn({ saleId: 'V001', quantity: 1, arrivalDate: '2026-09-10', returnShipping: 33 }),
    ]);

    expect(confrontar(p, [v]).diferenca).toBeCloseTo(0, 10);
  });

  it('frete de pedido Flex nao e registrado, mas a cobranca aparece', () => {
    // No Flex o frete é pago à transportadora particular. Se o Mercado Livre
    // cobrar envio nesse pedido, isso precisa saltar aos olhos.
    const p = periodo([
      detalhe({ detailId: 1, subTipo: 'CV', valor: 24 }),
      detalhe({ detailId: 2, subTipo: 'CXD', rotulo: 'Cargo por Mercado Envios', valor: 8.01 }),
    ]);

    const c = confrontar(p, [venda({ shippingType: 'flex', sellerShipping: 0, flexRefund: 0 })]);
    expect(c.pedidos[0].registrado.frete).toBeCloseTo(0, 10);
    expect(c.diferenca).toBeCloseTo(8.01, 10);
    expect(c.divergentes).toBe(1);
  });
});

describe('o que fica fora da conta principal', () => {
  it('pedido cobrado sem venda correspondente nao entra na diferenca', () => {
    // Vendas digitadas à mão antes da integração não têm mlOrderId. Somá-las na
    // diferença transformaria "falta conciliar" em "o Mercado Livre errou".
    const p = periodo([detalhe({ detailId: 1, subTipo: 'CV', valor: 24, orderId: '2000099' })]);

    const c = confrontar(p, [venda()]);
    expect(c.pedidos).toHaveLength(0);
    expect(c.diferenca).toBeCloseTo(0, 10);
    expect(c.semVenda).toEqual({ total: 24, pedidos: 1 });
  });

  it('cobranca sem pedido nenhum e contabilizada a parte', () => {
    const p = periodo([
      detalhe({ detailId: 1, subTipo: 'CV', valor: 24 }),
      detalhe({ detailId: 2, subTipo: 'CXD', rotulo: 'Cargo por Mercado Envios', valor: 20 }),
      detalhe({ detailId: 3, subTipo: 'PADS', rotulo: 'Product Ads', valor: 48.6, orderId: '' }),
    ]);

    const c = confrontar(p, [venda()]);
    expect(c.semPedido).toBeCloseTo(48.6, 10);
    expect(c.diferenca).toBeCloseTo(0, 10);
  });

  it('venda do periodo ainda nao cobrada e contada separadamente', () => {
    const c = confrontar(periodo([]), [venda()]);
    expect(c.semCobranca).toEqual({ total: 44, vendas: 1 });
  });

  it('venda fora da janela do periodo nao entra em sem cobranca', () => {
    // O ciclo do Mercado Livre não é o mês civil: pode ir de 19/08 a 18/09.
    const c = confrontar(periodo([]), [venda({ saleDate: '2026-07-10' })]);
    expect(c.semCobranca).toEqual({ total: 0, vendas: 0 });
  });

  it('venda manual sem id do Mercado Livre e ignorada dos dois lados', () => {
    const manual = venda({ mlOrderId: undefined, source: undefined });
    const c = confrontar(periodo([]), [manual]);
    expect(c.semCobranca.vendas).toBe(0);
    expect(c.pedidos).toHaveLength(0);
  });
});
