import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';

import { CSP_VERSION } from './environments/csp-version';

/**
 * Duas armadilhas do CSP com PWA, as duas já custaram produção:
 *
 * 1. O service worker do Angular intercepta TODAS as requisições da página e as
 *    refaz por dentro, com `fetch()`. Um `fetch()` de dentro do worker é
 *    avaliado pelo `connect-src` do worker — mesmo quando o recurso original é
 *    um script ou uma imagem. Por isso o `ngsw-worker.js` tem CSP próprio, com
 *    `connect-src https:`: quem filtra de verdade é o CSP do documento, que é
 *    checado antes de a requisição chegar no worker.
 *
 * 2. O CSP do worker congela no dia da instalação, e o arquivo é igual byte a
 *    byte em todo deploy — o navegador nunca o reinstala. Só mudar a URL do
 *    script resolve, e é o que a versão do CSP faz.
 */
function vercel(): { headers: { source: string; headers: { key: string; value: string }[] }[] } {
  return JSON.parse(readFileSync(join(__dirname, '..', 'vercel.json'), 'utf8'));
}

function politicas(): { source: string; csp: string }[] {
  return vercel()
    .headers.flatMap((regra) =>
      regra.headers
        .filter((header) => header.key === 'Content-Security-Policy')
        .map((header) => ({ source: regra.source, csp: header.value })),
    );
}

function diretivas(csp: string): Record<string, string[]> {
  return Object.fromEntries(
    csp
      .split(';')
      .map((parte) => parte.trim())
      .filter(Boolean)
      .map((parte) => {
        const [nome, ...fontes] = parte.split(/\s+/);
        return [nome, fontes];
      }),
  );
}

/** Precisa bater com FONTE_DO_WORKER em scripts/gerar-versao-csp.mjs. */
const FONTE_DO_WORKER = '/ngsw-worker.js';

const cspDoDocumento = () => politicas().filter((p) => p.source !== FONTE_DO_WORKER)[0].csp;
const doDocumento = () => diretivas(cspDoDocumento());
const doWorker = () => diretivas(politicas().filter((p) => p.source === FONTE_DO_WORKER)[0].csp);

describe('CSP do vercel.json', () => {
  it('libera no connect-src os hosts do reCAPTCHA Enterprise (App Check)', () => {
    const { 'connect-src': connect } = doDocumento();

    expect(connect).toContain('https://www.google.com');
    expect(connect).toContain('https://www.gstatic.com');
  });

  it('libera no connect-src as fotos de anúncio do Mercado Livre', () => {
    expect(doDocumento()['connect-src']).toContain('https://*.mlstatic.com');
  });

  it('mantém no connect-src todo host permitido no script-src', () => {
    const { 'connect-src': connect, 'script-src': script } = doDocumento();
    const hosts = script.filter((fonte) => fonte.startsWith('https://'));

    expect(hosts.filter((host) => !connect.includes(host))).toEqual([]);
  });

  it('aplica um CSP só por recurso — dois valem pela interseção', () => {
    const fontes = politicas();

    expect(fontes.length).toBe(2);
    expect(fontes.filter((p) => p.source === FONTE_DO_WORKER).length).toBe(1);
    // A regra ampla precisa excluir o worker, senão os dois CSPs se somam nele.
    expect(fontes.find((p) => p.source !== FONTE_DO_WORKER)!.source).toContain('?!ngsw-worker');
  });

  it('não deixa o CSP do worker estrangular o que o documento já permitiu', () => {
    expect(doWorker()['connect-src']).toEqual(['https:']);
  });
});

describe('versão do CSP (URL do service worker)', () => {
  /** Mesma conta de scripts/gerar-versao-csp.mjs — se mudar lá, mude aqui. */
  it('acompanha o CSP do documento', () => {
    const esperada = createHash('sha256').update(cspDoDocumento()).digest('hex').slice(0, 8);

    expect(CSP_VERSION).toBe(esperada);
  });

  it('é usada na URL do service worker', () => {
    const config = readFileSync(join(__dirname, 'app', 'app.config.ts'), 'utf8');

    expect(config).toContain('ngsw-worker.js?csp=${CSP_VERSION}');
  });
});
