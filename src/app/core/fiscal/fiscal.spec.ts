import {
  annualGrossRevenue,
  monthlyGrossRevenue,
  monthsActiveInYear,
  availableYears,
  computeFiscalStatus,
  dasSchedule,
  dasnReminder,
} from './fiscal';
import {
  MEI_RULE,
  MINIMUM_WAGE_BRL,
  MEI_INSS_RATE,
  DEFAULT_FISCAL_CONFIG,
} from './fiscal-regimes';
import { FiscalConfig } from './fiscal.model';
import { ComputedSale, SaleStatus } from '../models/models';

function makeComputedSale(overrides: Partial<ComputedSale> = {}): ComputedSale {
  const grossRevenue = overrides.grossRevenue ?? 1000;
  return {
    id: 'V001',
    batchId: 'C001',
    product: 'Produto A',
    quantitySold: 1,
    unitPrice: grossRevenue,
    saleDate: '2026-02-15',
    channel: 'Mercado Livre',
    feePercentage: 0.1,
    shippingType: 'correios',
    sellerShipping: 0,
    discount: 0,
    otherCosts: 0,
    status: 'Concluída' as SaleStatus,
    grossRevenue,
    feeAmount: 0,
    netRevenue: grossRevenue,
    actualUnitCost: 0,
    proportionalCost: 0,
    grossProfit: grossRevenue,
    netProfit: grossRevenue,
    netMargin: 1,
    ...overrides,
  };
}

const meiConfig = (overrides: Partial<FiscalConfig> = {}): FiscalConfig => ({
  ...DEFAULT_FISCAL_CONFIG,
  ...overrides,
});

describe('annualGrossRevenue', () => {
  it('soma apenas vendas concluídas do ano', () => {
    const sales = [
      makeComputedSale({ id: 'V1', grossRevenue: 1000, saleDate: '2026-01-10' }),
      makeComputedSale({ id: 'V2', grossRevenue: 2000, saleDate: '2026-12-31' }),
      makeComputedSale({ id: 'V3', grossRevenue: 9999, saleDate: '2025-06-01' }), // outro ano
    ];
    expect(annualGrossRevenue(sales, 2026)).toBe(3000);
    expect(annualGrossRevenue(sales, 2025)).toBe(9999);
  });

  it('ignora vendas Cancelada e Devolvida', () => {
    const sales = [
      makeComputedSale({ id: 'V1', grossRevenue: 1000, status: 'Concluída' }),
      makeComputedSale({ id: 'V2', grossRevenue: 5000, status: 'Cancelada' }),
      makeComputedSale({ id: 'V3', grossRevenue: 3000, status: 'Devolvida' }),
    ];
    expect(annualGrossRevenue(sales, 2026)).toBe(1000);
  });
});

describe('monthlyGrossRevenue', () => {
  it('agrega receita por mês (0..11) do ano', () => {
    const sales = [
      makeComputedSale({ id: 'V1', grossRevenue: 500, saleDate: '2026-01-05' }),
      makeComputedSale({ id: 'V2', grossRevenue: 700, saleDate: '2026-01-20' }),
      makeComputedSale({ id: 'V3', grossRevenue: 300, saleDate: '2026-03-10' }),
      makeComputedSale({ id: 'V4', grossRevenue: 999, saleDate: '2025-03-10' }), // outro ano
    ];
    const monthly = monthlyGrossRevenue(sales, 2026);
    expect(monthly).toHaveLength(12);
    expect(monthly[0].revenue).toBe(1200); // janeiro
    expect(monthly[2].revenue).toBe(300); // março
    expect(monthly[5].revenue).toBe(0); // junho
  });
});

describe('monthsActiveInYear', () => {
  it('retorna 12 quando não há data de início', () => {
    expect(monthsActiveInYear(undefined, 2026)).toBe(12);
  });

  it('conta do mês de abertura até dezembro no ano de início', () => {
    expect(monthsActiveInYear('2026-10-15', 2026)).toBe(3); // out, nov, dez
    expect(monthsActiveInYear('2026-01-01', 2026)).toBe(12); // janeiro = ano cheio
  });

  it('retorna 12 em anos posteriores ao de início', () => {
    expect(monthsActiveInYear('2026-10-15', 2027)).toBe(12);
  });

  it('retorna 0 em anos anteriores ao de início', () => {
    expect(monthsActiveInYear('2026-10-15', 2025)).toBe(0);
  });

  it('data inválida ou vazia cai no guard de NaN → tratada como sem início (12 meses)', () => {
    expect(monthsActiveInYear('garbage', 2026)).toBe(12);
    expect(monthsActiveInYear('', 2026)).toBe(12);
  });

  it('COMPORTAMENTO DOCUMENTADO: data leniente "2026-02-30" rola para março (parse nativo do Date)', () => {
    // new Date('2026-02-30') não é NaN: vira 2026-03-02 (UTC). O mês ativo conta a partir de março.
    expect(monthsActiveInYear('2026-02-30', 2026)).toBe(12 - 2); // mar..dez = 10
  });
});

