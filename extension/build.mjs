/**
 * Empacota a extensao.
 *
 * O manifesto e GERADO a partir de `src/config.ts`: as origens em que a ponte
 * de token e injetada nao podem existir em dois lugares que podem discordar.
 * Rode com `npm run build:ext` (ou `-- --producao` para minificar).
 */
import { build } from 'esbuild';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const raiz = dirname(fileURLToPath(import.meta.url));
const dist = resolve(raiz, 'dist');
const producao = process.argv.includes('--producao');

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });

/**
 * Le as constantes do config sem precisar de runtime de TypeScript: o arquivo
 * so exporta literais, entao um bundle isolado resolve e pode ser importado.
 */
async function lerConfig() {
  const temporario = resolve(dist, '.config.mjs');
  await build({
    entryPoints: [resolve(raiz, 'src/config.ts')],
    outfile: temporario,
    bundle: true,
    format: 'esm',
    logLevel: 'silent',
  });
  const mod = await import(pathToFileURL(temporario).href);
  rmSync(temporario, { force: true });
  return mod;
}

const config = await lerConfig();

await build({
  entryPoints: [
    resolve(raiz, 'src/background.ts'),
    resolve(raiz, 'src/content-ml.ts'),
    resolve(raiz, 'src/content-lucrato.ts'),
  ],
  outdir: dist,
  bundle: true,
  format: 'iife',
  target: ['chrome114'],
  minify: producao,
  sourcemap: !producao,
  legalComments: 'none',
});

const manifest = {
  manifest_version: 3,
  name: 'Lucrato — análise de compra',
  version: '0.1.0',
  description:
    'Lucro, margem e ROI direto no anúncio do Mercado Livre, com a comissão real da sua conta.',
  // `storage` guarda os seus números e o token de sessão. Nada mais é pedido:
  // sem `tabs`, sem acesso ao histórico, sem host largo.
  permissions: ['storage'],
  host_permissions: [`${config.FUNCTIONS_BASE}/*`],
  background: { service_worker: 'background.js' },
  content_scripts: [
    { matches: config.ORIGENS_DO_ML, js: ['content-ml.js'], run_at: 'document_idle' },
    { matches: config.ORIGENS_DO_LUCRATO, js: ['content-lucrato.js'], run_at: 'document_idle' },
  ],
  action: { default_title: 'Lucrato' },
};

writeFileSync(resolve(dist, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

console.log(`extensao empacotada em ${dist}`);
console.log(`  Mercado Livre: ${config.ORIGENS_DO_ML.join(', ')}`);
console.log(`  Lucrato:       ${config.ORIGENS_DO_LUCRATO.join(', ')}`);
console.log(`  Functions:     ${config.FUNCTIONS_BASE}`);
