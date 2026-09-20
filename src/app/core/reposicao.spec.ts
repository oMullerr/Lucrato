/**
 * Reposição sugerida.
 *
 * O que se prova aqui é tanto o que ENTRA na lista quanto o que fica fora.
 * Uma pauta de compra que inclui o que está tranquilo deixa de ser pauta e
 * vira relatório — e relatório ninguém lê todo dia.
 *
 * O prazo do fornecedor é medido do próprio histórico (compra → recebimento),
 * por mediana: uma entrega que atrasou dois meses não pode virar o prazo
 * normal de quem entrega em cinco dias.
 */
import {
  COBERTURA_ALVO_DIAS, PRAZO_PADRAO_DIAS, prazoDoFornecedor, sugerirReposicao,
} from './reposicao';
import { calculatePurchase, calculateSale } from './services/calculations';
import type { ComputedPurchase, ComputedSale, Purchase, Sale, Settings } from './models/models';
import { makePurchase, makeSale } from '../../testing/fixtures';

const HOJE = new Date('2026-09-20T12:00:00Z');
const config = { yellowAlertDays: 25, redAlertDays: 30 } as unknown as Settings;

/** Lote e venda passam pelo MESMO motor do app — estoque aqui é derivado. */
function cenario(lotes: Partial<Purchase>[], vendas: Partial<Sale>[]): {
  lotes: ComputedPurchase[];
  vendas: ComputedSale[];
} {
  const ps: Purchase[] = lotes.map(makePurchase);
  const vs: Sale[] = vendas.map(makeSale);
  return {
    lotes: ps.map(p => calculatePurchase(p, vs, config, [])),
    vendas: vs.map(v => calculateSale(v, ps, [])),
  };
}

/** 90 vendas de 1 unidade em 90 dias ⇒ 1 unidade/dia, sem arredondamento. */
function vendaDiaria(produto: string, batchId: string, dias: number): Partial<Sale>[] {
  return Array.from({ length: dias }, (_, i) => {
    const d = new Date(HOJE);
    d.setDate(d.getDate() - i);
    return {
      id: `V${produto}${i}`,
      batchId,
      product: produto,
      quantitySold: 1,
      saleDate: d.toISOString().slice(0, 10),
    };
  });
}

describe('prazo do fornecedor', () => {
  it('sai do histórico: mediana entre compra e recebimento', () => {
    const { lotes } = cenario([
      { id: 'C001', supplier: 'Acme', purchaseDate: '2026-01-01', receiptDate: '2026-01-06' },
      { id: 'C002', supplier: 'Acme', purchaseDate: '2026-02-01', receiptDate: '2026-02-11' },
      { id: 'C003', supplier: 'Acme', purchaseDate: '2026-03-01', receiptDate: '2026-03-08' },
    ], []);

    expect(prazoDoFornecedor(lotes, 'Acme')).toBe(7);
  });

  it('mediana e não média — um atraso monstro não vira o prazo normal', () => {
    const { lotes } = cenario([
      { id: 'C001', supplier: 'Acme', purchaseDate: '2026-01-01', receiptDate: '2026-01-06' },
      { id: 'C002', supplier: 'Acme', purchaseDate: '2026-02-01', receiptDate: '2026-02-06' },
      { id: 'C003', supplier: 'Acme', purchaseDate: '2026-03-01', receiptDate: '2026-06-01' },
    ], []);

    expect(prazoDoFornecedor(lotes, 'Acme')).toBe(5); // a média seria ~34
  });

  it('lote em trânsito não tem prazo fechado e fica de fora', () => {
    const { lotes } = cenario([
      { id: 'C001', supplier: 'Acme', purchaseDate: '2026-01-01', receiptDate: '2026-01-04' },
      { id: 'C002', supplier: 'Acme', purchaseDate: '2026-02-01', receiptDate: undefined },
    ], []);

    expect(prazoDoFornecedor(lotes, 'Acme')).toBe(3);
  });

  it('recebimento ANTES da compra é erro de digitação e não entra', () => {
    // Um prazo negativo contaminaria a mediana e sugeriria comprar tarde.
    const { lotes } = cenario([
      { id: 'C001', supplier: 'Acme', purchaseDate: '2026-01-10', receiptDate: '2026-01-01' },
      { id: 'C002', supplier: 'Acme', purchaseDate: '2026-02-01', receiptDate: '2026-02-09' },
    ], []);

    expect(prazoDoFornecedor(lotes, 'Acme')).toBe(8);
  });

  it('fornecedor sem recebimento nenhum devolve null', () => {
    const { lotes } = cenario([
      { id: 'C001', supplier: 'Acme', purchaseDate: '2026-01-01', receiptDate: '2026-01-05' },
    ], []);

    expect(prazoDoFornecedor(lotes, 'Outro')).toBeNull();
  });
});

