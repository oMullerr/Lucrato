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
    brand:      '#0A6E5C',
    brandSoft:  '#2BAE96',
    accent:     '#C9A35C',
    success:    '#16A34A',
    danger:     '#DC2626',
    warning:    '#D97706',
    info:       '#2563EB',
    neutral:    '#64748B',
    text:       '#0A0A0B',
    textSec:    '#71717A',
    grid:       'rgba(15, 23, 42, 0.06)',
    surface:    '#FFFFFF',
    /* Legacy */
    green:      '#16A34A',
    red:        '#DC2626',
    amber:      '#D97706',
    blue:       '#2563EB',
    teal:       '#0A6E5C',
    purple:     '#C9A35C',
    orange:     '#D97706',
  },
  dark: {
    brand:      '#2BAE96',
    brandSoft:  '#5BC6B0',
    accent:     '#E8C77B',
    success:    '#4ADE80',
    danger:     '#F87171',
    warning:    '#FBBF24',
    info:       '#60A5FA',
    neutral:    '#94A3B8',
    text:       '#F4F4F5',
    textSec:    '#A1A1AA',
    grid:       'rgba(255, 255, 255, 0.06)',
    surface:    '#0E0F12',
    /* Legacy */
    green:      '#4ADE80',
    red:        '#F87171',
    amber:      '#FBBF24',
    blue:       '#60A5FA',
    teal:       '#2BAE96',
    purple:     '#E8C77B',
    orange:     '#FBBF24',
  },
};
