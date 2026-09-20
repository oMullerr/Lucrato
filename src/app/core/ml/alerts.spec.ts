/**
 * Alertas de operação.
 *
 * O compromisso destes testes é o contrário do usual: além de provar que o
 * alerta aparece quando deve, eles provam que ele NÃO aparece quando não há o
 * que fazer. Alerta falso vira ruído, e ruído faz o painel ser ignorado.
 */
import { AnuncioParaAlerta, MINIMO_DE_VISITAS, gerarAlertas } from './alerts';
import { calculatePurchase, calculateSale } from '../services/calculations';
import type { ComputedPurchase, ComputedSale, Sale, Settings } from '../models/models';
import { makePurchase, makeSale } from '../../../testing/fixtures';

const HOJE = new Date('2026-09-03T12:00:00Z');

const settings = { minimumMargin: 0.1, yellowAlertDays: 25, redAlertDays: 30 } as unknown as Settings;

function anuncio(over: Partial<AnuncioParaAlerta> = {}): AnuncioParaAlerta {
  return {
    id: 'MLB1',
    title: 'Furadeira Bosch',
    status: 'active',
    availableQuantity: 5,
    price: 300,
    ...over,
  };
}

const vinculos = new Map([['MLB1', { produto: 'Furadeira Bosch' }]]);

function lote(over = {}): ComputedPurchase {
  return calculatePurchase(
    makePurchase({ id: 'C001', product: 'Furadeira Bosch', quantityPurchased: 10, unitCost: 100, ...over }),
    [],
    settings,
    [],
  );
}

/** Venda computada de verdade, para a margem sair do mesmo motor do app. */
function venda(over: Partial<Sale> = {}): ComputedSale {
  const compra = makePurchase({ id: 'C001', product: 'Furadeira Bosch', quantityPurchased: 10, unitCost: 100 });
  const v: Sale = {
    ...makeSale({ id: 'V001', batchId: 'C001', quantitySold: 1, unitPrice: 300, saleDate: '2026-09-01' }),
    mlItemId: 'MLB1',
    ...over,
  };
  return calculateSale(v, [compra], []);
}

describe('anuncio ativo sem estoque', () => {
  it('acusa: esta no ar e nao pode vender', () => {
    const a = gerarAlertas([anuncio({ availableQuantity: 0 })], vinculos, [], [], settings, HOJE);
    expect(a.map(x => x.tipo)).toContain('ativo_sem_estoque');
    expect(a[0].severidade).toBe('alta');
  });

  it('com estoque, nao acusa', () => {
    const a = gerarAlertas([anuncio()], vinculos, [], [], settings, HOJE);
    expect(a.map(x => x.tipo)).not.toContain('ativo_sem_estoque');
  });

  it('pausado sem estoque nao e problema', () => {
    const a = gerarAlertas(
      [anuncio({ status: 'paused', availableQuantity: 0 })],
      vinculos,
      [],
      [],
      settings,
      HOJE,
    );
    expect(a.map(x => x.tipo)).not.toContain('ativo_sem_estoque');
  });
});

describe('pausado com estoque parado', () => {
  it('acusa capital parado sem chance de vender', () => {
    const a = gerarAlertas([anuncio({ status: 'paused' })], vinculos, [], [lote()], settings, HOJE);
    const alerta = a.find(x => x.tipo === 'pausado_com_estoque');
    expect(alerta?.dados['estoque']).toBe(10);
  });

  it('sem estoque no lote, nao acusa', () => {
    const vazio = calculatePurchase(
      makePurchase({ id: 'C001', product: 'Furadeira Bosch', quantityPurchased: 1 }),
      [makeSale({ id: 'V001', batchId: 'C001', quantitySold: 1 })],
      settings,
      [],
    );
    const a = gerarAlertas([anuncio({ status: 'paused' })], vinculos, [], [vazio], settings, HOJE);
    expect(a.map(x => x.tipo)).not.toContain('pausado_com_estoque');
  });

  it('sem vinculo nao da para saber o estoque, entao nao acusa', () => {
    const a = gerarAlertas([anuncio({ status: 'paused' })], new Map(), [], [lote()], settings, HOJE);
    expect(a.map(x => x.tipo)).not.toContain('pausado_com_estoque');
  });
});

