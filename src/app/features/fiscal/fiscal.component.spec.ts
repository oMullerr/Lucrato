jest.mock('@angular/fire/firestore', () => ({
  Firestore: class Firestore {},
  doc: jest.fn(),
  setDoc: jest.fn(),
  onSnapshot: jest.fn(),
}));

// ng2-charts é ESM (lodash-es) e só é usado no template — nunca renderizado aqui.
jest.mock('ng2-charts', () => ({ BaseChartDirective: class BaseChartDirective {} }));

import { TestBed } from '@angular/core/testing';
import { FiscalComponent } from './fiscal.component';
import { setupComponentHarness } from '../../../testing/data-harness';
import { goldenDb, EXPECTED, FROZEN_NOW } from '../../../testing/golden-dataset';
import { makeSale } from '../../../testing/fixtures';
import type { Database } from '../../core/models/models';

/** Banco com uma única venda 2026 de receita bruta `gross` (fee 0, frete 0) — para testar bandas. */
function dbWithRevenue(gross: number, extra: Partial<Database['settings']> = {}): Database {
  return goldenDb({
    sales: [makeSale({
      id: 'V100', batchId: 'C001', quantitySold: 1, unitPrice: gross,
      saleDate: '2026-03-10', feePercentage: 0, sellerShipping: 0,
    })],
    settings: { fiscal: { regime: 'MEI', activity: 'commerce' }, ...extra } as any,
  });
}

