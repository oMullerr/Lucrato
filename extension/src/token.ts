/**
 * Guarda do token de acesso.
 *
 * A extensão NÃO tem conta própria e não guarda senha, nem refresh token, nem
 * o segredo do Mercado Livre. Ela pede ao Lucrato aberto no mesmo navegador um
 * token de identidade de curta duração e usa só isso — quem fala com o Mercado
 * Livre continua sendo a Cloud Function, com os tokens que já ficam no servidor.
 *
 * A consequência honesta desse desenho: sem o Lucrato aberto, a extensão não
 * consegue a comissão real. Ela então calcula com o percentual padrão e diz
 * que está estimando, em vez de mostrar um número como se fosse exato.
 *
 * Módulo puro: só decide se um token ainda serve.
 */

export interface TokenGuardado {
  token: string;
  /** Instante de expiração em milissegundos. */
  expiraEm: number;
}

/**
 * Margem de segurança antes do vencimento.
 *
 * Um token que expira durante a chamada volta 401 e a análise se perde. Um
 * minuto cobre a viagem até a function com folga.
 */
export const FOLGA_MS = 60_000;

/** Devolve o token enquanto ele ainda serve; `null` quando não serve mais. */
export function tokenUtil(
  guardado: TokenGuardado | null | undefined,
  agora: number,
  folgaMs = FOLGA_MS,
): string | null {
  if (!guardado || typeof guardado.token !== 'string' || !guardado.token) return null;
  if (!isFinite(guardado.expiraEm)) return null;
  return guardado.expiraEm - folgaMs > agora ? guardado.token : null;
}

/**
 * Validade de um JWT, lida do próprio token.
 *
 * Confiar num prazo informado por quem manda o token deixaria a extensão
 * guardando um token vencido caso a ponte errasse a conta. O `exp` do JWT é a
 * única fonte que o servidor vai respeitar de fato.
 *
 * Sem verificar assinatura de propósito: quem valida é a Cloud Function. Aqui
 * só se decide quando pedir outro.
 */
export function expiracaoDoJwt(token: string): number {
  const partes = (token ?? '').split('.');
  if (partes.length < 2) return 0;

  try {
    const base64 = partes[1].replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(atob(base64)) as { exp?: unknown };
    const exp = Number(payload.exp);
    return isFinite(exp) && exp > 0 ? exp * 1000 : 0;
  } catch {
    return 0;
  }
}
