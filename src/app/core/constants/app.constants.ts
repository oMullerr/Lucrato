export const APP = {
  name: 'Lucrato',
  version: '1.0.0',
  themeKey: 'ml-gestao-theme',
  langKey: 'ml-gestao-lang',
} as const;

/** Cor padrão de uma categoria sem cor cadastrada (cor da marca). */
export const DEFAULT_CATEGORY_COLOR = '#0A6E5C';

/**
 * Paleta de cores para gráficos — espelha os tokens semânticos do design system.
 *
 * Os aliases legados (green/red/amber/blue/teal/purple/orange) foram removidos
 * em setembro/2026: a Dashboard já usava os nomes semânticos havia tempo, e as
 * sete cores duplicadas em dois temas só existiam esperando uma migração que já
 * tinha acontecido.
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

/** Cores funcionais usadas em gráficos (espelham CSS vars) */
export const CHART_COLORS: { light: ChartPalette; dark: ChartPalette } = {
  light: {
    brand:      '#0B6B59',
    brandSoft:  '#2BAE96',
    accent:     '#B08A45',
    success:    '#137A46',
    danger:     '#C03530',
    warning:    '#B45309',
    info:       '#2563EB',
    neutral:    '#64716B',
    text:       '#0C0D0C',
    textSec:    '#5F6660',
    grid:       'rgba(18, 38, 30, 0.07)',
    surface:    '#FFFFFF',
  },
  dark: {
    brand:      '#2BAE96',
    brandSoft:  '#5BC6B0',
    accent:     '#E8C77B',
    success:    '#4BC488',
    danger:     '#E8736C',
    warning:    '#E8B54E',
    info:       '#6EA8DE',
    neutral:    '#93A39C',
    text:       '#F2F7F4',
    textSec:    '#A8B3AE',
    grid:       'rgba(226, 240, 234, 0.07)',
    surface:    '#101614',
  },
};
