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
    green: '#16A34A',
    red: '#DC2626',
    amber: '#D97706',
    blue: '#2563EB',
    teal: '#0D9488',
    purple: '#9333EA',
    orange: '#EA580C',
    text: '#1A1D27',
    textSec: '#6B7280',
    grid: '#E5E7EB',
  },
  dark: {
    green: '#4ADE80',
    red: '#F87171',
    amber: '#FBBF24',
    blue: '#60A5FA',
    teal: '#2DD4BF',
    purple: '#C084FC',
    orange: '#FB923C',
    text: '#E8EAFF',
    textSec: '#8892B0',
    grid: '#2D3748',
  },
};
