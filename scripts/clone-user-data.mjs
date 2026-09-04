/**
 * Copia a base de um usuário do Firebase de PRODUÇÃO para o de TESTES.
 *
 * Uso (a partir da raiz do repositório):
 *   node scripts/clone-user-data.mjs \
 *     --from lucrato-web --from-uid <uid-producao> \
 *     --to   lucrato-dev --to-uid   <uid-testes>
 *
 * Opções:
 *   --dry-run    só mostra o que copiaria, sem gravar nada
 *
 * Autenticação: usa a credencial que o `gcloud` já tem na máquina
 * (`gcloud auth print-access-token`). Nenhuma chave privada de service account
 * precisa ser baixada, guardada em disco ou rotacionada depois — chave de
 * service account é credencial de longa duração e o Lucrato evita criar uma
 * onde um token de minutos resolve.
 *
 * Garantias:
 *   - A produção é aberta SOMENTE PARA LEITURA. Nada é gravado nela.
 *   - O destino precisa ser um projeto diferente da origem (o script recusa
 *     rodar se os dois forem iguais).
 *   - Só o documento `users/{uid}/db/main` é copiado. Coleções da integração
 *     (mlItems, mlInbox, mlBilling, secret…) não são clonadas de propósito: o
 *     ambiente de testes conecta a sua própria conta do Mercado Livre e monta
 *     esses dados sozinho.
 *   - O documento é copiado no formato tipado do Firestore, sem conversão de
 *     ida e volta — assim nenhum número vira string nem data perde precisão.
 */
import { execSync } from 'node:child_process';
import { argv, exit } from 'node:process';

function arg(nome) {
  const i = argv.indexOf(`--${nome}`);
  return i === -1 ? undefined : argv[i + 1];
}

const origem = arg('from');
const origemUid = arg('from-uid');
const destino = arg('to');
const destinoUid = arg('to-uid');
const dryRun = argv.includes('--dry-run');

if (!origem || !origemUid || !destino || !destinoUid) {
  console.error('Faltam parâmetros. Veja o cabeçalho do arquivo para o uso.');
  exit(1);
}

if (origem === destino) {
  console.error(
    `Origem e destino são o mesmo projeto (${origem}). Isso sobrescreveria dados reais — abortando.`,
  );
  exit(1);
}

// Comando único em vez de argumentos separados: no Windows o `gcloud` é um
// `.cmd` e só o shell resolve, e passar args pelo shell dispara aviso de
// segurança do Node — aqui não há nada vindo de fora para escapar.
const token = execSync('gcloud auth print-access-token', { encoding: 'utf8' }).trim();

const url = (projeto, uid) =>
  `https://firestore.googleapis.com/v1/projects/${projeto}/databases/(default)/documents/users/${uid}/db/main`;

async function pedir(endereco, init = {}) {
  const r = await fetch(endereco, {
    ...init,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
  });
  if (!r.ok) {
    throw new Error(`${r.status} ${r.statusText} — ${(await r.text()).slice(0, 300)}`);
  }
  return r.json();
}

const doc = await pedir(url(origem, origemUid)).catch((err) => {
  console.error(`Não deu para ler a origem: ${err.message}`);
  exit(1);
});

const campos = doc.fields ?? {};
const tamanho = (nome) => campos[nome]?.arrayValue?.values?.length ?? 0;

console.log(`Origem : ${origem} / users/${origemUid}/db/main`);
console.log(`Destino: ${destino} / users/${destinoUid}/db/main`);
console.log(
  `Conteúdo: ${tamanho('purchases')} compras, ${tamanho('sales')} vendas, ` +
    `${tamanho('returns')} devoluções`,
);

// O que vai ser substituído. Sobrescrever sem olhar é como se perde base boa.
const atual = await pedir(url(destino, destinoUid)).catch(() => null);
if (atual) {
  const eram = (nome) => atual.fields?.[nome]?.arrayValue?.values?.length ?? 0;
  console.log(
    `Destino hoje: ${eram('purchases')} compras, ${eram('sales')} vendas, ` +
      `${eram('returns')} devoluções — será SUBSTITUÍDO.`,
  );
} else {
  console.log('Destino hoje: documento ainda não existe.');
}

if (dryRun) {
  console.log('\n--dry-run: nada foi gravado.');
  exit(0);
}

// PATCH sem `updateMask` substitui o documento inteiro, que é o que se quer:
// uma cópia, não uma mesclagem com o que estava lá.
await pedir(url(destino, destinoUid), {
  method: 'PATCH',
  body: JSON.stringify({ fields: campos }),
});

console.log('\nCópia concluída.');
