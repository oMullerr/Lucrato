/**
 * Modelo do motor fiscal genérico.
 *
 * Separa **dado do usuário** (`FiscalConfig`, persistido no Firestore) da **regra legal**
 * (`FiscalRegimeRule`, versionada em código). Hoje só MEI está implementado; a estrutura
 * comporta adicionar Simples Nacional / Lucro Presumido sem reescrever a página.
 */

/** Regimes suportados. Extensível: 'SimplesNacional' | 'LucroPresumido'. */
export type FiscalRegimeId = 'MEI' | 'none';

/** Tipo de atividade — afeta o adicional do DAS (ICMS para comércio, ISS para serviço). */
export type FiscalActivity = 'commerce' | 'services' | 'mixed';

/** Banda de uso do limite — dirige a cor/severidade na UI. */
export type FiscalBand = 'ok' | 'warning' | 'danger' | 'over';

/**
 * Configuração fiscal do usuário. Persistida em `settings.fiscal` no doc
 * `users/{uid}/db/main`.
 */
export interface FiscalConfig {
  regime: FiscalRegimeId;
  /** Data (yyyy-MM-dd) de início no regime. Dirige o limite proporcional do 1º ano. */
  regimeStartDate?: string;
  activity: FiscalActivity;
}

/** Detalhamento da estimativa de imposto mensal (DAS no MEI). */
export interface FiscalTaxBreakdown {
  /** INSS (5% do salário mínimo no MEI). */
  inss: number;
  /** ICMS — adicional fixo de comércio/indústria. */
  icms: number;
  /** ISS — adicional fixo de serviços. */
  iss: number;
  total: number;
}

/**
 * Regra legal de um regime. **Mora em código** (não nos dados do usuário) porque muda por lei.
 * Valores como teto e salário mínimo devem ser conferidos anualmente.
 */
export interface FiscalRegimeRule {
  id: FiscalRegimeId;
  /** Chave i18n do nome do regime. */
  labelKey: string;
  /** Teto anual de receita bruta (ex.: 81 000 no MEI). */
  annualCeiling: number;
  /** Limite mensal proporcional, usado no 1º ano parcial (ex.: 6 750 no MEI). */
  monthlyProportional: number;
  /** Tolerância acima do teto antes da penalidade retroativa (MEI: 0.20 = 20%). */
  tolerancePct: number;
  /** Limiares de alerta, como fração do teto (ascendente). */
  bands: { warnAt: number; dangerAt: number };
  /** Estimativa de imposto mensal, quando aplicável. */
  estimateMonthlyTax?(activity: FiscalActivity): FiscalTaxBreakdown;
}

/** Receita acumulada de um mês do ano. */
export interface FiscalMonthRevenue {
  /** 0 = janeiro … 11 = dezembro. */
  month: number;
  revenue: number;
}

/** Situação do DAS de um mês. */
export type DasMonthStatus =
  /** Quitado. */
  | 'paid'
  /** Em aberto, dentro do prazo (mês corrente/recente, antes do vencimento). */
  | 'pending'
  /** Vencido e não pago. */
  | 'overdue'
  /** Mês futuro — ainda não há o que pagar. */
  | 'upcoming'
  /** Fora do regime (antes do início, no 1º ano). */
  | 'inactive';

/** DAS de um mês do ano. */
export interface DasMonth {
  /** 0 = janeiro … 11 = dezembro. */
  month: number;
  /** Competência no formato 'YYYY-MM'. */
  periodKey: string;
  /** Vencimento (ISO yyyy-MM-dd) — dia 20 do mês seguinte. */
  dueDate: string;
  status: DasMonthStatus;
  /** Valor estimado do DAS no mês. */
  amount: number;
}

/** Situação da declaração anual (DASN-SIMEI). */
export type DasnStatus =
  /** Entregue. */
  | 'declared'
  /** Janela aberta (jan até 31/05 do ano seguinte), ainda não entregue. */
  | 'open'
  /** Prazo (31/05) vencido sem entrega. */
  | 'overdue'
  /** Ano-base ainda não fechou. */
  | 'upcoming';

/** Lembrete da DASN-SIMEI de um ano-base. */
export interface DasnReminder {
  /** Ano-calendário declarado. */
  baseYear: number;
  /** Prazo final (ISO yyyy-MM-dd) — 31/05 do ano seguinte. */
  deadline: string;
  status: DasnStatus;
}

/** Resultado do motor para um regime + ano. */
export interface FiscalStatus {
  regime: FiscalRegimeId;
  year: number;
  /** Receita bruta acumulada no ano. */
  revenue: number;
  /** Teto efetivo (proporcional quando 1º ano parcial). */
  ceiling: number;
  /** Teto anual nominal (sem proporcionalidade). */
  fullCeiling: number;
  /** true quando o teto foi calculado proporcionalmente ao 1º ano. */
  isProportional: boolean;
  /** Meses ativos no regime dentro do ano. */
  monthsActive: number;
  /** revenue / ceiling (0..∞). */
  usagePct: number;
  /** Quanto ainda cabe até o teto (>= 0). */
  remaining: number;
  /** Quanto passou do teto (>= 0). */
  overBy: number;
  band: FiscalBand;
  /** Teto × (1 + tolerância) — fronteira do desenquadramento retroativo. */
  toleranceCeiling: number;
  /** Projeção anual por run-rate (só ano corrente; senão = revenue). */
  projectedAnnual: number;
  /** true se, no ritmo atual, o faturamento atinge o teto ainda neste ano (ou já atingiu). */
  projectedHitsCeiling: boolean;
  /** Data estimada (ISO yyyy-MM-dd) em que o teto é atingido no ritmo atual; null se não se aplica. */
  ceilingHitDate: string | null;
  /** Receita por mês (0..11). */
  monthly: FiscalMonthRevenue[];
  /** Linha de referência mensal (= monthlyProportional). */
  monthlyAvgLimit: number;
  /** Estimativa de imposto mensal, quando o regime fornece. */
  tax?: FiscalTaxBreakdown;
}
