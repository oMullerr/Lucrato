/**
 * Conciliação do backfill contra as vendas digitadas à mão.
 *
 * O risco aqui é assimétrico: deixar passar uma duplicata infla faturamento,
 * estoque e teto do MEI; marcar como duplicata algo que não é apenas pede uma
 * decisão sua. Por isso os casos de borda puxam para "conflitante", não para
 * "nova".
 */
import { adotarNumerosDoMl, classificarCaixa, classificarItem } from './reconcile';
import type { ItemDaCaixa } from './inbox-apply';
import type { Sale } from '../models/models';
import { makeSale } from '../../../testing/fixtures';

function item(over: Partial<ItemDaCaixa> = {}): ItemDaCaixa {
  return {
    externalId: '2000017682273464:MLB1',
    mlOrderId: '2000017682273464',
    mlItemId: 'MLB1',
    produto: 'Furadeira Bosch GSB 13 RE',
    vinculado: true,
    quantitySold: 1,
    unitPrice: 300,
    saleDate: '2026-08-10',
    feePercentage: 0.14,
    shippingType: 'correios',
    sellerShipping: 27.05,
    discount: 0,
    status: 'Concluída',
    notes: 'Mercado Livre · pedido 2000017682273464',
    estado: 'pendente',
    ...over,
  };
}

function manual(over: Partial<Sale> = {}): Sale {
  return makeSale({
    id: 'V001',
    batchId: 'C001',
    product: 'Furadeira Bosch GSB 13 RE',
    quantitySold: 1,
    unitPrice: 300,
    saleDate: '2026-08-10',
    ...over,
  });
}

describe('venda nova', () => {
  it('razao vazio: tudo e novo', () => {
    expect(classificarItem(item(), []).veredito).toBe('nova');
  });

  it('venda distante no tempo nao e candidata', () => {
    expect(classificarItem(item(), [manual({ saleDate: '2026-07-01' })]).veredito).toBe('nova');
  });

  it('so a data batendo nao basta', () => {
    const outra = manual({ product: 'Cadeira Gamer', unitPrice: 999 });
    expect(classificarItem(item(), [outra]).veredito).toBe('nova');
  });

  it('venda ja vinda da integracao nao vira candidata', () => {
    const doMl = { ...manual(), externalId: 'outro:MLB9' };
    expect(classificarItem(item(), [doMl]).veredito).toBe('nova');
  });

  it('venda cancelada nao vira candidata', () => {
    expect(classificarItem(item(), [manual({ status: 'Cancelada' })]).veredito).toBe('nova');
  });
});

describe('duplicada', () => {
  it('data, valor e produto batendo', () => {
    const c = classificarItem(item(), [manual()]);
    expect(c.veredito).toBe('duplicada');
    expect(c.candidata?.indicios.sort()).toEqual(['data', 'produto', 'valor']);
  });

  it('tolera diferenca de ate tres dias', () => {
    expect(classificarItem(item(), [manual({ saleDate: '2026-08-13' })]).veredito).toBe('duplicada');
  });

  it('quatro dias ja e longe demais', () => {
    expect(classificarItem(item(), [manual({ saleDate: '2026-08-14' })]).veredito).toBe('nova');
  });

  it('tolera centavos de diferenca no valor', () => {
    expect(classificarItem(item(), [manual({ unitPrice: 300.5 })]).veredito).toBe('duplicada');
  });

  it('casa mesmo com o nome escrito diferente', () => {
    const c = classificarItem(item(), [manual({ product: 'furadeira bosch gsb 13re' })]);
    expect(c.veredito).toBe('duplicada');
  });

  it('compara o valor total, nao o unitario', () => {
    const c = classificarItem(
      item({ quantitySold: 2, unitPrice: 150 }),
      [manual({ quantitySold: 1, unitPrice: 300 })],
    );
    expect(c.candidata?.indicios).toContain('valor');
  });
});

describe('conflitante', () => {
  it('mesma data e valor, produto diferente', () => {
    const c = classificarItem(item(), [manual({ product: 'Serra Circular Makita' })]);
    expect(c.veredito).toBe('conflitante');
    expect(c.candidata?.indicios.sort()).toEqual(['data', 'valor']);
  });

  it('mesma data e produto, valor diferente', () => {
    const c = classificarItem(item(), [manual({ unitPrice: 450 })]);
    expect(c.veredito).toBe('conflitante');
    expect(c.candidata?.indicios.sort()).toEqual(['data', 'produto']);
  });

  it('escolhe a candidata com mais indicios', () => {
    const c = classificarItem(item(), [
      manual({ id: 'V001', product: 'Serra Circular Makita' }),
      manual({ id: 'V002' }),
    ]);
    expect(c.veredito).toBe('duplicada');
    expect(c.candidata?.venda.id).toBe('V002');
  });
});