describe('o que entra na pauta', () => {
  it('produto vendendo com estoque curto entra, com quantidade e prazo', () => {
    const { lotes, vendas } = cenario(
      [{ id: 'C001', product: 'Fone', supplier: 'Acme', quantityPurchased: 100,
         purchaseDate: '2026-06-01', receiptDate: '2026-06-06' }],
      vendaDiaria('Fone', 'C001', 90),
    );

    const [s] = sugerirReposicao(lotes, vendas, 90, HOJE);

    expect(s.produto).toBe('Fone');
    expect(s.fornecedor).toBe('Acme');
    expect(s.velocidadeDiaria).toBeCloseTo(1, 10);
    expect(s.estoque).toBe(10);          // 100 comprados − 90 vendidos
    expect(s.coberturaDias).toBeCloseTo(10, 10);
    expect(s.prazoDias).toBe(5);
    expect(s.prazoMedido).toBe(true);
    expect(s.diasParaPedir).toBe(5);     // cobre 10 dias, o fornecedor leva 5
    // Alvo: 1/dia × (5 de prazo + 30 de cobertura) = 35; já há 10.
    expect(s.quantidade).toBe(COBERTURA_ALVO_DIAS - 5);
    expect(s.base).toEqual({ dias: 90, unidades: 90, vendas: 90 });
  });

  it('sem recebimento no histórico, usa o prazo padrão e avisa', () => {
    const { lotes, vendas } = cenario(
      [{ id: 'C001', product: 'Fone', supplier: 'Acme', quantityPurchased: 100,
         purchaseDate: '2026-06-01', receiptDate: undefined }],
      vendaDiaria('Fone', 'C001', 90),
    );

    const [s] = sugerirReposicao(lotes, vendas, 90, HOJE);

    expect(s.prazoDias).toBe(PRAZO_PADRAO_DIAS);
    expect(s.prazoMedido).toBe(false);
  });

  it('usa o fornecedor do lote MAIS RECENTE — é dele que você compraria', () => {
    const metade = vendaDiaria('Fone', 'C001', 90);
    const { lotes, vendas } = cenario([
      { id: 'C001', product: 'Fone', supplier: 'Antigo', quantityPurchased: 50,
        purchaseDate: '2026-01-01', receiptDate: '2026-02-20' },
      { id: 'C002', product: 'Fone', supplier: 'Novo', quantityPurchased: 50,
        purchaseDate: '2026-06-01', receiptDate: '2026-06-04' },
    ], metade.map((v, i) => (i < 45 ? v : { ...v, batchId: 'C002' })));

    const [s] = sugerirReposicao(lotes, vendas, 90, HOJE);

    expect(s.fornecedor).toBe('Novo');
    expect(s.prazoDias).toBe(3);
  });
});

