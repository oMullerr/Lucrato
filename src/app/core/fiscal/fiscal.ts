import { ComputedSale } from '../models/models';
import {
  FiscalBand,
  FiscalConfig,
  FiscalMonthRevenue,
  FiscalStatus,
  DasMonth,
  DasMonthStatus,
  DasnReminder,
  DasnStatus,
} from './fiscal.model';
import { regimeRule } from './fiscal-regimes';

/** Formata uma data (UTC) como 'yyyy-MM-dd'. */
function toIsoDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** Vendas que contam como faturamento: concluídas (mesma base de Dashboard/Análises). */
function billableSales(sales: ComputedSale[]): ComputedSale[] {
  return sales.filter(s => s.status === 'Concluída');
}

/** Soma da receita bruta das vendas concluídas no ano informado. */
export function annualGrossRevenue(sales: ComputedSale[], year: number): number {
  return billableSales(sales).reduce((sum, s) => {
    return new Date(s.saleDate).getUTCFullYear() === year ? sum + s.grossRevenue : sum;
  }, 0);
}

/** Receita bruta por mês (índices 0..11) das vendas concluídas no ano. */
export function monthlyGrossRevenue(sales: ComputedSale[], year: number): FiscalMonthRevenue[] {
  const buckets = Array.from({ length: 12 }, (_, month) => ({ month, revenue: 0 }));
  for (const s of billableSales(sales)) {
    const d = new Date(s.saleDate);
    if (d.getUTCFullYear() !== year) continue;
    buckets[d.getUTCMonth()].revenue += s.grossRevenue;
  }
  return buckets;
}

/** Início do regime parseado (ou null se ausente/ inválido). */
function parseStart(startDate: string | undefined): { year: number; month: number } | null {
  if (!startDate) return null;
  const d = new Date(startDate);
  if (Number.isNaN(d.getTime())) return null;
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() };
}

/**
 * Meses ativos no regime dentro do ano (dirige o teto proporcional do 1º ano).
 * Sem data de início → ano cheio (12). No ano de abertura → meses do mês de início até dezembro.
 */
export function monthsActiveInYear(startDate: string | undefined, year: number): number {
  const start = parseStart(startDate);
  if (!start) return 12;
  if (year < start.year) return 0;
  if (year > start.year) return 12;
  return 12 - start.month;
}

/** Anos com faturamento (∪ ano de referência), em ordem decrescente. */
export function availableYears(sales: ComputedSale[], ref: Date = new Date()): number[] {
  const years = new Set<number>([ref.getUTCFullYear()]);
  for (const s of billableSales(sales)) {
    years.add(new Date(s.saleDate).getUTCFullYear());
  }
  return [...years].sort((a, b) => b - a);
}

function bandOf(revenue: number, ceiling: number, warnAt: number, dangerAt: number): FiscalBand {
  if (revenue > ceiling) return 'over';
  const pct = ceiling > 0 ? revenue / ceiling : 0;
  if (pct >= dangerAt) return 'danger';
  if (pct >= warnAt) return 'warning';
  return 'ok';
}

/**
 * Projeção anual por run-rate **mensal** (limitado). Só para o ano corrente; anos passados
 * retornam o valor final. O multiplicador fica entre 1 e os meses ativos no ano, então a
 * projeção nunca cai abaixo da receita atual nem explode (ex.: início do regime = hoje).
 */
function projectAnnual(
  revenue: number,
  year: number,
  startMonthInYear: number | null,
  ref: Date,
): number {
  if (year !== ref.getUTCFullYear()) return revenue;
  const startMonth = startMonthInYear ?? 0;
  const activeMonths = 12 - startMonth;
  const elapsedMonths = Math.min(activeMonths, Math.max(1, ref.getUTCMonth() - startMonth + 1));
  return (revenue / elapsedMonths) * activeMonths;
}

/**
 * Estima quando o teto é atingido no ritmo mensal atual.
 * Retorna `hits=true, date=null` se já atingiu; `date` preenchido se atinge dentro do ano;
 * `hits=false, date=null` se não atinge este ano, sem receita, ou é ano passado.
 */
function forecastCeilingHit(
  revenue: number,
  ceiling: number,
  year: number,
  startMonthInYear: number | null,
  ref: Date,
): { hits: boolean; date: string | null } {
  if (revenue >= ceiling) return { hits: true, date: null };
  if (year !== ref.getUTCFullYear()) return { hits: false, date: null };
  const startMonth = startMonthInYear ?? 0;
  const elapsedMonths = Math.max(1, ref.getUTCMonth() - startMonth + 1);
  const monthlyRunRate = revenue / elapsedMonths;
  if (monthlyRunRate <= 0) return { hits: false, date: null };
  const monthsToHit = (ceiling - revenue) / monthlyRunRate;
  const hit = new Date(Date.UTC(year, ref.getUTCMonth(), ref.getUTCDate()));
  hit.setUTCMonth(hit.getUTCMonth() + Math.ceil(monthsToHit));
  if (hit.getUTCFullYear() > year) return { hits: false, date: null };
  return { hits: true, date: toIsoDate(hit) };
}

