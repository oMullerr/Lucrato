import {
  FiscalActivity,
  FiscalConfig,
  FiscalRegimeId,
  FiscalRegimeRule,
  FiscalTaxBreakdown,
} from './fiscal.model';

/*
 * Constantes legais — CONFERIR ANUALMENTE, mudam por lei/decreto.
 * Fonte: Portal do Empreendedor / Receita Federal.
 */

/** Salário mínimo vigente (base do INSS no DAS-MEI). Atualizar a cada reajuste. */
export const MINIMUM_WAGE_BRL = 1621; // 2026 — Decreto nº 12.797/2025 (DOU 24/12/2025). Conferido em 12/06/2026.

/** Alíquota de INSS do MEI sobre o salário mínimo. */
export const MEI_INSS_RATE = 0.05;
/** Adicional fixo de ICMS (comércio/indústria) no DAS-MEI. */
export const MEI_ICMS_BRL = 1;
/** Adicional fixo de ISS (serviços) no DAS-MEI. */
export const MEI_ISS_BRL = 5;

/** DAS mensal estimado do MEI conforme a atividade. */
function meiMonthlyTax(activity: FiscalActivity): FiscalTaxBreakdown {
  const inss = Math.round(MINIMUM_WAGE_BRL * MEI_INSS_RATE * 100) / 100;
  const icms = activity === 'commerce' || activity === 'mixed' ? MEI_ICMS_BRL : 0;
  const iss = activity === 'services' || activity === 'mixed' ? MEI_ISS_BRL : 0;
  return { inss, icms, iss, total: inss + icms + iss };
}

/** Regra do MEI. */
export const MEI_RULE: FiscalRegimeRule = {
  id: 'MEI',
  labelKey: 'fiscal.regime.MEI',
  annualCeiling: 81_000,
  monthlyProportional: 6_750,
  tolerancePct: 0.20,
  bands: { warnAt: 0.5, dangerAt: 0.8 },
  estimateMonthlyTax: meiMonthlyTax,
};

/**
 * Registry de regimes. Adicionar um novo regime = adicionar uma `FiscalRegimeRule` aqui.
 * `null` = sem controle de limite (regime não configurado).
 */
export const FISCAL_REGIMES: Record<FiscalRegimeId, FiscalRegimeRule | null> = {
  MEI: MEI_RULE,
  none: null,
};

/** Config padrão para usuários novos / sem config salva. */
export const DEFAULT_FISCAL_CONFIG: FiscalConfig = {
  regime: 'MEI',
  activity: 'commerce',
};

/** Resolve a regra de um regime (ou null quando inexistente). */
export function regimeRule(id: FiscalRegimeId): FiscalRegimeRule | null {
  return FISCAL_REGIMES[id] ?? null;
}