describe('o que NÃO entra', () => {
  it('produto sem venda na janela fica fora — sem ritmo, a sugestão seria chute', () => {
    /* Encalhado não precisa de reposição: precisa de decisão sobre o que já
       está parado, que é outra tela. */
    const { lotes, vendas } = cenario(
      [{ id: 'C001', product: 'Encalhado', quantityPurchased: 50 }],
      [{ id: 'V001', batchId: 'C001', product: 'Encalhado', saleDate: '2025-01-01' }],
    );

    expect(sugerirReposicao(lotes, vendas, 90, HOJE)).toEqual([]);
  });

  it('estoque folgado fica fora — pauta com tudo deixa de ser pauta', () => {
    const { lotes, vendas } = cenario(
      [{ id: 'C001', product: 'Fone', supplier: 'Acme', quantityPurchased: 500,
         purchaseDate: '2026-06-01', receiptDate: '2026-06-06' }],
      vendaDiaria('Fone', 'C001', 90),
    );

    // Sobram 410 unidades a 1/dia: 410 dias de cobertura.
    expect(sugerirReposicao(lotes, vendas, 90, HOJE)).toEqual([]);
  });

  it('venda cancelada não conta como demanda', () => {
    const { lotes, vendas } = cenario(
      [{ id: 'C001', product: 'Fone', quantityPurchased: 10 }],
      vendaDiaria('Fone', 'C001', 90).map(v => ({ ...v, status: 'Cancelada' as const })),
    );

    expect(sugerirReposicao(lotes, vendas, 90, HOJE)).toEqual([]);
  });

  it('janela inválida não inventa sugestão', () => {
    const { lotes, vendas } = cenario(
      [{ id: 'C001', product: 'Fone', quantityPurchased: 10 }],
      vendaDiaria('Fone', 'C001', 90),
    );

    expect(sugerirReposicao(lotes, vendas, 0, HOJE)).toEqual([]);
  });
});

describe('urgência e ordem', () => {
  it('estoque zerado com demanda é atraso, não alerta', () => {
    const { lotes, vendas } = cenario(
      [{ id: 'C001', product: 'Fone', supplier: 'Acme', quantityPurchased: 90,
         purchaseDate: '2026-06-01', receiptDate: '2026-06-06' }],
      vendaDiaria('Fone', 'C001', 90),
    );

    const [s] = sugerirReposicao(lotes, vendas, 90, HOJE);

    expect(s.estoque).toBe(0);
    expect(s.urgencia).toBe('atrasado');
    expect(s.diasParaPedir).toBeLessThan(0);
  });

  it('o mais urgente vem primeiro, e empate desempata pelo prazo restante', () => {
    const { lotes, vendas } = cenario([
      // Folgado o bastante para ser 'atencao', curto o bastante para entrar.
      { id: 'C001', product: 'Calmo', supplier: 'Acme', quantityPurchased: 125,
        purchaseDate: '2026-06-01', receiptDate: '2026-06-06' },
      // 8 em estoque a 1/dia: cobre 8 dias e o fornecedor leva 5. Restam 3.
      { id: 'C002', product: 'Urgente', supplier: 'Acme', quantityPurchased: 98,
        purchaseDate: '2026-06-01', receiptDate: '2026-06-06' },
    ], [
      ...vendaDiaria('Calmo', 'C001', 90),
      ...vendaDiaria('Urgente', 'C002', 90),
    ]);

    const lista = sugerirReposicao(lotes, vendas, 90, HOJE);

    expect(lista.map(s => s.produto)).toEqual(['Urgente', 'Calmo']);
    expect(lista[0].urgencia).toBe('critico');
    expect(lista[1].urgencia).toBe('atencao');
  });

  it('a quantidade sugerida nunca é zero nem negativa', () => {
    const { lotes, vendas } = cenario(
      [{ id: 'C001', product: 'Fone', supplier: 'Acme', quantityPurchased: 125,
         purchaseDate: '2026-06-01', receiptDate: '2026-06-06' }],
      vendaDiaria('Fone', 'C001', 90),
    );

    for (const s of sugerirReposicao(lotes, vendas, 90, HOJE)) {
      expect(s.quantidade).toBeGreaterThan(0);
    }
  });
});
