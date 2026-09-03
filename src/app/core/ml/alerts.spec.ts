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
    // Comissao alta o bastante para a margem ficar abaixo de 10%.
    const ruim = venda({ feePercentage: 0.5, sellerShipping: 40 });
    const a = gerarAlertas([anuncio()], vinculos, [ruim], [lote()], settings, HOJE);
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
