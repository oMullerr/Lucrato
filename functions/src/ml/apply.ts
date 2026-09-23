/**
 * O razão avança sem o navegador aberto.
 *
 * Até aqui, a captura rodava 24 horas por dia no servidor mas o LANÇAMENTO
 * esperava você abrir o app (`MlAutoApplyService`). A justificativa estava
 * certa enquanto o razão fosse um documento único: o app gravava os arrays
 * inteiros, então qualquer escrita do servidor seria apagada pela gravação
 * seguinte do navegador, em silêncio. Com o razão em subcoleções (schema 2)
 * cada registro é um documento, e essa objeção cai.
 *
 * TRÊS INVARIANTES, e nenhuma é negociável:
 *
 * 1. **Só roda no schema 2.** Numa base ainda não migrada este módulo não faz
 *    nada — nem lê, nem escreve, nem avisa. É o que torna a mudança inerte até
 *    você decidir migrar.
 *
 * 2. **A decisão é a MESMA do app.** Nada de regra de dinheiro nova aqui: o
 *    FIFO, a divisão entre lotes, o rateio e a classificação de duplicata vêm
 *    dos módulos puros de `src/app/core`, importados — não copiados. Duas
 *    cópias do motor de dinheiro divergiriam, e a que divergisse em silêncio
 *    seria justamente esta, que roda sem ninguém olhando.
 *
 * 3. **Criar é `create`, nunca `set`.** `create` falha se o documento já
 *    existe, então o servidor JAMAIS sobrescreve uma venda do navegador. Como
 *    o lote é atômico, um choque não grava nada: a rodada recomeça, relê o
 *    razão e replaneja. E como o plano é idempotente pelo `externalId`, o que
 *    já entrou não entra de novo.
 */
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';

import type { Purchase, Return, Sale, Settings } from '../../../src/app/core/models/models';
import { SCHEMA_SUBCOLECOES } from '../../../src/app/core/models/models';
import { calculatePurchase } from '../../../src/app/core/services/calculations';
import type { ItemDaCaixa } from '../../../src/app/core/ml/inbox-apply';
import { planejarAplicacao } from '../../../src/app/core/ml/inbox-apply';
import type { DevolucaoDoMl } from '../../../src/app/core/ml/returns-apply';
import { planejarDevolucoes } from '../../../src/app/core/ml/returns-apply';
import { classificarCaixa } from '../../../src/app/core/ml/reconcile';

const db = () => getFirestore();

/** Tentativas de replanejar quando o navegador gravou no meio da rodada. */
const MAX_TENTATIVAS = 3;

/** O Firestore aceita 500 operações por lote; sobra folga de propósito. */
const POR_LOTE = 400;

export interface ResultadoDaAplicacao {
  /** `false` quando a base ainda não migrou, ou o auto-aplicar está desligado. */
  rodou: boolean;
  vendas: number;
  devolucoes: number;
  /** Itens que continuam esperando decisão sua na caixa de entrada. */
  pendentes: number;
  motivo?: 'schema_antigo' | 'desligado' | 'nada_a_fazer' | 'choque';
}

interface Razao {
  purchases: Purchase[];
  sales: Sale[];
  returns: Return[];
  settings: Settings;
}

/**
 * `calculatePurchase` só usa a config para decidir o RÓTULO do lote (Parado,
 * Atenção, Em Estoque). O plano olha `currentStock` e datas, que não dependem
 * dela — então um default aqui não muda nenhum número, só um texto que o
 * servidor nem lê. Preenchido mesmo assim para o tipo fechar sem `as`.
 */
function configMinima(bruto: Partial<Settings> | undefined): Settings {
  return {
    defaultMlFee: bruto?.defaultMlFee ?? 0.12,
    yellowAlertDays: bruto?.yellowAlertDays ?? 30,
    redAlertDays: bruto?.redAlertDays ?? 60,
    minimumMargin: bruto?.minimumMargin ?? 0,
    lowStockAlert: bruto?.lowStockAlert ?? 0,
    defaultShipping: bruto?.defaultShipping ?? 0,
    returnWindowDays: bruto?.returnWindowDays ?? 30,
    /* Este SIM muda número: é o custo da transportadora no Flex, que entra no
       lucro. Ausente vale zero, que é o comportamento de antes da opção. */
    flexShippingCost: bruto?.flexShippingCost,
    defaultChannel: bruto?.defaultChannel ?? 'Mercado Livre',
    categories: [],
    categoryColors: {},
    suppliers: [],
    supplierColors: {},
    channels: [],
    channelColors: {},
    mlAutoApply: bruto?.mlAutoApply,
  };
}

/**
 * Lê o razão inteiro das subcoleções, ou `null` se a base não migrou.
 *
 * Ler tudo é o preço de usar exatamente o mesmo motor do app: o FIFO precisa
 * do estoque de cada lote, e estoque aqui é derivado das vendas. São três
 * leituras de coleção por rodada, e a rodada só acontece quando chegou pedido.
 */