describe('availableYears', () => {
  it('inclui anos com faturamento e o ano de referência, em ordem decrescente', () => {
    const sales = [
      makeComputedSale({ id: 'V1', saleDate: '2024-05-01' }),
      makeComputedSale({ id: 'V2', saleDate: '2026-05-01' }),
    ];
    expect(availableYears(sales, new Date('2026-06-08T00:00:00Z'))).toEqual([2026, 2024]);
  });
});

describe('computeFiscalStatus — bandas', () => {
  const ref = new Date('2026-12-31T00:00:00Z'); // ano cheio decorrido → projeção = revenue

  it('banda ok abaixo de 50% do teto', () => {
    const sales = [makeComputedSale({ grossRevenue: 30_000 })];
    const st = computeFiscalStatus(meiConfig(), sales, 2026, ref);
    expect(st.ceiling).toBe(81_000);
    expect(st.band).toBe('ok');
    expect(st.remaining).toBe(51_000);
    expect(st.overBy).toBe(0);
  });

  it('banda warning entre 50% e 80%', () => {
    const sales = [makeComputedSale({ grossRevenue: 50_000 })];
    expect(computeFiscalStatus(meiConfig(), sales, 2026, ref).band).toBe('warning');
  });

  it('banda danger entre 80% e 100%', () => {
    const sales = [makeComputedSale({ grossRevenue: 70_000 })];
    expect(computeFiscalStatus(meiConfig(), sales, 2026, ref).band).toBe('danger');
  });

  it('exatamente no teto ainda é danger (não ultrapassou)', () => {
    const sales = [makeComputedSale({ grossRevenue: 81_000 })];
    const st = computeFiscalStatus(meiConfig(), sales, 2026, ref);
    expect(st.band).toBe('danger');
    expect(st.overBy).toBe(0);
    expect(st.usagePct).toBeCloseTo(1, 10);
  });

  it('acima do teto vira over e calcula overBy + toleranceCeiling', () => {
    const sales = [makeComputedSale({ grossRevenue: 90_000 })];
    const st = computeFiscalStatus(meiConfig(), sales, 2026, ref);
    expect(st.band).toBe('over');
    expect(st.overBy).toBe(9_000);
    expect(st.remaining).toBe(0);
    expect(st.toleranceCeiling).toBe(97_200); // 81.000 × 1.20
  });
});

describe('computeFiscalStatus — teto proporcional (1º ano)', () => {
  const ref = new Date('2026-12-31T00:00:00Z');

  it('aplica teto proporcional quando o regime inicia no ano avaliado', () => {
    const sales = [makeComputedSale({ grossRevenue: 18_000 })];
    const st = computeFiscalStatus(meiConfig({ regimeStartDate: '2026-10-01' }), sales, 2026, ref);
    expect(st.isProportional).toBe(true);
    expect(st.monthsActive).toBe(3);
    expect(st.ceiling).toBe(20_250); // 6.750 × 3
    expect(st.band).toBe('danger'); // 18.000 / 20.250 ≈ 89%
  });

  it('não é proporcional em ano posterior ao de início', () => {
    const sales = [makeComputedSale({ grossRevenue: 18_000, saleDate: '2027-05-01' })];
    const st = computeFiscalStatus(meiConfig({ regimeStartDate: '2026-10-01' }), sales, 2027, ref);
    expect(st.isProportional).toBe(false);
    expect(st.ceiling).toBe(81_000);
  });

  it('início em janeiro não é tratado como proporcional', () => {
    const sales = [makeComputedSale({ grossRevenue: 10_000 })];
    const st = computeFiscalStatus(meiConfig({ regimeStartDate: '2026-01-01' }), sales, 2026, ref);
    expect(st.isProportional).toBe(false);
    expect(st.ceiling).toBe(81_000);
  });
});