/**
 * Calcula o status fiscal de um regime para um ano.
 * @param year ano-calendário a avaliar.
 * @param ref  data de referência (default = hoje) — usada para a projeção do ano corrente.
 */
export function computeFiscalStatus(
  config: FiscalConfig,
  sales: ComputedSale[],
  year: number,
  ref: Date = new Date(),
): FiscalStatus {
  const revenue = annualGrossRevenue(sales, year);
  const monthly = monthlyGrossRevenue(sales, year);
  const rule = regimeRule(config.regime);

  if (!rule) {
    return {
      regime: config.regime,
      year,
      revenue,
      ceiling: 0,
      fullCeiling: 0,
      isProportional: false,
      monthsActive: 0,
      usagePct: 0,
      remaining: 0,
      overBy: 0,
      band: 'ok',
      toleranceCeiling: 0,
      projectedAnnual: revenue,
      projectedHitsCeiling: false,
      ceilingHitDate: null,
      monthly,
      monthlyAvgLimit: 0,
      tax: undefined,
    };
  }

  const start = parseStart(config.regimeStartDate);
  const monthsActive = monthsActiveInYear(config.regimeStartDate, year);
  const isProportional = !!start && start.year === year && monthsActive < 12;
  const fullCeiling = rule.annualCeiling;
  const ceiling = isProportional ? rule.monthlyProportional * monthsActive : fullCeiling;
  const toleranceCeiling = ceiling * (1 + rule.tolerancePct);

  const startMonthInYear = start?.year === year ? start.month : null;
  const forecast = forecastCeilingHit(revenue, ceiling, year, startMonthInYear, ref);

  return {
    regime: config.regime,
    year,
    revenue,
    ceiling,
    fullCeiling,
    isProportional,
    monthsActive,
    usagePct: ceiling > 0 ? revenue / ceiling : 0,
    remaining: Math.max(0, ceiling - revenue),
    overBy: Math.max(0, revenue - ceiling),
    band: bandOf(revenue, ceiling, rule.bands.warnAt, rule.bands.dangerAt),
    toleranceCeiling,
    projectedAnnual: projectAnnual(revenue, year, startMonthInYear, ref),
    projectedHitsCeiling: forecast.hits,
    ceilingHitDate: forecast.date,
    monthly,
    monthlyAvgLimit: rule.monthlyProportional,
    tax: rule.estimateMonthlyTax?.(config.activity),
  };
}

/**
 * Agenda do DAS por mês do ano. `amount` = DAS estimado do regime; meses anteriores ao
 * início (1º ano) ficam `inactive`. Vencimento = dia 20 do mês seguinte à competência.
 */
export function dasSchedule(
  config: FiscalConfig,
  year: number,
  paidMonths: string[],
  ref: Date = new Date(),
): DasMonth[] {
  const rule = regimeRule(config.regime);
  const amount = rule?.estimateMonthlyTax?.(config.activity).total ?? 0;
  const paid = new Set(paidMonths);
  const start = parseStart(config.regimeStartDate);

  let inactiveBefore = 0; // meses [0, inactiveBefore) ficam inativos
  if (!rule) inactiveBefore = 12;
  else if (start) {
    if (year < start.year) inactiveBefore = 12;
    else if (year === start.year) inactiveBefore = start.month;
  }

  const refTime = ref.getTime();
  return Array.from({ length: 12 }, (_, month) => {
    const periodKey = `${year}-${String(month + 1).padStart(2, '0')}`;
    const due = new Date(Date.UTC(year, month + 1, 20)); // dia 20 do mês seguinte
    let status: DasMonthStatus;
    if (month < inactiveBefore) {
      status = 'inactive';
    } else if (paid.has(periodKey)) {
      status = 'paid';
    } else if (refTime > due.getTime()) {
      status = 'overdue';
    } else {
      status = refTime >= Date.UTC(year, month, 1) ? 'pending' : 'upcoming';
    }
    return { month, periodKey, dueDate: toIsoDate(due), status, amount };
  });
}

/**
 * Lembrete da DASN-SIMEI do ano-base. Prazo = 31/05 do ano seguinte; janela abre em 01/01.
 */
export function dasnReminder(
  baseYear: number,
  declaredYears: number[],
  ref: Date = new Date(),
): DasnReminder {
  const deadline = new Date(Date.UTC(baseYear + 1, 4, 31)); // 31 de maio
  let status: DasnStatus;
  if (declaredYears.includes(baseYear)) {
    status = 'declared';
  } else {
    const refTime = ref.getTime();
    if (refTime < Date.UTC(baseYear + 1, 0, 1)) status = 'upcoming';
    else if (refTime > deadline.getTime()) status = 'overdue';
    else status = 'open';
  }
  return { baseYear, deadline: toIsoDate(deadline), status };
}
