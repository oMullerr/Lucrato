/**
 * Peças puras do OAuth. São a parte do fluxo que dá para provar sem rede:
 * PKCE, aleatoriedade do `state`, o filtro de destino de retorno e o backoff.
 */
import {
  backoffDelayMs,
  base64url,
  codeChallengeOf,
  isAllowedReturnTo,
  newCodeVerifier,
  newState,
} from './crypto';

describe('PKCE', () => {
  it('base64url nao usa +, / nem =', () => {
    const saida = base64url(Buffer.from([251, 255, 254, 0, 1, 2]));
    expect(saida).not.toMatch(/[+/=]/);
  });

  it('code_verifier fica no tamanho exigido pela RFC 7636', () => {
    const v = newCodeVerifier();
    expect(v.length).toBeGreaterThanOrEqual(43);
    expect(v.length).toBeLessThanOrEqual(128);
    expect(v).toMatch(/^[A-Za-z0-9\-._~]+$/);
  });

  it('code_challenge e deterministico e nao revela o verifier', () => {
    const v = newCodeVerifier();
    expect(codeChallengeOf(v)).toBe(codeChallengeOf(v));
    expect(codeChallengeOf(v)).not.toBe(v);
    expect(codeChallengeOf(v)).toHaveLength(43);
  });

  it('verifiers diferentes geram challenges diferentes', () => {
    expect(codeChallengeOf(newCodeVerifier())).not.toBe(codeChallengeOf(newCodeVerifier()));
  });

  it('state e aleatorio', () => {
    const amostra = new Set(Array.from({ length: 200 }, () => newState()));
    expect(amostra.size).toBe(200);
  });
});

describe('destino de retorno', () => {
  it('aceita localhost em http', () => {
    expect(isAllowedReturnTo('http://localhost:4200/settings')).toBe(true);
    expect(isAllowedReturnTo('http://127.0.0.1:4200/')).toBe(true);
  });

  it('aceita preview da Vercel', () => {
    expect(isAllowedReturnTo('https://lucrato-git-feature-ml-abc.vercel.app/settings')).toBe(true);
  });

  it('recusa http em dominio remoto', () => {
    expect(isAllowedReturnTo('http://lucrato-teste.vercel.app/')).toBe(false);
  });

  it('recusa esquema perigoso', () => {
    expect(isAllowedReturnTo('javascript:alert(1)')).toBe(false);
    expect(isAllowedReturnTo('data:text/html,<script>')).toBe(false);
  });

  it('recusa dominio desconhecido', () => {
    expect(isAllowedReturnTo('https://site-do-atacante.com/roubo')).toBe(false);
  });

  it('recusa o dominio raiz da vercel', () => {
    expect(isAllowedReturnTo('https://vercel.app/')).toBe(false);
  });

  it('aceita origem extra configurada, comparando pelo host', () => {
    const extras = ['https://lucrato.app'];
    expect(isAllowedReturnTo('https://lucrato.app/settings', extras)).toBe(true);
    expect(isAllowedReturnTo('https://lucrato.app.atacante.com/', extras)).toBe(false);
  });

  it('recusa lixo', () => {
    expect(isAllowedReturnTo('')).toBe(false);
    expect(isAllowedReturnTo('nao-e-url')).toBe(false);
  });
});

describe('backoff', () => {
  it('cresce com a tentativa', () => {
    const media = (n: number) =>
      Array.from({ length: 40 }, () => backoffDelayMs(n)).reduce((a, b) => a + b, 0) / 40;
    expect(media(3)).toBeGreaterThan(media(0));
  });

  it('respeita o teto', () => {
    for (let i = 0; i < 20; i++) {
      expect(backoffDelayMs(i, 500, 30_000)).toBeLessThanOrEqual(30_000);
    }
  });

  it('nunca devolve espera negativa', () => {
    for (let i = 0; i < 10; i++) expect(backoffDelayMs(i)).toBeGreaterThan(0);
  });
});
