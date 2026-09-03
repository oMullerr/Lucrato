/**
 * Copia a base de um usuário do Firebase de PRODUÇÃO para o de TESTES.
 *
 * Uso:
 *   node scripts/clone-user-data.mjs \
 *     --from-key ./chaves/lucrato-web.json   --from-uid <uid-producao> \
 *     --to-key   ./chaves/lucrato-dev.json   --to-uid   <uid-testes>
 *
 * Opções:
 *   --dry-run    só mostra o que copiaria, sem gravar nada
 *
 * Garantias:
 *   - A produção é aberta SOMENTE PARA LEITURA. Nada é gravado nela.
 *   - O destino precisa ser um projeto diferente da origem (o script recusa
 *     rodar se os dois projectId forem iguais).
 *   - Só o documento `users/{uid}/db/main` é copiado. Coleções da integração
 *     (mlItems, mlInbox, secret…) não são clonadas de propósito: o ambiente de
 *     testes conecta a própria conta de teste do Mercado Livre.
 *
 * As chaves de service account saem em:
 *   console.firebase.google.com → Configurações do projeto → Contas de serviço
 *   → Gerar nova chave privada. NÃO versione esses arquivos.
 *
 * Depende de firebase-admin. Rode de dentro de functions/ (onde ele é dependência):
 *   node ../scripts/clone-user-data.mjs …
 * ou instale pontualmente: npm i --no-save firebase-admin
 */
import { readFileSync } from 'node:fs';
import { argv, exit } from 'node:process';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

function arg(name) {
  const i = argv.indexOf(`--${name}`);
  return i === -1 ? undefined : argv[i + 1];
}

const fromKey = arg('from-key');
const fromUid = arg('from-uid');
const toKey = arg('to-key');
const toUid = arg('to-uid');
const dryRun = argv.includes('--dry-run');

if (!fromKey || !fromUid || !toKey || !toUid) {
  console.error('Faltam parâmetros. Veja o cabeçalho do arquivo para o uso.');
  exit(1);
}

const fromCred = JSON.parse(readFileSync(fromKey, 'utf8'));
const toCred = JSON.parse(readFileSync(toKey, 'utf8'));

if (fromCred.project_id === toCred.project_id) {
  console.error(
    `Origem e destino são o mesmo projeto (${fromCred.project_id}). ` +
      'Isso sobrescreveria dados reais — abortando.',
  );
  exit(1);
}

const src = getFirestore(initializeApp({ credential: cert(fromCred) }, 'src'));
const dst = getFirestore(initializeApp({ credential: cert(toCred) }, 'dst'));

const snap = await src.doc(`users/${fromUid}/db/main`).get();
if (!snap.exists) {
  console.error(`Documento users/${fromUid}/db/main não existe em ${fromCred.project_id}.`);
  exit(1);
}

const data = snap.data();
const resumo = {
  compras: data.purchases?.length ?? 0,
  vendas: data.sales?.length ?? 0,
  devolucoes: data.returns?.length ?? 0,
};

console.log(`Origem : ${fromCred.project_id} / users/${fromUid}/db/main`);
console.log(`Destino: ${toCred.project_id} / users/${toUid}/db/main`);
console.log(`Conteúdo: ${resumo.compras} compras, ${resumo.vendas} vendas, ${resumo.devolucoes} devoluções`);

if (dryRun) {
  console.log('\n--dry-run: nada foi gravado.');
  exit(0);
}

await dst.doc(`users/${toUid}/db/main`).set(data);
console.log('\nCópia concluída.');
