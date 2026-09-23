/**
 * A paleta de reserva dos gráficos contra a verdade dos tokens.
 *
 * O Chart.js precisa de valor concreto, então a paleta é lida do CSS em tempo
 * de execução — mas em jsdom não há folha de estilo, e nenhum teste de gráfico
 * enxergaria uma reserva errada. Fora do navegador ela é a única fonte, e
 * cópia de paleta é a coisa que mais silenciosamente diverge: ninguém percebe
 * que o gráfico ficou na cor velha.
 *
 * Este teste lê `_tokens.scss` e compara valor a valor. Trocar um token sem
 * atualizar a reserva quebra aqui, com o nome do token e os dois valores.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PALETA_RESERVA, type ChartPalette } from './app.constants';

/** Mesmo mapa que `app.constants.ts` usa — repetido de propósito: se ele mudar
    lá sem mudar aqui, o teste tem de notar. */
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

/** Extrai as custom properties de um bloco do SCSS, casando chaves. */
function blocoDe(texto: string, abertura: string): Record<string, string> {
  const inicio = texto.indexOf(abertura);
  if (inicio < 0) throw new Error(`bloco não encontrado: ${abertura}`);

  let i = texto.indexOf('{', inicio);
  const comeco = i;
  let nivel = 0;
  for (; i < texto.length; i++) {
    if (texto[i] === '{') nivel++;
    else if (texto[i] === '}' && --nivel === 0) break;
  }

  const tokens: Record<string, string> = {};
  for (const m of texto.slice(comeco + 1, i).matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    tokens[m[1]] = m[2].trim();
  }
  return tokens;
}

const scss = readFileSync(join(process.cwd(), 'src/styles/_tokens.scss'), 'utf8');
const claro = blocoDe(scss, ':root');
const escuro = { ...claro, ...blocoDe(scss, '@mixin escuro') };

describe('a paleta de reserva dos gráficos', () => {
  it.each(Object.keys(TOKENS) as (keyof ChartPalette)[])(
    'claro: %s bate com o token',
    (chave) => {
      expect(PALETA_RESERVA.light[chave].toLowerCase()).toBe(claro[TOKENS[chave]].toLowerCase());
    },
  );

  it.each(Object.keys(TOKENS) as (keyof ChartPalette)[])(
    'escuro: %s bate com o token',
    (chave) => {
      expect(PALETA_RESERVA.dark[chave].toLowerCase()).toBe(escuro[TOKENS[chave]].toLowerCase());
    },
  );

  it('o tema escuro redefine TODO token que a paleta usa', () => {
    /* Um token que só existe no claro passaria despercebido: a reserva escura
       herdaria o valor claro e o gráfico ficaria com cor de tema errado. */
    const soNoClaro = (Object.keys(TOKENS) as (keyof ChartPalette)[])
      .filter((c) => !blocoDe(scss, '@mixin escuro')[TOKENS[c]]);
    expect(soNoClaro).toEqual([]);
  });
});
