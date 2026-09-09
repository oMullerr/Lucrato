/**
 * Backup completo do Firestore do Lucrato, em um arquivo JSON.
 *
 * Uso (a partir da raiz do repositório):
 *   node scripts/backup-firestore.mjs --out <pasta> [--projects lucrato-web,lucrato-dev]
 *
 * Opções:
 *   --out         pasta onde gravar o arquivo (obrigatório)
 *   --projects    projetos a percorrer (padrão: lucrato-web,lucrato-dev)
 *   --redact      omite os valores de `users/*​/secret/ml`, mantendo o documento
 *                 na árvore. Sem isso, os tokens vivos vão para o arquivo.
 *
 * Autenticação: usa a credencial que o `gcloud` já tem na máquina
 * (`gcloud auth print-access-token`), como o `clone-user-data.mjs`. Nenhuma
 * chave de service account precisa ser baixada nem rotaciona depois.
 *
 * SOMENTE LEITURA. Este script não grava nada em nenhum dos projetos.
 *
 * ---------------------------------------------------------------------------
 * ONDE GRAVAR O ARQUIVO
 *
 * O repositório é público e o `.gitignore` não pega `*.json` na raiz. Se o
 * backup incluir `secret/ml`, ele é uma CREDENCIAL: contém o `accessToken` e o
 * `refreshToken` da conta do Mercado Livre. Grave fora do repositório, ou em
 * `chaves/`, que já é ignorada.
 *
 * ---------------------------------------------------------------------------
 * POR QUE OS CAMPOS FICAM NO FORMATO TIPADO DO FIRESTORE
 *
 * O Firestore devolve inteiro como STRING (`{"integerValue":"159"}`) e
 * distingue inteiro de decimal e timestamp de texto. Converter para JSON
 * "plano" transformaria 159 em "159", ou apagaria a distinção int/double, e o
 * backup deixaria de restaurar fiel. Guardar `fields` verbatim é sem perda —
 * e é a mesma escolha do `clone-user-data.mjs`.
 *
 * ---------------------------------------------------------------------------
 * COMO RESTAURAR (este script NÃO restaura)
 *
 * Um documento de cada vez, com o caminho que está na chave:
 *
 *   PATCH https://firestore.googleapis.com/v1/projects/<projeto>/databases/
 *         (default)/documents/<caminho>
 *   body: { "fields": <o objeto guardado> }
 *
 * Sem `updateMask`, o PATCH substitui o documento inteiro — que é o que se quer
 * numa restauração, e não uma mesclagem com o que estiver lá.
 *
 * Duas ressalvas:
 *   - Documento com `"vazio": true` só existe como pai de subcoleções (ex.:
 *     `users/{uid}`). Não precisa ser recriado: escrever os filhos basta.
 *   - NÃO restaure `secret/ml`. O refresh token é de uso único e rotaciona a
 *     cada renovação, então o que está no arquivo já morreu. Regravá-lo
 *     substituiria um token bom por um morto. O caminho certo é reconectar a
 *     conta pela tela de Integrações.
 */
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { argv, exit } from 'node:process';

function arg(nome) {
  const i = argv.indexOf(`--${nome}`);
  return i === -1 ? undefined : argv[i + 1];
}

const destino = arg('out');
const projetos = (arg('projects') ?? 'lucrato-web,lucrato-dev').split(',').map((p) => p.trim());
const redigir = argv.includes('--redact');

if (!destino) {
  console.error('Falta --out <pasta>. Veja o cabeçalho do arquivo para o uso.');
  exit(1);
}

// Comando único em vez de argumentos separados: no Windows o `gcloud` é um
// `.cmd` e só o shell resolve.
const token = execSync('gcloud auth print-access-token', { encoding: 'utf8' }).trim();

const raiz = (projeto) =>
  `https://firestore.googleapis.com/v1/projects/${projeto}/databases/(default)/documents`;

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

/**
 * Subcoleções de um documento (ou da raiz, com `caminho` vazio).
 *
 * É a única forma de descobrir a árvore: o Firestore não tem "listar tudo".
 */
