export const APP = {
  name: 'Lucrato',
  version: '1.0.0',
  themeKey: 'ml-gestao-theme',
  langKey: 'ml-gestao-lang',
} as const;

/**
 * Cor padrão de uma categoria sem cor cadastrada.
 *
 * Lida do token da marca em tempo de execução, então acompanha o tema e nunca
 * mais precisa ser reescrita à mão — até setembro/2026 era um hex fixo que não
 * batia com token nenhum, nem com a marca clara nem com a escura.
 */
export function defaultCategoryColor(): string {
  return tokenOu('--brand-primary', PALETA_RESERVA.light.brand);
}

/**
 * Paleta de cores para gráficos.
 *
 * O Chart.js precisa de valor concreto na hora de montar o gráfico, então a
 * paleta é LIDA DO CSS em tempo de execução, do mesmo `:root`/`html.dark` que
 * pinta o resto do app. Antes era uma cópia à mão dos hexes dos tokens, em
 * dois temas — e cópia à mão de paleta é a coisa que mais silenciosamente
 * diverge: ninguém percebe que o gráfico ficou na cor velha.
 *
 * A tabela de reserva abaixo só é usada onde não há CSS aplicado (teste em
 * jsdom, renderização no servidor). `app.constants.spec.ts` compara essa
 * tabela com `_tokens.scss` e falha quando as duas discordam, então nem a
 * reserva envelhece sozinha.
 */
export interface ChartPalette {
  /* Semânticas */
  brand: string;
  brandSoft: string;
  accent: string;
  success: string;
  danger: string;
  warning: string;
  info: string;
  neutral: string;
  /* Comuns a qualquer gráfico */
  text: string;
  textSec: string;
  grid: string;
  surface: string;
}

/** Token CSS que alimenta cada entrada da paleta. */
const TOKENS: Record<keyof ChartPalette, string> = {
  brand:      '--brand-primary',
  brandSoft:  '--brand-primary-3',
  accent:     '--brand-accent',
  success:    '--color-success',
  danger:     '--color-danger',
  warning:    '--color-warning',
  info:       '--color-info',
  neutral:    '--color-neutral',
  text:       '--text-primary',
  textSec:    '--text-muted',
  grid:       '--border-subtle',
  surface:    '--bg-surface-1',
};

/** Valores de reserva, conferidos contra `_tokens.scss` por teste. */
export const PALETA_RESERVA: { light: ChartPalette; dark: ChartPalette } = {
  light: {
    brand:      '#1D5BA6',
    brandSoft:  '#4A87CC',
    accent:     '#A07B2E',
    success:    '#0C7152',
    danger:     '#B23324',
    warning:    '#8A5D00',
    info:       '#6D4AA8',
    neutral:    '#5D636B',
    text:       '#14161A',
    textSec:    '#5F656D',
    grid:       'rgba(20, 22, 26, 0.07)',
    surface:    '#FFFFFF',
  },
  dark: {
    brand:      '#6BA6E8',
    brandSoft:  '#A9CBF3',
    accent:     '#E0C177',
    success:    '#3FCFA0',
    danger:     '#FF8A7A',
    warning:    '#E8B84B',
    info:       '#B39DDB',
    neutral:    '#98A1AB',
    text:       '#EDEFF2',
    textSec:    '#8D96A0',
    grid:       'rgba(232, 238, 245, 0.08)',
    surface:    '#191C20',
  },
};

/** Valor de um token CSS, ou a reserva quando não há folha de estilo. */
function tokenOu(nome: string, reserva: string): string {
  const raiz = globalThis.document?.documentElement;
  if (!raiz || typeof getComputedStyle !== 'function') return reserva;
  const valor = getComputedStyle(raiz).getPropertyValue(nome).trim();
  return valor || reserva;
}

/**
 * A paleta do tema em vigor.
 *
 * Recebe `escuro` só para escolher a reserva certa: quando o CSS está
 * aplicado, a classe `html.dark` já resolveu tudo e o parâmetro não é usado.
 */
export function paletaDeGrafico(escuro: boolean): ChartPalette {
  const reserva = escuro ? PALETA_RESERVA.dark : PALETA_RESERVA.light;
  const saida = {} as ChartPalette;
  for (const chave of Object.keys(TOKENS) as (keyof ChartPalette)[]) {
    saida[chave] = tokenOu(TOKENS[chave], reserva[chave]);
  }
  return saida;
}