describe('dois pedidos disputando a mesma venda', () => {
  /**
   * Caso real da base: mesmo produto, mesmo preço, dias seguidos — duas vendas
   * de verdade, lançadas à mão uma vez só. Se as duas virassem "duplicada", a
   * adoção em lote gravaria a segunda por cima da primeira e uma venda real
   * sumiria do razão, sem aviso.
   */
  const doisPedidos = () => [
    item({ externalId: 'A', mlOrderId: '2000016946339484', saleDate: '2026-08-10' }),
    item({ externalId: 'B', mlOrderId: '2000016966075374', saleDate: '2026-08-11' }),
  ];

  it('nenhum dos dois fica como duplicada', () => {
    const mapa = classificarCaixa(doisPedidos(), [manual()]);
    expect(mapa.get('A')!.veredito).toBe('conflitante');
    expect(mapa.get('B')!.veredito).toBe('conflitante');
  });

  it('a venda candidata continua sendo mostrada, para você decidir', () => {
    // Rebaixar o veredito não pode custar o contexto: sem a candidata, a tela
    // não teria o que comparar lado a lado.
    const mapa = classificarCaixa(doisPedidos(), [manual()]);
    expect(mapa.get('A')!.candidata?.venda.id).toBe('V001');
  });

  it('um pedido sozinho continua duplicada', () => {
    const mapa = classificarCaixa([item({ externalId: 'A' })], [manual()]);
    expect(mapa.get('A')!.veredito).toBe('duplicada');
  });

  it('pedidos de produtos diferentes seguem duplicadas', () => {
    const vendas = [manual({ id: 'V001' }), manual({ id: 'V002', product: 'Pneu aro 15', unitPrice: 900 })];
    const mapa = classificarCaixa(
      [item({ externalId: 'A' }), item({ externalId: 'B', produto: 'Pneu aro 15', unitPrice: 900 })],
      vendas,
    );
    expect(mapa.get('A')!.veredito).toBe('duplicada');
    expect(mapa.get('B')!.veredito).toBe('duplicada');
  });

  it('duas vendas iguais e dois pedidos: os dois pedem conferência', () => {
    // Limitação conhecida e deliberada: a escolha do candidato é feita item a
    // item, sem repartir vendas empatadas entre eles. Com duas vendas idênticas,
    // os dois pedidos elegem a mesma e caem em conflitante.
    //
    // Isso erra para o lado seguro — pede uma decisão em vez de arriscar
    // sobrescrever. Repartir automaticamente exigiria um pareamento global, e
    // seria adivinhar qual pedido é qual venda quando os dois são iguais.
    const vendas = [manual({ id: 'V001' }), manual({ id: 'V002', saleDate: '2026-08-11' })];
    const mapa = classificarCaixa(doisPedidos(), vendas);
    expect(mapa.get('A')!.veredito).toBe('conflitante');
    expect(mapa.get('B')!.veredito).toBe('conflitante');
  });

  it('cada venda pode ser adotada uma vez só, mesmo em lote', () => {
    // A garantia que interessa: o conjunto de duplicadas nunca tem duas
    // apontando para o mesmo lugar.
    const mapa = classificarCaixa(doisPedidos(), [manual()]);
    const alvos = [...mapa.values()]
      .filter(c => c.veredito === 'duplicada')
      .map(c => c.candidata!.venda.id);
    expect(new Set(alvos).size).toBe(alvos.length);
  });
});

describe('caixa inteira', () => {
  it('classifica cada item pela sua chave', () => {
    const mapa = classificarCaixa(
      [item({ externalId: 'A' }), item({ externalId: 'B', produto: 'Pneu aro 15', unitPrice: 900 })],
      [manual()],
    );
    expect(mapa.get('A')?.veredito).toBe('duplicada');
    expect(mapa.get('B')?.veredito).toBe('nova');
  });
});

describe('adotar os numeros do Mercado Livre', () => {
  const original = manual({ notes: 'anotacao minha', feePercentage: 0.12, sellerShipping: 0 });

  it('corrige comissao e frete com os valores reais', () => {
    const corrigida = adotarNumerosDoMl(original, item());
    expect(corrigida.feePercentage).toBeCloseTo(0.14, 10);
    expect(corrigida.sellerShipping).toBeCloseTo(27.05, 2);
  });

  it('preserva id, lote e observacoes', () => {
    const corrigida = adotarNumerosDoMl(original, item());
    expect(corrigida.id).toBe('V001');
    expect(corrigida.batchId).toBe('C001');
    expect(corrigida.notes).toBe('anotacao minha');
  });

  it('carimba a origem para nunca mais virar duplicata', () => {
    const corrigida = adotarNumerosDoMl(original, item());
    expect(corrigida.source).toBe('mercadolivre');
    expect(corrigida.externalId).toBe('2000017682273464:MLB1');
    expect(classificarItem(item(), [corrigida]).veredito).toBe('nova');
  });
});
