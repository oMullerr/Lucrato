/** Constantes de aplicação */
export const APP = {
  name: 'Lucrato',
  version: '1.0.0',
  storageKey: 'ml-gestao-db',
  themeKey: 'ml-gestao-theme',
  initialDbUrl: 'db.json',
} as const;

/** Paleta de cores para gráficos */
export interface ChartPalette {
  green: string;
  red: string;
  amber: string;
  blue: string;
  teal: string;
  purple: string;
  orange: string;
  text: string;
  textSec: string;
  grid: string;
}

/** Cores funcionais usadas em gráficos (espelham CSS vars) */
export const CHART_COLORS: { light: ChartPalette; dark: ChartPalette } = {
  light: {
    green: '#059669',
    red: '#DC2626',
    amber: '#D97706',
    blue: '#4338CA',
    teal: '#0D9488',
    purple: '#7C3AED',
    orange: '#EA580C',
    text: '#1A1827',
    textSec: '#6B7280',
    grid: '#E5E7EB',
  },
  dark: {
    green: '#34D399',
    red: '#F87171',
    amber: '#FBBF24',
    blue: '#818CF8',
    teal: '#2DD4BF',
    purple: '#A78BFA',
    orange: '#FB923C',
    text: '#E8EAFF',
    textSec: '#7C85B0',
    grid: '#1E2544',
  },
};
