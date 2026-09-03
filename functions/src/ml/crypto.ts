/**
 * Peças puras do fluxo OAuth: PKCE, `state` e validação do destino de volta.
 *
 * Ficam separadas de qualquer I/O para poderem ser testadas sem rede, sem
 * Firestore e sem emulador.
 */
import { createHash, randomBytes } from 'node:crypto';

/** Codificação base64url (RFC 7636), sem padding. */
export function base64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** `code_verifier` do PKCE: 43 a 128 caracteres do alfabeto permitido. */
export function newCodeVerifier(): string {
  return base64url(randomBytes(48));
}

/** `code_challenge` = base64url(SHA-256(code_verifier)), método S256. */
export function codeChallengeOf(verifier: string): string {
  return base64url(createHash('sha256').update(verifier).digest());
}

/** Identificador aleatório do fluxo, usado como chave do documento de estado. */
export function newState(): string {
  return randomBytes(24).toString('hex');
}

/**
 * Destinos válidos para o retorno depois da autorização.
 *
 * O `returnTo` é gravado no início do fluxo, por um usuário já autenticado, e
 * relido no callback — nunca vem da query string do callback. Ainda assim é
 * validado contra uma lista, para não virar um redirecionador aberto.
 */
export function isAllowedReturnTo(url: string, extraOrigins: readonly string[] = []): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }

  const { protocol, hostname } = parsed;
  const local = hostname === 'localhost' || hostname === '127.0.0.1';

  if (protocol !== 'https:' && !(protocol === 'http:' && local)) return false;
  if (local) return true;
  if (hostname === 'vercel.app') return false;
  if (hostname.endsWith('.vercel.app')) return true;

  return extraOrigins.some((origin) => {
    try {
      return new URL(origin).hostname === hostname;
    } catch {
      return false;
    }
  });
}

/**
 * Espera do backoff exponencial com jitter, em milissegundos.
 * Base dobra a cada tentativa e o jitter evita que várias chamadas voltem
 * juntas depois de um 429.
 */
export function backoffDelayMs(attempt: number, baseMs = 500, maxMs = 30_000): number {
  const exponencial = Math.min(maxMs, baseMs * 2 ** attempt);
  return Math.round(exponencial / 2 + Math.random() * (exponencial / 2));
}
