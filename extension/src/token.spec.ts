/**
 * Guarda do token.
 *
 * O que estes testes protegem é o limite do que a extensão guarda: um token
 * curto, descartado antes de vencer. Nada de senha, nada de refresh token.
 */
import { FOLGA_MS, expiracaoDoJwt, tokenUtil } from './token';

const AGORA = 1_800_000_000_000;

/** JWT de mentira: só o payload importa, a assinatura quem valida é o servidor. */
function jwt(payload: Record<string, unknown>): string {
  const b64 = (o: unknown) =>
    Buffer.from(JSON.stringify(o)).toString('base64').replace(/=+$/, '');
  return `${b64({ alg: 'RS256' })}.${b64(payload)}.assinatura`;
}

describe('token ainda serve?', () => {
  it('vale enquanto falta mais que a folga', () => {
    const g = { token: 'abc', expiraEm: AGORA + 10 * 60_000 };
    expect(tokenUtil(g, AGORA)).toBe('abc');
  });

  it('e descartado antes de vencer, nao no vencimento', () => {
    // Um token que expira durante a chamada volta 401 e a análise se perde.
    const quaseLa = { token: 'abc', expiraEm: AGORA + FOLGA_MS - 1 };
    expect(tokenUtil(quaseLa, AGORA)).toBeNull();
  });

  it('vencido nao serve', () => {
    expect(tokenUtil({ token: 'abc', expiraEm: AGORA - 1 }, AGORA)).toBeNull();
  });

  it('ausente ou malformado nao serve', () => {
    expect(tokenUtil(null, AGORA)).toBeNull();
    expect(tokenUtil(undefined, AGORA)).toBeNull();
    expect(tokenUtil({ token: '', expiraEm: AGORA + 60_000 }, AGORA)).toBeNull();
    expect(tokenUtil({ token: 'abc', expiraEm: NaN }, AGORA)).toBeNull();
  });
});

describe('validade lida do proprio token', () => {
  it('le o exp do JWT, em milissegundos', () => {
    const exp = Math.floor(AGORA / 1000) + 3600;
    expect(expiracaoDoJwt(jwt({ exp }))).toBe(exp * 1000);
  });

  it('token sem exp nao e tratado como eterno', () => {
    // Zero faz `tokenUtil` recusar, que é o lado seguro do erro.
    expect(expiracaoDoJwt(jwt({ sub: 'alguem' }))).toBe(0);
    expect(tokenUtil({ token: 'x', expiraEm: expiracaoDoJwt(jwt({})) }, AGORA)).toBeNull();
  });

  it('lixo no lugar do token nao derruba a extensao', () => {
    expect(expiracaoDoJwt('')).toBe(0);
    expect(expiracaoDoJwt('nada-disso')).toBe(0);
    expect(expiracaoDoJwt('a.b.c')).toBe(0);
  });
});