async function lerRazao(uid: string): Promise<Razao | null> {
  const main = await db().doc(`users/${uid}/db/main`).get();
  if (!main.exists) return null;

  const schema = Number(main.get('metadata.schema') ?? 1);
  if (schema < SCHEMA_SUBCOLECOES) return null;

  const [p, s, r] = await Promise.all([
    db().collection(`users/${uid}/purchases`).get(),
    db().collection(`users/${uid}/sales`).get(),
    db().collection(`users/${uid}/returns`).get(),
  ]);

  return {
    purchases: p.docs.map((d) => d.data() as Purchase),
    sales: s.docs.map((d) => d.data() as Sale),
    returns: r.docs.map((d) => d.data() as Return),
    settings: configMinima(main.get('settings') as Partial<Settings> | undefined),
  };
}

async function lerPendentes<T>(uid: string, colecao: string): Promise<T[]> {
  const snap = await db()
    .collection(`users/${uid}/${colecao}`)
    .where('estado', '==', 'pendente')
    .get();
  return snap.docs.map((d) => d.data() as T);
}

/** Erro de precondição do Firestore quando `create` acha o documento ocupado. */
function ehChoque(err: unknown): boolean {
  const codigo = (err as { code?: unknown })?.code;
  return codigo === 6 || codigo === 'already-exists';
}

/**
 * Aplica no razão o que o Mercado Livre já entregou.
 *
 * Devolve o que foi feito para quem chamou logar. Nunca lança por causa de
 * choque com o navegador — replaneja e, se insistir, desiste até a próxima
 * rodada. O dado não se perde: continua pendente na caixa.
 */
export async function aplicarNoRazao(uid: string): Promise<ResultadoDaAplicacao> {
  const vazio: ResultadoDaAplicacao = { rodou: false, vendas: 0, devolucoes: 0, pendentes: 0 };

  for (let tentativa = 1; tentativa <= MAX_TENTATIVAS; tentativa++) {
    const razao = await lerRazao(uid);
    if (!razao) return { ...vazio, motivo: 'schema_antigo' };
    if (razao.settings.mlAutoApply === false) return { ...vazio, motivo: 'desligado' };

    const caixa = await lerPendentes<ItemDaCaixa>(uid, 'mlInbox');
    const devolucoes = await lerPendentes<DevolucaoDoMl>(uid, 'mlReturns');
    if (caixa.length === 0 && devolucoes.length === 0) {
      return { ...vazio, rodou: true, motivo: 'nada_a_fazer' };
    }

    /* Só entra o que foi classificado como venda nova — a mesma trava do app.
       O backfill traz até 12 meses, boa parte já digitada à mão; lançar sem
       conferir duplicaria faturamento, estoque e o teto do MEI. Tudo que
       parece duplicata espera decisão sua na caixa. */
    const classificacao = classificarCaixa(caixa, razao.sales);
    const novas = caixa.filter((i) => classificacao.get(i.externalId)?.veredito === 'nova');

    const lotes = razao.purchases.map((p) =>
      calculatePurchase(p, razao.sales, razao.settings, razao.returns),
    );
    const planoVendas = planejarAplicacao(novas, lotes, razao.sales, {
      custoFlex: razao.settings.flexShippingCost,
    });

    /* As devoluções são planejadas contra o razão JÁ com as vendas desta
       rodada: uma devolução só existe se a venda existir, e a venda pode ter
       acabado de entrar. */
    const vendasDepois = [...razao.sales, ...planoVendas.novas];
    const planoDevolucoes = planejarDevolucoes(devolucoes, vendasDepois, razao.returns);

    const criar: { caminho: string; dados: Sale | Return }[] = [
      ...planoVendas.novas.map((v) => ({ caminho: `users/${uid}/sales/${v.id}`, dados: v })),
      ...planoDevolucoes.novas.map((d) => ({ caminho: `users/${uid}/returns/${d.id}`, dados: d })),
    ];
    const atualizar: { caminho: string; dados: Sale | Return }[] = [
      ...planoVendas.atualizadas.map((v) => ({ caminho: `users/${uid}/sales/${v.id}`, dados: v })),
      ...planoDevolucoes.atualizadas.map((d) => ({
        caminho: `users/${uid}/returns/${d.id}`,
        dados: d,
      })),
    ];

    if (criar.length === 0 && atualizar.length === 0) {
      await marcarProcessados(uid, planoVendas.aplicados, planoDevolucoes.aplicadas);
      return {
        rodou: true,
        vendas: 0,
        devolucoes: 0,
        pendentes: planoVendas.pendentes.length + planoDevolucoes.pendentes.length,
        motivo: 'nada_a_fazer',
      };
    }

    try {
      await gravar(criar, atualizar);
    } catch (err) {
      if (!ehChoque(err)) throw err;
      /* O navegador gravou uma venda com o mesmo número enquanto planejávamos.
         Nada foi escrito — o lote é atômico —, então basta reler e replanejar:
         o `externalId` garante que o que já entrou não entre de novo. */
      logger.info('Choque de numeração com o navegador; replanejando', { uid, tentativa });
      continue;
    }

    await marcarProcessados(uid, planoVendas.aplicados, planoDevolucoes.aplicadas);

    /* O status olha TODAS as devoluções da venda, não só as desta rodada: uma
       venda de 3 unidades com 2 devolvidas no mês passado e 1 agora só vira
       'Devolvida' somando as três. */
    const devolucoesDepois = mesclarPorId(
      razao.returns,
      planoDevolucoes.novas,
      planoDevolucoes.atualizadas,
    );
    await sincronizarStatus(uid, planoDevolucoes, vendasDepois, devolucoesDepois);

    return {
      rodou: true,
      vendas: planoVendas.novas.length,
      devolucoes: planoDevolucoes.novas.length,
      pendentes: planoVendas.pendentes.length + planoDevolucoes.pendentes.length,
    };
  }

  logger.warn('Aplicação no razão desistiu depois de replanejar', { uid, tentativas: MAX_TENTATIVAS });
  return { ...vazio, rodou: true, motivo: 'choque' };
}

