/**
 * O razão avançando sem o navegador aberto.
 *
 * O que se prova aqui não é "grava venda" — o motor que decide o que gravar é o
 * mesmo do app, já coberto pelos testes dele, e é importado em vez de copiado
 * justamente para não precisar ser testado duas vezes.
 *
 * O que é novo, e só existe no servidor, são quatro coisas:
 *   1. a RECUSA no schema 1 — numa base não migrada este módulo é inerte;
 *   2. a recusa quando o dono desligou o auto-aplicar;
 *   3. `create` em vez de `set` — o servidor não sobrescreve venda do navegador;
 *   4. o replanejamento quando o navegador grava no meio da rodada.
 *
 * Metade dos testes aqui verifica que NADA foi escrito. É o ponto: este módulo
 * roda sem ninguém olhando, e escrever de menos custa uma rodada, enquanto
 * escrever de mais custa um número errado de dinheiro.
 */
const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
jest.mock('firebase-functions/v2', () => ({ logger }));

/** Erro do Firestore quando `create` acha o documento ocupado. */
class JaExiste extends Error {
  readonly code = 6;
  constructor() {
    super('ALREADY_EXISTS');
  }
}

type Doc = Record<string, unknown>;

/** Firestore de mentira: mapa de caminho → documento, com `create` de verdade. */
class Banco {
  docs = new Map<string, Doc>();
  /** Executado uma vez, no primeiro `commit`, para simular corrida. */
  aoGravar?: () => void;

  private valorEm(dados: Doc, caminho: string): unknown {
    return caminho.split('.').reduce<unknown>(
      (acc, parte) => (acc as Doc | undefined)?.[parte],
      dados,
    );
  }

  doc(path: string) {
    const eu = this;
    return {
      path,
      get: async () => ({
        exists: eu.docs.has(path),
        data: () => eu.docs.get(path),
        get: (campo: string) => eu.valorEm(eu.docs.get(path) ?? {}, campo),
      }),
    };
  }

  collection(path: string) {
    const eu = this;
    const filhos = () =>
      [...eu.docs.entries()]
        .filter(([k]) => k.startsWith(`${path}/`) && !k.slice(path.length + 1).includes('/'))
        .map(([, v]) => v);

    const resultado = (lista: Doc[]) => ({ docs: lista.map((d) => ({ data: () => d })) });

    return {
      get: async () => resultado(filhos()),
      where: (campo: string, _op: string, valor: unknown) => ({
        get: async () => resultado(filhos().filter((d) => d[campo] === valor)),
      }),
    };
  }

  batch() {
    const eu = this;
    const ops: { path: string; dados: Doc; modo: 'create' | 'set'; merge: boolean }[] = [];
    return {
      create: (ref: { path: string }, dados: Doc) =>
        ops.push({ path: ref.path, dados, modo: 'create', merge: false }),
      set: (ref: { path: string }, dados: Doc, opcoes?: { merge?: boolean }) =>
        ops.push({ path: ref.path, dados, modo: 'set', merge: !!opcoes?.merge }),
      commit: async () => {
        if (eu.aoGravar) {
          const f = eu.aoGravar;
          eu.aoGravar = undefined;
          f();
        }
        // Atômico: valida tudo antes de escrever qualquer coisa.
        for (const op of ops) {
          if (op.modo === 'create' && eu.docs.has(op.path)) throw new JaExiste();
        }
        for (const op of ops) {
          eu.docs.set(op.path, op.merge ? { ...(eu.docs.get(op.path) ?? {}), ...op.dados } : op.dados);
        }
      },
    };
  }
}

let banco = new Banco();

jest.mock('firebase-admin/firestore', () => ({
  getFirestore: () => banco,
  Timestamp: { now: () => ({ __ts: true }) },
}));

import { aplicarNoRazao } from './apply';

const UID = 'u1';

function main(schema: number, extras: Doc = {}): Doc {
  return {
    metadata: { versao: '1', schema },
    settings: { defaultMlFee: 0.12, yellowAlertDays: 30, redAlertDays: 60, ...extras },
  };
}

function lote(id: string, quantidade: number, produto = 'Fone XYZ'): Doc {
  return {
    id,
    product: produto,
    supplier: 'F',
    category: 'C',
    quantityPurchased: quantidade,
    unitCost: 10,
    purchaseShipping: 0,
    otherCosts: 0,
    purchaseDate: '2026-01-10',
    receiptDate: '2026-01-15',
    notes: '',
  };
}

