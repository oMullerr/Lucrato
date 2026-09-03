/**
 * Testes das security rules do Firestore.
 *
 * Estas regras são TODA a fronteira de segurança do lado do navegador: o Admin
 * SDK (as functions) as ignora de propósito. O que se prova aqui é que o
 * cliente lê o que precisa, não escreve o que não deve, e nunca enxerga os
 * tokens do Mercado Livre.
 *
 * Rodar com o emulador em volta:
 *   firebase emulators:exec --only firestore --project demo-lucrato "npm --prefix functions test"
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, deleteDoc } from 'firebase/firestore';

const DONO = 'user-dono';
const OUTRO = 'user-outro';

let env: RulesTestEnvironment;

const verificado = () => env.authenticatedContext(DONO, { email_verified: true }).firestore();
const naoVerificado = () => env.authenticatedContext(DONO, { email_verified: false }).firestore();
const intruso = () => env.authenticatedContext(OUTRO, { email_verified: true }).firestore();
const anonimo = () => env.unauthenticatedContext().firestore();

const docPrincipal = {
  purchases: [],
  sales: [],
  returns: [],
  settings: { defaultMlFee: 0.12 },
  metadata: { versao: '1.0.0', ultimaAtualizacao: '2026-09-03T00:00:00.000Z' },
};

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-lucrato',
    firestore: { rules: readFileSync(resolve(__dirname, '../../firestore.rules'), 'utf8') },
  });
});

afterAll(async () => env?.cleanup());

beforeEach(async () => {
  await env.clearFirestore();
  // Semeia os caminhos escritos pelo servidor, ignorando as regras.
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, `users/${DONO}/db/ml`), { nickname: 'TESTE', mlUserId: 123 });
    await setDoc(doc(db, `users/${DONO}/mlItems/MLB1`), { title: 'Anuncio' });
    await setDoc(doc(db, `users/${DONO}/mlLinks/MLB1`), { productKey: 'produto' });
    await setDoc(doc(db, `users/${DONO}/mlInbox/order-1`), { status: 'pronta' });
    await setDoc(doc(db, `users/${DONO}/mlReturns/claim-1`), { estado: 'pendente' });
    await setDoc(doc(db, `users/${DONO}/secret/ml`), { refreshToken: 'TG-segredo' });
    await setDoc(doc(db, `users/${DONO}/mlOrders/1`), { id: 1 });
    await setDoc(doc(db, `users/${DONO}/mlEvents/e1`), { topic: 'orders_v2' });
    await setDoc(doc(db, 'mlIndex/123'), { uid: DONO });
  });
});

describe('documento principal', () => {
  it('dono verificado lê e grava', async () => {
    const db = verificado();
    await assertSucceeds(setDoc(doc(db, `users/${DONO}/db/main`), docPrincipal));
    await assertSucceeds(getDoc(doc(db, `users/${DONO}/db/main`)));
  });

  it('recusa chave desconhecida no documento', async () => {
    const db = verificado();
    await assertFails(
      setDoc(doc(db, `users/${DONO}/db/main`), { ...docPrincipal, mlTokens: { a: 1 } }),
    );
  });

  it('e-mail nao verificado nao acessa', async () => {
    const db = naoVerificado();
    await assertFails(getDoc(doc(db, `users/${DONO}/db/main`)));
    await assertFails(setDoc(doc(db, `users/${DONO}/db/main`), docPrincipal));
  });

  it('outro usuario nao acessa', async () => {
    await assertFails(getDoc(doc(intruso(), `users/${DONO}/db/main`)));
    await assertFails(getDoc(doc(anonimo(), `users/${DONO}/db/main`)));
  });

  it('dono ainda consegue apagar a conta', async () => {
    await assertSucceeds(deleteDoc(doc(verificado(), `users/${DONO}/db/main`)));
  });
});

describe('dados do Mercado Livre — leitura do dono, escrita so do servidor', () => {
  const caminhos = [
    'db/ml',
    'mlItems/MLB1',
    'mlLinks/MLB1',
    'mlInbox/order-1',
    'mlReturns/claim-1',
  ];

  it.each(caminhos)('dono le %s', async (caminho) => {
    await assertSucceeds(getDoc(doc(verificado(), `users/${DONO}/${caminho}`)));
  });

  it.each(caminhos)('dono NAO grava %s', async (caminho) => {
    await assertFails(setDoc(doc(verificado(), `users/${DONO}/${caminho}`), { adulterado: true }));
  });

  it.each(caminhos)('outro usuario NAO le %s', async (caminho) => {
    await assertFails(getDoc(doc(intruso(), `users/${DONO}/${caminho}`)));
  });
});

describe('segredos e filas internas sao invisiveis ao navegador', () => {
  const proibidos = ['secret/ml', 'mlOrders/1', 'mlEvents/e1'];

  it.each(proibidos)('nem o dono le %s', async (caminho) => {
    await assertFails(getDoc(doc(verificado(), `users/${DONO}/${caminho}`)));
  });

  it.each(proibidos)('nem o dono grava %s', async (caminho) => {
    await assertFails(setDoc(doc(verificado(), `users/${DONO}/${caminho}`), { x: 1 }));
  });

  it('mlIndex e invisivel', async () => {
    await assertFails(getDoc(doc(verificado(), 'mlIndex/123')));
  });
});

describe('analises da calculadora', () => {
  it('dono grava e le as proprias analises', async () => {
    const db = verificado();
    await assertSucceeds(
      setDoc(doc(db, `users/${DONO}/db/analyses`), { analyses: [{ id: 'A1', preco: 365 }] }),
    );
    await assertSucceeds(getDoc(doc(db, `users/${DONO}/db/analyses`)));
  });

  it('recusa chave desconhecida', async () => {
    await assertFails(
      setDoc(doc(verificado(), `users/${DONO}/db/analyses`), { analyses: [], lixo: 1 }),
    );
  });
});

describe('caminhos nao previstos continuam negados', () => {
  it('outro documento em db/ e negado', async () => {
    await assertFails(getDoc(doc(verificado(), `users/${DONO}/db/qualquer`)));
    await assertFails(setDoc(doc(verificado(), `users/${DONO}/db/qualquer`), { a: 1 }));
  });
});
