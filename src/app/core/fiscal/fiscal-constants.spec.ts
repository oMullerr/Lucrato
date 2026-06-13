/*
 * Trava de valores legais — valores LITERAIS conferidos contra fontes oficiais.
 *
 * Conferido em 12/06/2026:
 * - Salário mínimo 2026: R$ 1.621,00 (Decreto nº 12.797/2025, DOU 24/12/2025).
 * - DAS-MEI 2026: INSS R$ 81,05 (5% do mínimo) + ICMS R$ 1,00 (comércio) / ISS R$ 5,00 (serviços).
 *   Comércio R$ 82,05 · Serviços R$ 86,05 · Misto R$ 87,05.
 * - Teto MEI: R$ 81.000/ano (R$ 6.750/mês) — inalterado desde 2018; PLP 108/21 (R$ 130 mil) NÃO sancionado.
 * - Tolerância de excesso: 20% (desenquadramento retroativo acima disso).
 *
 * Se este spec quebrar, a lei mudou: atualizar fiscal-regimes.ts E os literais abaixo.
 */
import {
  MEI_ICMS_BRL,
  MEI_INSS_RATE,
  MEI_ISS_BRL,
  MEI_RULE,
  MINIMUM_WAGE_BRL,
  regimeRule,
} from './fiscal-regimes';

describe('Constantes legais MEI (valores literais 2026)', () => {
  it('salário mínimo 2026 = R$ 1.621,00', () => {
    expect(MINIMUM_WAGE_BRL).toBe(1621);
  });

  it('alíquotas e adicionais fixos do DAS', () => {
    expect(MEI_INSS_RATE).toBe(0.05);
    expect(MEI_ICMS_BRL).toBe(1);
    expect(MEI_ISS_BRL).toBe(5);
  });

  it('DAS mensal 2026 — comércio: INSS 81,05 + ICMS 1,00 = R$ 82,05', () => {
    const tax = MEI_RULE.estimateMonthlyTax!('commerce');
    expect(tax.inss).toBe(81.05);
    expect(tax.icms).toBe(1);
    expect(tax.iss).toBe(0);
    expect(tax.total).toBeCloseTo(82.05, 10);
  });

  it('DAS mensal 2026 — serviços: INSS 81,05 + ISS 5,00 = R$ 86,05', () => {
    const tax = MEI_RULE.estimateMonthlyTax!('services');
    expect(tax.inss).toBe(81.05);
    expect(tax.icms).toBe(0);
    expect(tax.iss).toBe(5);
    expect(tax.total).toBeCloseTo(86.05, 10);
  });

  it('DAS mensal 2026 — misto: INSS 81,05 + ICMS 1,00 + ISS 5,00 = R$ 87,05', () => {
    const tax = MEI_RULE.estimateMonthlyTax!('mixed');
    expect(tax.total).toBeCloseTo(87.05, 10);
  });

  it('teto anual R$ 81.000 e proporcional mensal R$ 6.750', () => {
    expect(MEI_RULE.annualCeiling).toBe(81_000);
    expect(MEI_RULE.monthlyProportional).toBe(6_750);
    expect(MEI_RULE.monthlyProportional * 12).toBe(MEI_RULE.annualCeiling);
  });

  it('tolerância de 20% antes do desenquadramento retroativo', () => {
    expect(MEI_RULE.tolerancePct).toBe(0.20);
  });

  it('bandas de alerta: aviso a 50%, perigo a 80% do teto', () => {
    expect(MEI_RULE.bands.warnAt).toBe(0.5);
    expect(MEI_RULE.bands.dangerAt).toBe(0.8);
  });

  it('registry resolve MEI e devolve null para "none"', () => {
    expect(regimeRule('MEI')).toBe(MEI_RULE);
    expect(regimeRule('none')).toBeNull();
  });
});