function itemDaCaixa(externalId: string, quantidade: number, produto = 'Fone XYZ'): Doc {
  return {
    externalId,
    mlOrderId: externalId.split(':')[0],
    mlItemId: 'MLB1',
    produto,
    product: produto,
    vinculado: true,
    quantitySold: quantidade,
    unitPrice: 50,
    saleDate: '2026-03-01',
    feePercentage: 0.13,
    shippingType: 'correios',
    sellerShipping: 0,
    discount: 0,
    status: 'Concluída',
    notes: '',
    estado: 'pendente',
  };
}

function baseMigrada(): void {
  banco = new Banco();
  banco.docs.set(`users/${UID}/db/main`, main(2));
  banco.docs.set(`users/${UID}/purchases/C001`, lote('C001', 10));
}

const vendas = () =>
  [...banco.docs.entries()].filter(([k]) => k.startsWith(`users/${UID}/sales/`));

beforeEach(() => {
  jest.clearAllMocks();
  baseMigrada();
});

describe('a trava do schema', () => {
  it('base no schema 1 não é tocada — nem lida, nem escrita', async () => {
    banco.docs.set(`users/${UID}/db/main`, main(1));
    banco.docs.set(`users/${UID}/mlInbox/1:MLB1`, itemDaCaixa('1:MLB1', 1));

    const r = await aplicarNoRazao(UID);

    expect(r).toMatchObject({ rodou: false, motivo: 'schema_antigo' });
    expect(vendas()).toHaveLength(0);
  });

  it('documento sem marca de schema conta como schema 1', async () => {
    banco.docs.set(`users/${UID}/db/main`, { metadata: { versao: '1' }, settings: {} });
    banco.docs.set(`users/${UID}/mlInbox/1:MLB1`, itemDaCaixa('1:MLB1', 1));

    expect(await aplicarNoRazao(UID)).toMatchObject({ motivo: 'schema_antigo' });
    expect(vendas()).toHaveLength(0);
  });

  it('base inexistente não explode', async () => {
    banco = new Banco();
    expect(await aplicarNoRazao(UID)).toMatchObject({ rodou: false, motivo: 'schema_antigo' });
  });
});

describe('o interruptor do dono', () => {
  it('auto-aplicar desligado impede a escrita', async () => {
    banco.docs.set(`users/${UID}/db/main`, main(2, { mlAutoApply: false }));
    banco.docs.set(`users/${UID}/mlInbox/1:MLB1`, itemDaCaixa('1:MLB1', 1));

    expect(await aplicarNoRazao(UID)).toMatchObject({ rodou: false, motivo: 'desligado' });
    expect(vendas()).toHaveLength(0);
  });

  it('ausente vale por ligado — é o padrão do app', async () => {
    banco.docs.set(`users/${UID}/mlInbox/1:MLB1`, itemDaCaixa('1:MLB1', 1));
    expect(await aplicarNoRazao(UID)).toMatchObject({ vendas: 1 });
  });
});