describe('computeFiscalStatus — projeção', () => {
  it('run-rate mensal no meio do ano corrente (receita / mês atual × 12)', () => {
    const ref = new Date('2026-07-02T00:00:00Z'); // julho = 7º mês (índice 6)
    const sales = [makeComputedSale({ grossRevenue: 10_000, saleDate: '2026-03-01' })];
    const st = computeFiscalStatus(meiConfig(), sales, 2026, ref);

    // meses decorridos = 7 (jan..jul), meses ativos = 12 → 10.000 / 7 × 12
    expect(st.projectedAnnual).toBeCloseTo((10_000 / 7) * 12, 4);
    expect(st.projectedAnnual).toBeGreaterThan(st.revenue);
  });

  it('não explode quando o regime inicia hoje (multiplicador limitado aos meses ativos)', () => {
    const ref = new Date('2026-06-10T12:00:00Z'); // junho = índice 5
    const sales = [makeComputedSale({ grossRevenue: 5_000, saleDate: '2026-06-05' })];
    const st = computeFiscalStatus(meiConfig({ regimeStartDate: '2026-06-10' }), sales, 2026, ref);

    // meses ativos = 7 (jun..dez), meses decorridos = 1 → 5.000 × 7, nunca milhões
    expect(st.monthsActive).toBe(7);
    expect(st.projectedAnnual).toBe(35_000);
    expect(st.projectedAnnual).toBeLessThanOrEqual(st.revenue * 12);
  });

  it('em ano passado a projeção é igual à receita final', () => {
    const ref = new Date('2026-06-08T00:00:00Z');
    const sales = [makeComputedSale({ grossRevenue: 40_000, saleDate: '2025-04-01' })];
    const st = computeFiscalStatus(meiConfig(), sales, 2025, ref);
    expect(st.projectedAnnual).toBe(40_000);
  });
});

describe('computeFiscalStatus — DAS estimado', () => {
  const ref = new Date('2026-12-31T00:00:00Z');
  const inss = Math.round(MINIMUM_WAGE_BRL * MEI_INSS_RATE * 100) / 100;

  it('comércio = INSS + R$ 1 (ICMS)', () => {
    const st = computeFiscalStatus(meiConfig({ activity: 'commerce' }), [], 2026, ref);
    expect(st.tax).toEqual({ inss, icms: 1, iss: 0, total: inss + 1 });
  });

  it('serviços = INSS + R$ 5 (ISS)', () => {
    const st = computeFiscalStatus(meiConfig({ activity: 'services' }), [], 2026, ref);
    expect(st.tax).toEqual({ inss, icms: 0, iss: 5, total: inss + 5 });
  });

  it('misto = INSS + R$ 1 + R$ 5', () => {
    const st = computeFiscalStatus(meiConfig({ activity: 'mixed' }), [], 2026, ref);
    expect(st.tax).toEqual({ inss, icms: 1, iss: 5, total: inss + 6 });
  });
});

describe('computeFiscalStatus — regime none', () => {
  it('retorna teto 0 e banda ok, ainda somando receita', () => {
    const sales = [makeComputedSale({ grossRevenue: 5_000 })];
    const st = computeFiscalStatus(meiConfig({ regime: 'none' }), sales, 2026, new Date('2026-12-31T00:00:00Z'));
    expect(st.ceiling).toBe(0);
    expect(st.band).toBe('ok');
    expect(st.revenue).toBe(5_000);
    expect(st.tax).toBeUndefined();
  });
});

describe('MEI_RULE', () => {
  it('expõe teto e proporcional corretos', () => {
    expect(MEI_RULE.annualCeiling).toBe(81_000);
    expect(MEI_RULE.monthlyProportional).toBe(6_750);
    expect(MEI_RULE.tolerancePct).toBe(0.2);
  });
});

