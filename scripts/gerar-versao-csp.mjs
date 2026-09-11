/**
 * Gera `src/environments/csp-version.ts` a partir do CSP do vercel.json.
 *
 * Uso (a partir da raiz do repositório):
 *   node scripts/gerar-versao-csp.mjs
 *
 * Roda sozinho no `prebuild`, no `prebuild:staging` e no `pretest`.
 *
 * ---------------------------------------------------------------------------
 * POR QUE ISSO EXISTE
 *
 * O CSP que vale para o service worker é o que veio nos headers do
 * `ngsw-worker.js` no dia em que ele foi instalado. O arquivo é igual byte a
 * byte em todo deploy, então o navegador nunca reinstala o worker: mudar o CSP
 * no vercel.json não alcança quem já tem o app. Pior, a própria página também
 * continua com o CSP velho, porque o `index.html` vem do cache do worker e uma
 * resposta em cache carrega os headers do dia em que foi gravada.
 *
 * A única coisa que troca o worker é mudar a URL do script. Por isso o app
 * registra `ngsw-worker.js?csp=<versão>`, e a versão é uma impressão digital do
 * próprio CSP: mexeu no CSP, a versão muda sozinha, a URL muda, o worker é
 * reinstalado com o CSP de hoje — e, de quebra, o bundle muda, o que gera uma
 * versão nova do PWA e faz o `index.html` ser regravado com os headers novos.
 *
 * Ou seja: ninguém precisa lembrar de nada.
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const RAIZ = process.cwd();
const VERCEL = join(RAIZ, 'vercel.json');
const DESTINO = join(RAIZ, 'src', 'environments', 'csp-version.ts');

/** A regra que serve o worker. As outras, por eliminação, são de documento. */
export const FONTE_DO_WORKER = '/ngsw-worker.js';

/** O CSP do documento — o do worker é outro, e é propositalmente mais frouxo. */
export function cspDoDocumento() {
  const vercel = JSON.parse(readFileSync(VERCEL, 'utf8'));
  const politicas = vercel.headers
    .filter((regra) => regra.source !== FONTE_DO_WORKER)
    .flatMap((regra) => regra.headers)
    .filter((header) => header.key === 'Content-Security-Policy')
    .map((header) => header.value);

  if (politicas.length !== 1) {
    throw new Error(
      `Esperava exatamente um Content-Security-Policy de documento no vercel.json, achei ${politicas.length}. ` +
        'Dois CSPs no mesmo recurso valem pela interseção e quebram o app de um jeito difícil de ver.',
    );
  }

  return politicas[0];
}

/** Mesma conta em src/csp.spec.ts — se mudar aqui, mude lá. */
export function versaoDoCsp(csp) {
  return createHash('sha256').update(csp).digest('hex').slice(0, 8);
}

export function arquivoGerado(versao) {
  return `/* Gerado por scripts/gerar-versao-csp.mjs — não edite à mão.
   Impressão digital do CSP do vercel.json. Serve para versionar a URL do
   service worker, porque o CSP dele congela no dia da instalação. */
export const CSP_VERSION = '${versao}';
`;
}

const versao = versaoDoCsp(cspDoDocumento());
const conteudo = arquivoGerado(versao);
const atual = (() => {
  try {
    return readFileSync(DESTINO, 'utf8');
  } catch {
    return null;
  }
})();

/* No Windows o arquivo vem do git com CRLF e este script escreve LF. Comparar
   byte a byte marcaria o arquivo como alterado em todo build, e `git status`
   sujo por ruído é `git status` que ninguém lê. */
const mesmaCoisa = (a, b) => a?.replace(/\r\n/g, '\n') === b.replace(/\r\n/g, '\n');

if (mesmaCoisa(atual, conteudo)) {
  console.log(`versão do CSP já está em dia: ${versao}`);
} else {
  writeFileSync(DESTINO, conteudo);
  console.log(`versão do CSP atualizada para ${versao} (${DESTINO})`);
}
