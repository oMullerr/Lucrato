import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * O service worker do Angular (ngsw-worker.js) intercepta TODAS as requisições
 * da página e as refaz por dentro, com `fetch()`. Um `fetch()` de dentro do SW
 * é avaliado pelo `connect-src` — mesmo quando o recurso original é um script
 * ou uma imagem. Ou seja: com o PWA ligado, `script-src` e `img-src` sozinhos
 * não bastam; todo host externo precisa estar também no `connect-src`.
 */
function diretivas(): Record<string, string[]> {
  const vercel = JSON.parse(readFileSync(join(__dirname, '..', 'vercel.json'), 'utf8'));
  const csp: string = vercel.headers
    .flatMap((h: { headers: { key: string; value: string }[] }) => h.headers)
    .find((h: { key: string }) => h.key === 'Content-Security-Policy').value;

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

describe('CSP do vercel.json', () => {
  it('libera no connect-src os hosts do reCAPTCHA Enterprise (App Check)', () => {
    const { 'connect-src': connect } = diretivas();

    expect(connect).toContain('https://www.google.com');
    expect(connect).toContain('https://www.gstatic.com');
  });

  it('libera no connect-src as fotos de anúncio do Mercado Livre', () => {
    const { 'connect-src': connect } = diretivas();

    expect(connect).toContain('https://*.mlstatic.com');
  });

  it('mantém no connect-src todo host permitido no script-src', () => {
    const { 'connect-src': connect, 'script-src': script } = diretivas();
    const hosts = script.filter((fonte) => fonte.startsWith('https://'));

    expect(hosts.filter((host) => !connect.includes(host))).toEqual([]);
  });
});
