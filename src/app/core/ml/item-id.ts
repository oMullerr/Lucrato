/**
 * Reconhece o código de um anúncio do Mercado Livre no que o usuário colar.
 *
 * Módulo puro compartilhado com as Cloud Functions: a tela usa para habilitar o
 * botão e o servidor usa para buscar de verdade, sem as duas pontas discordarem
 * sobre o que é um código válido.
 */

/**
 * Aceita o código puro (`MLB4931831037`), o formato da URL (`MLB-4931831037`)
 * e o link inteiro, em qualquer um dos domínios do Mercado Livre.
 *
 * Devolve string vazia quando não encontra nada — quem chama decide o que
 * dizer ao usuário.
 */
export function extrairItemId(entrada: string): string {
  const texto = (entrada ?? '').trim();
  if (!texto) return '';

  // Sites do Mercado Livre usam prefixos de duas letras por país (MLB, MLA…).
  const m = /\b(ML[A-Z])-?(\d{6,})\b/i.exec(texto);
  if (!m) return '';

  return `${m[1].toUpperCase()}${m[2]}`;
}

/** `true` quando o texto contém um anúncio reconhecível. */
export function pareceItemDoMl(entrada: string): boolean {
  return extrairItemId(entrada) !== '';
}