describe('computeFiscalStatus — previsão de estouro do teto', () => {
  it('estima a data quando o ritmo atinge o teto dentro do ano', () => {
    const ref = new Date('2026-04-01T00:00:00Z'); // abril = índice 3 → 4 meses decorridos
    const sales = [makeComputedSale({ grossRevenue: 40_000, saleDate: '2026-02-01' })];
    const st = computeFiscalStatus(meiConfig(), sales, 2026, ref);

    // run-rate 10.000/mês, faltam 41.000 → ~5 meses → set/2026
    expect(st.projectedHitsCeiling).toBe(true);
    expect(st.ceilingHitDate).toBe('2026-09-01');
  });

  it('não atinge o teto este ano com ritmo baixo', () => {
    const ref = new Date('2026-04-01T00:00:00Z');
    const sales = [makeComputedSale({ grossRevenue: 4_000 })];
    const st = computeFiscalStatus(meiConfig(), sales, 2026, ref);
    expect(st.projectedHitsCeiling).toBe(false);
    expect(st.ceilingHitDate).toBeNull();
  });

  it('já atingido → hits true mas sem data', () => {
    const ref = new Date('2026-04-01T00:00:00Z');
    const sales = [makeComputedSale({ grossRevenue: 85_000 })];
    const st = computeFiscalStatus(meiConfig(), sales, 2026, ref);
    expect(st.projectedHitsCeiling).toBe(true);
    expect(st.ceilingHitDate).toBeNull();
  });

  it('sem receita → não projeta estouro', () => {
    const ref = new Date('2026-04-01T00:00:00Z');
    const st = computeFiscalStatus(meiConfig(), [], 2026, ref);
    expect(st.projectedHitsCeiling).toBe(false);
    expect(st.ceilingHitDate).toBeNull();
  });
});

describe('dasSchedule', () => {
  const dasTotal = Math.round(MINIMUM_WAGE_BRL * MEI_INSS_RATE * 100) / 100 + 1; // comércio

  it('12 meses, vencimento dia 20 do mês seguinte, valor do DAS', () => {
    const ref = new Date('2026-12-31T00:00:00Z');
    const schedule = dasSchedule(meiConfig({ activity: 'commerce' }), 2026, [], ref);
    expect(schedule).toHaveLength(12);
    expect(schedule[0].periodKey).toBe('2026-01');
    expect(schedule[0].dueDate).toBe('2026-02-20');
    expect(schedule[0].amount).toBeCloseTo(dasTotal, 2);
  });

  it('marca pagos e classifica atrasados', () => {
    const ref = new Date('2026-12-31T00:00:00Z'); // tudo já venceu
    const schedule = dasSchedule(meiConfig(), 2026, ['2026-01', '2026-03'], ref);
    expect(schedule[0].status).toBe('paid');
    expect(schedule[2].status).toBe('paid');
    expect(schedule[1].status).toBe('overdue'); // fev não pago e vencido
  });

  it('mês corrente = pending e mês futuro = upcoming', () => {
    const ref = new Date('2026-06-10T12:00:00Z');
    const schedule = dasSchedule(meiConfig(), 2026, [], ref);
    expect(schedule[3].status).toBe('overdue'); // abr, venceu 20/mai
    expect(schedule[5].status).toBe('pending'); // jun, vence 20/jul
    expect(schedule[6].status).toBe('upcoming'); // jul ainda não começou
  });

  it('meses antes do início ficam inativos no 1º ano', () => {
    const ref = new Date('2026-12-31T00:00:00Z');
    const schedule = dasSchedule(meiConfig({ regimeStartDate: '2026-06-10' }), 2026, [], ref);
    expect(schedule[0].status).toBe('inactive'); // jan
    expect(schedule[4].status).toBe('inactive'); // mai
    expect(schedule[5].status).not.toBe('inactive'); // jun (início)
  });
});

describe('dasnReminder', () => {
  it('ano-base ainda em curso → upcoming', () => {
    const r = dasnReminder(2026, [], new Date('2026-06-10T00:00:00Z'));
    expect(r.status).toBe('upcoming');
    expect(r.deadline).toBe('2027-05-31');
  });

  it('janela aberta (jan–31/05 do ano seguinte) → open', () => {
    const r = dasnReminder(2025, [], new Date('2026-03-01T00:00:00Z'));
    expect(r.status).toBe('open');
    expect(r.deadline).toBe('2026-05-31');
  });

  it('após o prazo → overdue', () => {
    const r = dasnReminder(2025, [], new Date('2026-07-01T00:00:00Z'));
    expect(r.status).toBe('overdue');
  });

  it('declarado → declared', () => {
    const r = dasnReminder(2025, [2025], new Date('2026-07-01T00:00:00Z'));
    expect(r.status).toBe('declared');
  });
});