describe('margem abaixo da meta', () => {
  it('acusa usando a margem realizada', () => {
    /* Comissao alta o bastante para a margem REALIZADA ficar abaixo de 10%,
       mas com o anuncio hoje a um preco que fecha bem. E o que separa este
       alerta do `preco_abaixo_do_minimo`: aquele olha o preco que esta no ar,
       este olha a venda que ja aconteceu. */
    const ruim = venda({ feePercentage: 0.5, sellerShipping: 40 });
    const a = gerarAlertas([anuncio({ price: 2000 })], vinculos, [ruim], [lote()], settings, HOJE);
    const alerta = a.find(x => x.tipo === 'margem_baixa');
    expect(alerta).toBeDefined();
    expect(alerta?.dados['minima']).toBe(10);
  });

  it('margem saudavel nao acusa', () => {
    const boa = venda({ feePercentage: 0.12, sellerShipping: 0 });
    const a = gerarAlertas([anuncio()], vinculos, [boa], [lote()], settings, HOJE);
    expect(a.map(x => x.tipo)).not.toContain('margem_baixa');
  });

  it('sem venda nenhuma nao ha margem para julgar', () => {
    const a = gerarAlertas([anuncio()], vinculos, [], [lote()], settings, HOJE);
    expect(a.map(x => x.tipo)).not.toContain('margem_baixa');
  });

  it('venda cancelada nao entra na conta', () => {
    const cancelada = venda({ status: 'Cancelada', feePercentage: 0.5 });
    const a = gerarAlertas([anuncio()], vinculos, [cancelada], [lote()], settings, HOJE);
    expect(a.map(x => x.tipo)).not.toContain('margem_baixa');
  });
});

describe('audiencia sem conversao', () => {
  it('acusa quando ha visita e nenhuma venda', () => {
    const a = gerarAlertas([anuncio({ visits30d: 400 })], vinculos, [], [lote()], settings, HOJE);
    const alerta = a.find(x => x.tipo === 'sem_conversao');
    expect(alerta?.dados['visitas']).toBe(400);
  });

  it('poucas visitas nao dao amostra para cobrar conversao', () => {
    const a = gerarAlertas(
      [anuncio({ visits30d: MINIMO_DE_VISITAS - 1 })],
      vinculos,
      [],
      [lote()],
      settings,
      HOJE,
    );
    expect(a.map(x => x.tipo)).not.toContain('sem_conversao');
  });

  it('com venda recente, nao acusa', () => {
    const a = gerarAlertas(
      [anuncio({ visits30d: 400 })],
      vinculos,
      [venda({ saleDate: '2026-09-01' })],
      [lote()],
      settings,
      HOJE,
    );
    expect(a.map(x => x.tipo)).not.toContain('sem_conversao');
  });

  it('venda antiga nao conta como conversao recente', () => {
    const a = gerarAlertas(
      [anuncio({ visits30d: 400 })],
      vinculos,
      [venda({ saleDate: '2026-01-10' })],
      [lote()],
      settings,
      HOJE,
    );
    expect(a.map(x => x.tipo)).toContain('sem_conversao');
  });

  it('sem metrica de visita, nao inventa alerta', () => {
    const a = gerarAlertas([anuncio()], vinculos, [], [lote()], settings, HOJE);
    expect(a.map(x => x.tipo)).not.toContain('sem_conversao');
  });
});

describe('ordenacao', () => {
  it('o mais grave vem primeiro', () => {
    const a = gerarAlertas(
      [
        anuncio({ id: 'A', title: 'Pausado', status: 'paused' }),
        anuncio({ id: 'B', title: 'Sem estoque', availableQuantity: 0 }),
      ],
      new Map([
        ['A', { produto: 'Furadeira Bosch' }],
        ['B', { produto: 'Furadeira Bosch' }],
      ]),
      [],
      [lote()],
      settings,
      HOJE,
    );
    expect(a[0].tipo).toBe('ativo_sem_estoque');
  });

  it('lista vazia quando esta tudo em ordem', () => {
    expect(gerarAlertas([anuncio()], vinculos, [], [lote()], settings, HOJE)).toEqual([]);
  });
});

/**
 * Preco do anuncio abaixo do piso, ANTES de vender.
 *
 * `margem_baixa` olha para tras: so acusa depois que a venda ruim aconteceu.
 * Este olha para frente — pega o preco que esta no ar agora, o custo do lote
 * que sairia na proxima venda e a comissao que a plataforma vem cobrando.
 */