describe('o lançamento', () => {
  it('grava a venda e tira o item da fila', async () => {
    banco.docs.set(`users/${UID}/mlInbox/1:MLB1`, itemDaCaixa('1:MLB1', 2));

    const r = await aplicarNoRazao(UID);

    expect(r).toMatchObject({ rodou: true, vendas: 1 });
    const [[caminho, venda]] = vendas();
    expect(caminho).toBe(`users/${UID}/sales/V001`);
    expect(venda).toMatchObject({
      id: 'V001',
      batchId: 'C001',
      quantitySold: 2,
      source: 'mercadolivre',
      externalId: '1:MLB1',
    });
    expect(banco.docs.get(`users/${UID}/mlInbox/1:MLB1`)).toMatchObject({ estado: 'aplicado' });
  });

  it('numera a partir do que já existe no razão', async () => {
    banco.docs.set(`users/${UID}/sales/V007`, {
      id: 'V007', batchId: 'C001', product: 'Outro', quantitySold: 1, unitPrice: 1,
      saleDate: '2026-02-01', channel: 'Loja', feePercentage: 0, shippingType: 'correios',
      sellerShipping: 0, discount: 0, otherCosts: 0, status: 'Concluída', notes: '',
    });
    banco.docs.set(`users/${UID}/mlInbox/1:MLB1`, itemDaCaixa('1:MLB1', 1));

    await aplicarNoRazao(UID);

    expect(banco.docs.has(`users/${UID}/sales/V008`)).toBe(true);
  });

  it('item sem vínculo espera decisão, não entra', async () => {
    banco.docs.set(`users/${UID}/mlInbox/1:MLB1`, {
      ...itemDaCaixa('1:MLB1', 1),
      vinculado: false,
    });

    const r = await aplicarNoRazao(UID);

    expect(r).toMatchObject({ vendas: 0, pendentes: 1 });
    expect(vendas()).toHaveLength(0);
  });

  it('sem estoque no lote, espera — não inventa unidade', async () => {
    banco.docs.set(`users/${UID}/mlInbox/1:MLB1`, itemDaCaixa('1:MLB1', 99));

    const r = await aplicarNoRazao(UID);

    expect(r).toMatchObject({ vendas: 0, pendentes: 1 });
    expect(vendas()).toHaveLength(0);
  });

  it('o que parece duplicata do histórico NÃO entra sozinho', async () => {
    /* Mesma data, mesmo valor, mesmo produto: foi digitado à mão antes do
       backfill. Lançar de novo duplicaria faturamento e teto do MEI. */
    banco.docs.set(`users/${UID}/sales/V001`, {
      id: 'V001', batchId: 'C001', product: 'Fone XYZ', quantitySold: 1, unitPrice: 50,
      saleDate: '2026-03-01', channel: 'Mercado Livre', feePercentage: 0.13,
      shippingType: 'correios', sellerShipping: 0, discount: 0, otherCosts: 0,
      status: 'Concluída', notes: '',
    });
    banco.docs.set(`users/${UID}/mlInbox/1:MLB1`, itemDaCaixa('1:MLB1', 1));

    await aplicarNoRazao(UID);

    expect(vendas()).toHaveLength(1);
    expect(banco.docs.get(`users/${UID}/mlInbox/1:MLB1`)).toMatchObject({ estado: 'pendente' });
  });

  it('roda de novo sem duplicar: o externalId já está no razão', async () => {
    banco.docs.set(`users/${UID}/mlInbox/1:MLB1`, itemDaCaixa('1:MLB1', 1));
    await aplicarNoRazao(UID);
    banco.docs.set(`users/${UID}/mlInbox/1:MLB1`, itemDaCaixa('1:MLB1', 1));

    await aplicarNoRazao(UID);

    expect(vendas()).toHaveLength(1);
  });

  it('caixa vazia não escreve nada', async () => {
    expect(await aplicarNoRazao(UID)).toMatchObject({ rodou: true, motivo: 'nada_a_fazer' });
    expect(vendas()).toHaveLength(0);
  });
});

describe('a corrida com o navegador', () => {
  it('não sobrescreve venda que o navegador gravou com o mesmo número', async () => {
    banco.docs.set(`users/${UID}/mlInbox/1:MLB1`, itemDaCaixa('1:MLB1', 1));

    /* O formulário estava aberto com V001 desde antes; salva no instante em
       que o servidor ia gravar. O `create` recusa, a rodada replaneja. */
    banco.aoGravar = () => {
      banco.docs.set(`users/${UID}/sales/V001`, {
        id: 'V001', batchId: 'C001', product: 'Digitada à mão', quantitySold: 1,
        unitPrice: 33, saleDate: '2026-03-05', channel: 'Loja', feePercentage: 0,
        shippingType: 'correios', sellerShipping: 0, discount: 0, otherCosts: 0,
        status: 'Concluída', notes: '',
      });
    };

    const r = await aplicarNoRazao(UID);

    // A venda do navegador continua intacta...
    expect(banco.docs.get(`users/${UID}/sales/V001`)).toMatchObject({
      product: 'Digitada à mão',
      unitPrice: 33,
    });
    // ...e a do Mercado Livre entrou com o próximo número.
    expect(r).toMatchObject({ vendas: 1 });
    expect(banco.docs.get(`users/${UID}/sales/V002`)).toMatchObject({ externalId: '1:MLB1' });
  });

  it('choque em todas as tentativas desiste sem perder o pedido', async () => {
    banco.docs.set(`users/${UID}/mlInbox/1:MLB1`, itemDaCaixa('1:MLB1', 1));

    // Um escritor teimoso: ocupa o número seguinte antes de cada gravação.
    let n = 1;
    const ocupar = () => {
      banco.docs.set(`users/${UID}/sales/V${String(n).padStart(3, '0')}`, { id: `V${n}` });
      n++;
      banco.aoGravar = ocupar;
    };
    banco.aoGravar = ocupar;

    const r = await aplicarNoRazao(UID);

    expect(r).toMatchObject({ rodou: true, motivo: 'choque', vendas: 0 });
    // O pedido não se perdeu: continua pendente para a próxima rodada.
    expect(banco.docs.get(`users/${UID}/mlInbox/1:MLB1`)).toMatchObject({ estado: 'pendente' });
  });
});

