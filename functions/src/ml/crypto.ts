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
 *
 * ATÉ SETEMBRO/2026 ESTA FUNÇÃO ACEITAVA QUALQUER `*.vercel.app`. A exploração
 * era limitada (o destino só recebe `?ml=ok|erro`, nunca o `code`), mas a regra
 * dizia "confio em todo site hospedado na Vercel" — e a Vercel hospeda o mundo.
 * Uma regra frouxa sobrevive à razão que a tornou inofensiva: basta alguém
 * acrescentar um dado ao redirecionamento, um ano depois, sem reler isto aqui.
 *
 * Agora todo destino remoto precisa estar escrito em `APP_ORIGINS`. Uma entrada
 * pode ser uma origem exata (`https://lucrato.vercel.app`) ou, para os previews,
 * um curinga de UM rótulo à esquerda (`https://*.lucrato.vercel.app`). O curinga
 * nunca casa com o domínio-pai nem atravessa ponto, então `*.vercel.app`
 * continua sem cobrir `atacante.vercel.app`... porque ninguém deveria escrever
 * `*.vercel.app` — e se escrever, está declarando isso por extenso, e não
 * herdando de um `endsWith` esquecido.
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

  return extraOrigins.some((origin) => casaComOrigem(hostname, origin));
}

/** Um host casa com a entrada da lista? Exata, ou curinga de um rótulo só. */
function casaComOrigem(hostname: string, entrada: string): boolean {
  const cru = entrada.trim();
  if (!cru) return false;

  // `https://*.exemplo.com` — o `URL` não parseia curinga, então ele sai antes.
  const curinga = /^(?:https?:\/\/)?\*\.(.+)$/.exec(cru);
  if (curinga) {
    const base = curinga[1].replace(/\/.*$/, '').toLowerCase();
    if (!base || !base.includes('.')) return false;
    const sufixo = `.${base}`;
    if (!hostname.endsWith(sufixo)) return false;
    // Exatamente um rótulo à esquerda: `a.b.exemplo.com` não casa `*.exemplo.com`.
    const rotulo = hostname.slice(0, -sufixo.length);
    return rotulo.length > 0 && !rotulo.includes('.');
  }

  try {
    return new URL(cru).hostname.toLowerCase() === hostname.toLowerCase();
  } catch {
    return false;
  }
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