describe('preco abaixo do minimo', () => {
  it('acusa quando o preco no ar nao fecha a margem minima', () => {
    // Lote a 100 por unidade, anuncio a 120, comissao padrao de 12%:
    // 120 - 14,40 - 100 = 5,60, ou 4,7% — abaixo dos 10% pedidos.
    const a = gerarAlertas([anuncio({ price: 120 })], vinculos, [], [lote()], settings, HOJE);
    const alerta = a.find(x => x.tipo === 'preco_abaixo_do_minimo');

    expect(alerta).toBeDefined();
    expect(alerta?.severidade).toBe('alta');
    expect(alerta?.dados['minima']).toBe(10);
    expect(Number(alerta?.dados['lucro'])).toBeCloseTo(5.6, 2);
  });

  it('preco folgado nao acusa', () => {
    const a = gerarAlertas([anuncio({ price: 300 })], vinculos, [], [lote()], settings, HOJE);
    expect(a.map(x => x.tipo)).not.toContain('preco_abaixo_do_minimo');
  });

  it('usa a comissao REAL que a plataforma vem cobrando, nao a estimada', () => {
    // A 300 com os 12% padrao sobram 54,7%; com os 60% reais, sobram 3,3%.
    const caro = venda({ feePercentage: 0.6 });
    const a = gerarAlertas([anuncio({ price: 300 })], vinculos, [caro], [lote()], settings, HOJE);
    expect(a.map(x => x.tipo)).toContain('preco_abaixo_do_minimo');
  });

  it('usa o custo do lote que sai na PROXIMA venda, pelo mesmo FIFO do razao', () => {
    /* O lote velho e barato ja acabou; o proximo a sair custa 250, e a essa
       altura o preco de 300 nao fecha mais. E o caso do "custo do lote novo
       subiu" — sem isto, so se descobre depois de vender no prejuizo. */
    const velhoVazio = calculatePurchase(
      makePurchase({ id: 'C001', product: 'Furadeira Bosch', quantityPurchased: 1, unitCost: 50,
                     purchaseDate: '2026-01-01', receiptDate: '2026-01-02' }),
      [makeSale({ id: 'V900', batchId: 'C001', quantitySold: 1 })],
      settings,
      [],
    );
    const novoCaro = calculatePurchase(
      makePurchase({ id: 'C002', product: 'Furadeira Bosch', quantityPurchased: 10, unitCost: 250,
                     purchaseDate: '2026-08-01', receiptDate: '2026-08-02' }),
      [],
      settings,
      [],
    );

    const a = gerarAlertas([anuncio({ price: 300 })], vinculos, [], [velhoVazio, novoCaro], settings, HOJE);
    expect(a.map(x => x.tipo)).toContain('preco_abaixo_do_minimo');
  });

  it('sem vinculo nao ha custo, e sem custo a margem seria invencao', () => {
    const a = gerarAlertas([anuncio({ price: 1 })], new Map(), [], [lote()], settings, HOJE);
    expect(a.map(x => x.tipo)).not.toContain('preco_abaixo_do_minimo');
  });

  it('sem estoque quem fala e `ativo_sem_estoque` — nao dois alertas no mesmo anuncio', () => {
    const vazio = calculatePurchase(
      makePurchase({ id: 'C001', product: 'Furadeira Bosch', quantityPurchased: 1, unitCost: 100 }),
      [makeSale({ id: 'V900', batchId: 'C001', quantitySold: 1 })],
      settings,
      [],
    );
    const a = gerarAlertas(
      [anuncio({ price: 1, availableQuantity: 0 })], vinculos, [], [vazio], settings, HOJE,
    );

    expect(a.map(x => x.tipo)).toContain('ativo_sem_estoque');
    expect(a.map(x => x.tipo)).not.toContain('preco_abaixo_do_minimo');
  });

  it('anuncio pausado nao acusa — nao ha venda para proteger', () => {
    const a = gerarAlertas([anuncio({ price: 1, status: 'paused' })], vinculos, [], [lote()], settings, HOJE);
    expect(a.map(x => x.tipo)).not.toContain('preco_abaixo_do_minimo');
  });

  it('suprime `margem_baixa` do mesmo anuncio: duas linhas para um problema so', () => {
    const ruim = venda({ feePercentage: 0.5, sellerShipping: 40 });
    const a = gerarAlertas([anuncio({ price: 120 })], vinculos, [ruim], [lote()], settings, HOJE);

    expect(a.map(x => x.tipo)).toContain('preco_abaixo_do_minimo');
    expect(a.map(x => x.tipo)).not.toContain('margem_baixa');
  });
});