describe('devoluções', () => {
  function devolucao(claimId: string, externalIdVenda: string, extras: Doc = {}): Doc {
    return {
      claimId,
      externalIdVenda,
      mlOrderId: externalIdVenda.split(':')[0],
      mlItemId: 'MLB1',
      requestDate: '2026-03-10',
      returnShipping: 0,
      destination: 'Estoque',
      reason: 'Outro',
      estado: 'pendente',
      ...extras,
    };
  }

  it('entra junto com a venda que ela devolve, na mesma rodada', async () => {
    banco.docs.set(`users/${UID}/mlInbox/1:MLB1`, itemDaCaixa('1:MLB1', 1));
    banco.docs.set(`users/${UID}/mlReturns/c1`, devolucao('c1', '1:MLB1'));

    const r = await aplicarNoRazao(UID);

    expect(r).toMatchObject({ vendas: 1, devolucoes: 1 });
    expect(banco.docs.get(`users/${UID}/returns/D001`)).toMatchObject({ saleId: 'V001' });
  });

  it('devolução sem venda no razão espera — não cria órfã', async () => {
    banco.docs.set(`users/${UID}/mlReturns/c1`, devolucao('c1', '9:MLB9'));

    const r = await aplicarNoRazao(UID);

    expect(r).toMatchObject({ devolucoes: 0, pendentes: 1 });
    expect(banco.docs.has(`users/${UID}/returns/D001`)).toBe(false);
  });

  it('devolução finalizada da venda inteira marca a venda como Devolvida', async () => {
    banco.docs.set(`users/${UID}/mlInbox/1:MLB1`, itemDaCaixa('1:MLB1', 1));
    banco.docs.set(
      `users/${UID}/mlReturns/c1`,
      devolucao('c1', '1:MLB1', { arrivalDate: '2026-03-15' }),
    );

    await aplicarNoRazao(UID);

    expect(banco.docs.get(`users/${UID}/sales/V001`)).toMatchObject({ status: 'Devolvida' });
  });

  it('devolução parcial NÃO marca a venda como devolvida', async () => {
    banco.docs.set(`users/${UID}/mlInbox/1:MLB1`, itemDaCaixa('1:MLB1', 3));
    banco.docs.set(
      `users/${UID}/mlReturns/c1`,
      devolucao('c1', '1:MLB1', { arrivalDate: '2026-03-15', quantity: 1 }),
    );

    await aplicarNoRazao(UID);

    expect(banco.docs.get(`users/${UID}/sales/V001`)).toMatchObject({ status: 'Concluída' });
    expect(banco.docs.get(`users/${UID}/returns/D001`)).toMatchObject({ quantity: 1 });
  });

  it('venda cancelada pelo dono não é reescrita pelo servidor', async () => {
    /* 'Cancelada' e 'Em disputa' são escolha do dono. O servidor alterna
       apenas o par Concluída ↔ Devolvida — mesma regra do app. */
    banco.docs.set(`users/${UID}/sales/V001`, {
      id: 'V001', batchId: 'C001', product: 'Fone XYZ', quantitySold: 1, unitPrice: 50,
      saleDate: '2026-03-01', channel: 'Mercado Livre', feePercentage: 0.13,
      shippingType: 'correios', sellerShipping: 0, discount: 0, otherCosts: 0,
      status: 'Cancelada', notes: '', source: 'mercadolivre', externalId: '1:MLB1',
      mlOrderId: '1', mlItemId: 'MLB1',
    });
    banco.docs.set(
      `users/${UID}/mlReturns/c1`,
      devolucao('c1', '1:MLB1', { arrivalDate: '2026-03-15' }),
    );

    await aplicarNoRazao(UID);

    expect(banco.docs.get(`users/${UID}/sales/V001`)).toMatchObject({ status: 'Cancelada' });
  });
});