/**
 * Grava o plano. Registro novo entra com `create`; registro que já existe é
 * atualizado com `set`.
 *
 * A diferença não é estilo: `create` é a precondição que impede o servidor de
 * apagar uma venda do navegador que por acaso tenha o mesmo número. Se o lote
 * falhar, NADA dele foi escrito.
 */
async function gravar(
  criar: readonly { caminho: string; dados: unknown }[],
  atualizar: readonly { caminho: string; dados: unknown }[],
): Promise<void> {
  const todas = [
    ...criar.map((o) => ({ ...o, novo: true })),
    ...atualizar.map((o) => ({ ...o, novo: false })),
  ];

  for (let i = 0; i < todas.length; i += POR_LOTE) {
    const lote = db().batch();
    for (const op of todas.slice(i, i + POR_LOTE)) {
      const ref = db().doc(op.caminho);
      if (op.novo) lote.create(ref, op.dados as Record<string, unknown>);
      else lote.set(ref, op.dados as Record<string, unknown>);
    }
    await lote.commit();
  }
}

/** Junta listas por `id`, com as últimas vencendo. */
function mesclarPorId<T extends { id: string }>(...listas: readonly (readonly T[])[]): T[] {
  const mapa = new Map<string, T>();
  for (const lista of listas) for (const item of lista) mapa.set(item.id, item);
  return [...mapa.values()];
}

/** Tira da fila o que entrou no razão. */
async function marcarProcessados(
  uid: string,
  externalIds: readonly string[],
  claimIds: readonly string[],
): Promise<void> {
  const marcas = [
    ...externalIds.map((id) => `users/${uid}/mlInbox/${id}`),
    ...claimIds.map((id) => `users/${uid}/mlReturns/${id}`),
  ];
  if (marcas.length === 0) return;

  for (let i = 0; i < marcas.length; i += POR_LOTE) {
    const lote = db().batch();
    for (const caminho of marcas.slice(i, i + POR_LOTE)) {
      lote.set(db().doc(caminho), { estado: 'aplicado', atualizadoEm: Timestamp.now() }, { merge: true });
    }
    await lote.commit();
  }
}

/**
 * Mantém `Sale.status` coerente com as devoluções que acabaram de entrar.
 *
 * Mesma regra do app (`DataService.syncSaleStatus`): alterna APENAS o par
 * Concluída ↔ Devolvida, porque 'Cancelada' e 'Em disputa' são escolha sua e
 * o servidor não desfaz escolha de dono. O campo é conveniência de exibição —
 * nenhum cálculo de dinheiro depende dele —, então uma escrita perdida aqui
 * deixa no máximo um selo desatualizado.
 */
async function sincronizarStatus(
  uid: string,
  plano: { novas: Return[]; atualizadas: Return[] },
  vendas: readonly Sale[],
  todas: readonly Return[],
): Promise<void> {
  const tocadas = new Set([...plano.novas, ...plano.atualizadas].map((d) => d.saleId));
  if (tocadas.size === 0) return;

  const lote = db().batch();
  let mudou = 0;

  for (const saleId of tocadas) {
    const venda = vendas.find((v) => v.id === saleId);
    if (!venda) continue;
    if (venda.status === 'Cancelada' || venda.status === 'Em disputa') continue;

    const devolvido = todas.reduce(
      (soma, d) => (d.saleId === saleId && d.arrivalDate ? soma + d.quantity : soma),
      0,
    );
    const proximo =
      devolvido > 0 && devolvido >= venda.quantitySold ? 'Devolvida' : 'Concluída';
    if (venda.status === proximo) continue;

    lote.set(db().doc(`users/${uid}/sales/${saleId}`), { status: proximo }, { merge: true });
    mudou++;
  }

  if (mudou > 0) await lote.commit();
}