async function listarColecoes(projeto, caminho = '') {
  const alvo = caminho ? `${raiz(projeto)}/${caminho}` : raiz(projeto);
  const nomes = [];
  let pageToken;
  do {
    const r = await pedir(`${alvo}:listCollectionIds`, {
      method: 'POST',
      body: JSON.stringify({ pageSize: 300, ...(pageToken ? { pageToken } : {}) }),
    });
    nomes.push(...(r.collectionIds ?? []));
    pageToken = r.nextPageToken;
  } while (pageToken);
  return nomes;
}

/**
 * Documentos de uma coleção, paginados.
 *
 * `showMissing=true` não é detalhe: um documento sem campo nenhum, que existe
 * só como pai de subcoleções, é OMITIDO da listagem sem essa flag — e é
 * exatamente o caso de `users/{uid}` aqui, que não tem campo algum. Sem isso o
 * backup sai vazio.
 */
async function listarDocumentos(projeto, colecao) {
  const docs = [];
  let pageToken;
  do {
    const url =
      `${raiz(projeto)}/${colecao}?pageSize=300&showMissing=true` +
      (pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : '');
    const r = await pedir(url);
    docs.push(...(r.documents ?? []));
    pageToken = r.nextPageToken;
  } while (pageToken);
  return docs;
}

/** Caminho relativo do documento, que é a chave usada no arquivo. */
const caminhoDe = (nome) => nome.split('/documents/')[1];

/** Percorre uma coleção e, recursivamente, tudo que pende dela. */
async function percorrer(projeto, colecao, saida, colecoesVistas) {
  colecoesVistas.add(colecao.replace(/\/[^/]+\//g, '/*/'));

  for (const doc of await listarDocumentos(projeto, colecao)) {
    const caminho = caminhoDe(doc.name);

    if (doc.fields) {
      const segredo = /\/secret\/[^/]+$/.test(caminho);
      saida[caminho] =
        redigir && segredo
          ? { redigido: true, campos: Object.keys(doc.fields).sort() }
          : { fields: doc.fields, createTime: doc.createTime, updateTime: doc.updateTime };
    } else {
      // Só existe como pai de subcoleções. Fica registrado para a árvore
      // ficar completa, mas não precisa ser recriado numa restauração.
      saida[caminho] = { vazio: true };
    }

    for (const sub of await listarColecoes(projeto, caminho)) {
      await percorrer(projeto, `${caminho}/${sub}`, saida, colecoesVistas);
    }
  }
}

const backup = {
  formato: 'lucrato-backup/1',
  geradoEm: new Date().toISOString(),
  aviso: redigir
    ? 'Tokens do Mercado Livre omitidos (--redact).'
    : 'CONTÉM CREDENCIAIS VIVAS do Mercado Livre em users/*/secret/ml. Trate este arquivo como senha.',
  projetos: {},
};

for (const projeto of projetos) {
  const documentos = {};
  const colecoesVistas = new Set();

  for (const colecao of await listarColecoes(projeto)) {
    await percorrer(projeto, colecao, documentos, colecoesVistas);
  }

  const comCampos = Object.values(documentos).filter((d) => !d.vazio).length;
  backup.projetos[projeto] = {
    resumo: {
      documentos: Object.keys(documentos).length,
      comCampos,
      colecoes: [...colecoesVistas].sort(),
    },
    documentos,
  };

  console.log(
    `${projeto}: ${Object.keys(documentos).length} documentos ` +
      `(${comCampos} com conteúdo) em ${colecoesVistas.size} coleções`,
  );
  for (const c of [...colecoesVistas].sort()) {
    const n = Object.keys(documentos).filter(
      (k) => k.replace(/\/[^/]+$/, '').replace(/\/[^/]+\//g, '/*/') === c,
    ).length;
    console.log(`    ${c.padEnd(28)} ${n}`);
  }
}

mkdirSync(destino, { recursive: true });
const dia = new Date().toISOString().slice(0, 10);
const arquivo = join(destino, `lucrato-backup-${dia}.json`);
writeFileSync(arquivo, JSON.stringify(backup, null, 2), 'utf8');

console.log(`\nArquivo: ${arquivo}`);
if (!redigir) {
  console.log('ATENÇÃO: contém tokens vivos do Mercado Livre. Não coloque no repositório.');
}
