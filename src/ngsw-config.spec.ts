import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

/**
 * O gerador do service worker trata cada caminho do `ngsw-config.json` como um
 * glob. Um caminho que não casa com arquivo nenhum não dá erro: some do
 * manifesto em silêncio, e o build passa.
 *
 * Foi assim que a troca de fonte de setembro/2026 deixou a fonte de display
 * fora de qualquer cache. O `ngsw-config` seguia pedindo o Archivo, que já não
 * existia; o Instrument Sans, que entrou no lugar, não estava em grupo nenhum.
 * Offline, o app instalado desenhava títulos e o número-herói com a fonte do
 * sistema — e nada no build, no console ou nos testes dizia isso.
 */

const RAIZ = join(__dirname, '..');

interface Grupo {
  name: string;
  installMode: 'prefetch' | 'lazy';
  resources: { files?: string[] };
}

function grupos(): Grupo[] {
  return JSON.parse(readFileSync(join(RAIZ, 'ngsw-config.json'), 'utf8')).assetGroups;
}

/** `*` casa dentro de um segmento; `**` atravessa pastas. Basta para este arquivo. */
function comoRegex(glob: string): RegExp {
  const corpo = glob
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '\u0000')
    .replace(/\*/g, '[^/]*')
    .replace(/\u0000/g, '.*');
  return new RegExp(`^${corpo}$`);
}

/** As fontes que o CSS realmente pede, na ordem em que o `@font-face` declara. */
function fontesDoCss(): string[] {
  const css = readFileSync(join(__dirname, 'styles', '_typography.scss'), 'utf8');
  return [...css.matchAll(/url\('([^']+\.woff2)'\)/g)].map((m) => m[1]);
}

function gruposQueCobrem(url: string): Grupo[] {
  return grupos().filter((g) => (g.resources.files ?? []).some((p) => comoRegex(p).test(url)));
}

describe('ngsw-config.json', () => {
  it('não pede arquivo que não existe', () => {
    // `/index.html` sai do build, não de `public/`; o resto é servido de lá.
    const literais = grupos()
      .flatMap((g) => g.resources.files ?? [])
      .filter((p) => !p.includes('*') && p !== '/index.html');

    expect(literais.filter((p) => !existsSync(join(RAIZ, 'public', p)))).toEqual([]);
  });

  it('guarda em cache toda fonte que o CSS declara', () => {
    const fontes = fontesDoCss();
    expect(fontes.length).toBeGreaterThan(0);

    expect(fontes.filter((url) => gruposQueCobrem(url).length === 0)).toEqual([]);
  });

  it('baixa na instalação as fontes do alfabeto básico', () => {
    // As `-latin-ext` (acentos raros) podem esperar o primeiro uso. As básicas
    // desenham qualquer tela em português: sem elas no `prefetch`, o primeiro
    // uso offline sai na fonte do sistema.
    const basicas = fontesDoCss().filter((url) => !url.includes('-latin-ext'));

    const foraDoPrefetch = basicas.filter(
      (url) => !gruposQueCobrem(url).some((g) => g.installMode === 'prefetch'),
    );
    expect(foraDoPrefetch).toEqual([]);
  });

  it('o que o index.html pré-carrega também fica no cache', () => {
    // Pré-carregar e não guardar é baixar de novo a cada visita a fonte que o
    // navegador foi avisado de que é urgente.
    const html = readFileSync(join(__dirname, 'index.html'), 'utf8');
    const precarregadas = [...html.matchAll(/rel="preload" href="([^"]+)"/g)].map((m) => m[1]);
    expect(precarregadas.length).toBeGreaterThan(0);

    expect(precarregadas.filter((url) => gruposQueCobrem(url).length === 0)).toEqual([]);
  });
});
