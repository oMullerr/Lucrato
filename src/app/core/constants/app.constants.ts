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
 * Inclui aliases legados (green/red/amber/blue/teal/purple/orange) durante a
 * transição; serão removidos quando a Dashboard for migrada em Fase 4.
 */
export interface ChartPalette {
  /* New semantic */
  brand: string;
  brandSoft: string;
  accent: string;
  success: string;
  danger: string;
  warning: string;
  info: string;
  neutral: string;
  /* Common */
  text: string;
  textSec: string;
  grid: string;
  surface: string;
  /* Legacy aliases — TODO: migrar Dashboard pra nomes semânticos */
  green: string;
  red: string;
  amber: string;
  blue: string;
  teal: string;
  purple: string;
  orange: string;
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
    /* Legacy */
    green:      '#137A46',
    red:        '#C03530',
    amber:      '#B45309',
    blue:       '#2563EB',
    teal:       '#0B6B59',
    purple:     '#B08A45',
    orange:     '#B45309',
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
    /* Legacy */
    green:      '#4BC488',
    red:        '#E8736C',
    amber:      '#E8B54E',
    blue:       '#6EA8DE',
    teal:       '#2BAE96',
    purple:     '#E8C77B',
    orange:     '#E8B54E',
  },
};
