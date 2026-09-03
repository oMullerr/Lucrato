/**
 * Casamento anúncio ↔ produto.
 *
 * Este módulo é compartilhado com as Cloud Functions: a chave que a tela mostra
 * é a mesma que o servidor grava. Por isso os casos aqui travam o formato da
 * chave, não só o comportamento da sugestão.
 */
import {
  LIMIAR_SUGESTAO,
  normalizarChaveProduto,
  similaridade,
  sugerirProduto,
} from './matching';

describe('chave do produto', () => {
  it('tira acento, caixa e pontuacao', () => {
    expect(normalizarChaveProduto('Escova Elétrica Oral-B iO2')).toBe('escova eletrica oral b io2');
  });

  it('colapsa espacos e apara as pontas', () => {
    expect(normalizarChaveProduto('  Fone   Bluetooth  ')).toBe('fone bluetooth');
  });

  it('trata cedilha e til', () => {
    expect(normalizarChaveProduto('Ração Cão Nutrição')).toBe('racao cao nutricao');
  });

  it('sobrevive a texto vazio', () => {
    expect(normalizarChaveProduto('')).toBe('');
    expect(normalizarChaveProduto(undefined as unknown as string)).toBe('');
  });

  it('nomes equivalentes chegam na mesma chave', () => {
    expect(normalizarChaveProduto('Mouse Gamer RGB')).toBe(normalizarChaveProduto('mouse  gamer rgb'));
  });
});

describe('similaridade', () => {
  it('nome identico da 1', () => {
    expect(similaridade('Fone Bluetooth', 'fone bluetooth')).toBe(1);
  });

  it('nomes proximos ficam altos', () => {
    expect(similaridade('Fone Bluetooth JBL', 'Fone Bluetooth JBL Tune')).toBeGreaterThan(LIMIAR_SUGESTAO);
  });

  it('produtos diferentes ficam baixos', () => {
    expect(similaridade('Fone Bluetooth JBL', 'Cadeira Gamer')).toBeLessThan(LIMIAR_SUGESTAO);
  });

  it('vazio nao casa com nada', () => {
    expect(similaridade('', 'Fone')).toBe(0);
  });
});

describe('sugestao de produto', () => {
  const candidatos = [
    { produto: 'Fone Bluetooth JBL Tune 510', sku: 'JBL-510' },
    { produto: 'Cadeira Gamer Preta', sku: 'CAD-01' },
    { produto: 'Escova Elétrica Oral-B iO2' },
  ];

  it('SKU exato vence, mesmo com titulo diferente', () => {
    const s = sugerirProduto({ title: 'Promocao imperdivel headset', sku: 'JBL-510' }, candidatos);
    expect(s?.origem).toBe('sku');
    expect(s?.produto).toBe('Fone Bluetooth JBL Tune 510');
    expect(s?.score).toBe(1);
  });

  it('SKU compara sem depender de caixa', () => {
    expect(sugerirProduto({ title: 'x', sku: 'jbl-510' }, candidatos)?.origem).toBe('sku');
  });

  it('sem SKU, cai no titulo', () => {
    const s = sugerirProduto({ title: 'Fone Bluetooth JBL Tune 510 Preto', sku: null }, candidatos);
    expect(s?.origem).toBe('titulo');
    expect(s?.produto).toBe('Fone Bluetooth JBL Tune 510');
  });

  it('nao sugere nada quando ninguem passa do limiar', () => {
    expect(sugerirProduto({ title: 'Pneu aro 15', sku: null }, candidatos)).toBeNull();
  });

  it('SKU que nao existe nos lotes cai para o titulo', () => {
    const s = sugerirProduto({ title: 'Cadeira Gamer Preta', sku: 'NAO-EXISTE' }, candidatos);
    expect(s?.origem).toBe('titulo');
    expect(s?.produto).toBe('Cadeira Gamer Preta');
  });

  it('devolve a chave normalizada, pronta para gravar', () => {
    const s = sugerirProduto({ title: 'Escova Elétrica Oral-B iO2', sku: null }, candidatos);
    expect(s?.productKey).toBe('escova eletrica oral b io2');
  });

  it('sem candidatos, nao inventa vinculo', () => {
    expect(sugerirProduto({ title: 'Qualquer coisa', sku: 'X' }, [])).toBeNull();
  });
});