describe('FiscalComponent (tela Fiscal/MEI — valores exibidos)', () => {
  let cmp: any;

  function setup(db = goldenDb()): void {
    const h = setupComponentHarness(FiscalComponent, db);
    cmp = h.component;
  }

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(FROZEN_NOW);
    setup();
  });

  afterEach(() => {
    jest.useRealTimers();
    TestBed.resetTestingModule();
  });

  describe('status() — hero de faturamento vs teto', () => {
    it('2026 (padrão): receita = só Concluídas de 2026; teto cheio de R$ 81.000', () => {
      expect(cmp.selectedYear()).toBe(2026);
      const s = cmp.status();
      expect(s.revenue).toBeCloseTo(EXPECTED.fiscal.revenue2026, 10);
      expect(s.ceiling).toBe(81_000);
      expect(s.fullCeiling).toBe(81_000);
      expect(s.isProportional).toBe(false);
      expect(s.usagePct).toBeCloseTo(EXPECTED.fiscal.revenue2026 / 81_000, 10);
      expect(s.remaining).toBeCloseTo(81_000 - EXPECTED.fiscal.revenue2026, 10);
      expect(s.overBy).toBe(0);
      expect(s.band).toBe('ok');
    });

    it('troca de ano para 2025: só V006', () => {
      cmp.setYear(2025);
      const s = cmp.status();
      expect(s.revenue).toBeCloseTo(EXPECTED.fiscal.revenue2025, 10);
      expect(s.projectedAnnual).toBeCloseTo(EXPECTED.fiscal.revenue2025, 10); // ano passado: sem projeção
    });

    it('projeção anual 2026 por run-rate: receita/6 meses × 12', () => {
      const s = cmp.status();
      expect(s.projectedAnnual).toBeCloseTo(EXPECTED.fiscal.projectedAnnual2026, 10);
      expect(s.projectedHitsCeiling).toBe(false);
      expect(s.ceilingHitDate).toBeNull();
    });

    it('buckets mensais do gráfico: fev=200, mai=270, jun=120, demais 0', () => {
      const m = cmp.status().monthly;
      expect(m).toHaveLength(12);
      expect(m[1].revenue).toBeCloseTo(EXPECTED.fiscal.monthly2026.feb, 10);
      expect(m[4].revenue).toBeCloseTo(EXPECTED.fiscal.monthly2026.may, 10);
      expect(m[5].revenue).toBeCloseTo(EXPECTED.fiscal.monthly2026.jun, 10);
      expect(m[0].revenue + m[2].revenue + m[3].revenue).toBe(0);
      expect(m.slice(6).every((x: any) => x.revenue === 0)).toBe(true);
    });

    it('DAS estimado (comércio): INSS R$ 81,05 + ICMS R$ 1,00 = R$ 82,05', () => {
      const tax = cmp.status().tax;
      expect(tax.inss).toBe(81.05);
      expect(tax.icms).toBe(1);
      expect(tax.iss).toBe(0);
      expect(tax.total).toBeCloseTo(82.05, 10);
    });

    it('years(): anos disponíveis = [2026, 2025]', () => {
      expect(cmp.years()).toEqual([2026, 2025]);
    });
  });

  describe('bandas de alerta e variantes (valores calculados à mão)', () => {
    it('warning: R$ 45.000 = 55,5% do teto (≥ 50%)', () => {
      TestBed.resetTestingModule();
      setup(dbWithRevenue(45_000));
      expect(cmp.status().band).toBe('warning');
      expect(cmp.alert().tone).toBe('warning');
      expect(cmp.alert().titleKey).toBe('fiscal.statusWarnTitle');
      expect(cmp.bandVariant()).toBe('warning');
    });

    it('danger: R$ 70.000 = 86,4% do teto (≥ 80%)', () => {
      TestBed.resetTestingModule();
      setup(dbWithRevenue(70_000));
      expect(cmp.status().band).toBe('danger');
      expect(cmp.alert().tone).toBe('danger');
      expect(cmp.bandVariant()).toBe('danger');
    });

    it('over SUAVE: R$ 90.000 (acima do teto, dentro da tolerância de 20% = R$ 97.200)', () => {
      TestBed.resetTestingModule();
      setup(dbWithRevenue(90_000));
      const s = cmp.status();
      expect(s.band).toBe('over');
      expect(s.overBy).toBeCloseTo(90_000 - 81_000, 10);
      expect(s.toleranceCeiling).toBeCloseTo(81_000 * 1.2, 10);
      const a = cmp.alert();
      expect(a.tone).toBe('over');
      expect(a.icon).toBe('report');
      expect(a.titleKey).toBe('fiscal.statusOverTitle');
    });

    it('over DURO: R$ 100.000 (estoura a tolerância → desenquadramento retroativo)', () => {
      TestBed.resetTestingModule();
      setup(dbWithRevenue(100_000));
      const a = cmp.alert();
      expect(a.icon).toBe('gpp_bad');
      expect(a.titleKey).toBe('fiscal.statusOverHardTitle');
      expect(cmp.progressPct()).toBe(100); // barra de progresso trava em 100%
    });

    it('ok: dataset golden (0,7% do teto) → barra com a % real', () => {
      expect(cmp.alert().tone).toBe('ok');
      expect(cmp.bandVariant()).toBe('brand');
      expect(cmp.progressPct()).toBeCloseTo((EXPECTED.fiscal.revenue2026 / 81_000) * 100, 10);
    });

    it('previsão de estouro: R$ 45.000 em junho → run-rate 7.500/mês → teto em nov/2026', () => {
      TestBed.resetTestingModule();
      setup(dbWithRevenue(45_000));
      const s = cmp.status();
      // monthsToHit = (81000 − 45000) / 7500 = 4.8 → ceil 5 → 15/jun + 5 meses = 15/nov
      expect(s.projectedHitsCeiling).toBe(true);
      expect(s.ceilingHitDate).toBe('2026-11-15');
      const f = cmp.forecastView();
      expect(f.key).toBe('fiscal.forecastWillHit');
      expect(f.tone).toBe('danger');
      expect(f.params['when']).toBe('nov/2026');
    });
  });

  describe('teto proporcional no 1º ano do regime', () => {
    it('início em 2026-03-10 → 10 meses ativos → teto = 6.750 × 10', () => {
      TestBed.resetTestingModule();
      setup(goldenDb({
        settings: { fiscal: { regime: 'MEI', activity: 'commerce', regimeStartDate: '2026-03-10' } } as any,
      }));
      const s = cmp.status();
      expect(s.isProportional).toBe(true);
      expect(s.monthsActive).toBe(10);
      expect(s.ceiling).toBeCloseTo(6_750 * 10, 10);
      expect(s.fullCeiling).toBe(81_000);
    });
  });

  describe('dasMonths() / dasSummary() — agenda do DAS em 15/06/2026', () => {
    it('sem início de regime, jan+fev pagos: 2 pagos, mar+abr atrasados, mai+jun pendentes, jul..dez futuros', () => {
      TestBed.resetTestingModule();
      setup(goldenDb({
        settings: {
          fiscal: { regime: 'MEI', activity: 'commerce' },
          dasPaidMonths: ['2026-01', '2026-02'],
        } as any,
      }));
      const months = cmp.dasMonths();
      expect(months.map((m: any) => m.status)).toEqual([
        'paid', 'paid',           // jan, fev
        'overdue', 'overdue',     // mar (venceu 20/abr), abr (venceu 20/mai)
        'pending', 'pending',     // mai (vence 20/jun), jun (vence 20/jul)
        'upcoming', 'upcoming', 'upcoming', 'upcoming', 'upcoming', 'upcoming',
      ]);
      expect(months[0].amount).toBeCloseTo(82.05, 10);
      expect(months[4].dueDate).toBe('2026-06-20'); // competência mai vence dia 20 do mês seguinte
      const sum = cmp.dasSummary();
      expect(sum).toEqual({ paid: 2, total: 12, overdue: 2 });
    });

    it('regime iniciado em mar/2026: jan+fev inativos e fora do resumo', () => {
      TestBed.resetTestingModule();
      setup(goldenDb({
        settings: {
          fiscal: { regime: 'MEI', activity: 'commerce', regimeStartDate: '2026-03-10' },
          dasPaidMonths: ['2026-03'],
        } as any,
      }));
      const months = cmp.dasMonths();
      expect(months[0].status).toBe('inactive');
      expect(months[1].status).toBe('inactive');
      expect(months[2].status).toBe('paid');
      const sum = cmp.dasSummary();
      expect(sum).toEqual({ paid: 1, total: 10, overdue: 1 }); // abr atrasado
    });

    it('regime "none": todos os meses inativos e sem imposto', () => {
      TestBed.resetTestingModule();
      setup(goldenDb({ settings: { fiscal: { regime: 'none', activity: 'commerce' } } as any }));
      expect(cmp.dasMonths().every((m: any) => m.status === 'inactive')).toBe(true);
      expect(cmp.status().tax).toBeUndefined();
      expect(cmp.status().ceiling).toBe(0);
      expect(cmp.hasRegime()).toBe(false);
    });
  });

  describe('dasn() — declaração anual em 15/06/2026', () => {
    it('ano-base 2026 (corrente): janela ainda não abriu → upcoming, prazo 31/05/2027', () => {
      const d = cmp.dasn();
      expect(d.baseYear).toBe(2026);
      expect(d.status).toBe('upcoming');
      expect(d.deadline).toBe('2027-05-31');
    });

    it('ano-base 2025 sem declarar: prazo 31/05/2026 já passou → overdue', () => {
      cmp.setYear(2025);
      expect(cmp.dasn().status).toBe('overdue');
      expect(cmp.dasn().deadline).toBe('2026-05-31');
    });

    it('ano-base 2025 declarado → declared', () => {
      TestBed.resetTestingModule();
      setup(goldenDb({
        settings: { fiscal: { regime: 'MEI', activity: 'commerce' }, dasnDeclaredYears: [2025] } as any,
      }));
      cmp.setYear(2025);
      expect(cmp.dasn().status).toBe('declared');
      expect(cmp.dasnDeclared()).toBe(true);
    });
  });

  describe('monthlyChart() — barras + linha de limite', () => {
    it('barras = receitas mensais do status; linha = 12 × 6.750', () => {
      const chart = cmp.monthlyChart();
      const bars = chart.datasets[0].data as number[];
      expect(bars).toEqual(cmp.status().monthly.map((m: any) => m.revenue));
      const line = chart.datasets[1].data as number[];
      expect(line).toEqual(Array(12).fill(6_750));
    });
  });

  describe('formatadores de data', () => {
    it("formatMonthYear('2026-11-15') → 'nov/2026'; formatBrDate('2026-05-31') → '31/05/2026'", () => {
      expect(cmp.formatMonthYear('2026-11-15')).toBe('nov/2026');
      expect(cmp.formatBrDate('2026-05-31')).toBe('31/05/2026');
    });
  });
});
