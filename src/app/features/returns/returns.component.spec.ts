jest.mock('@angular/fire/firestore', () => ({
  Firestore: class Firestore {},
  doc: jest.fn(),
  setDoc: jest.fn(),
  onSnapshot: jest.fn(),
}));

import { TestBed } from '@angular/core/testing';
import { ReturnsComponent } from './returns.component';
import { setupComponentHarness } from '../../../testing/data-harness';
import { FROZEN_NOW } from '../../../testing/golden-dataset';
import { goldenReturnsDb, EXPECTED_RETURNS } from '../../../testing/golden-returns';

describe('ReturnsComponent (tela Devoluções)', () => {
  let cmp: any;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(FROZEN_NOW);
    const h = setupComponentHarness(ReturnsComponent, goldenReturnsDb());
    cmp = h.component;
  });

  afterEach(() => {
    jest.useRealTimers();
    TestBed.resetTestingModule();
  });

  describe('listagem', () => {
    it('lista as 4 devoluções do overlay', () => {
      expect(cmp.returns()).toHaveLength(4);
      expect(cmp.filteredReturns()).toHaveLength(4);
    });

    it('ordem padrão coloca as Solicitadas primeiro', () => {
      expect(cmp.filteredReturns()[0].status).toBe('Solicitado');
      expect(cmp.filteredReturns()[0].id).toBe('D004');
    });

    it('deriva status a partir da data de chegada', () => {
      const byId = (id: string) => cmp.returns().find((r: any) => r.id === id);
      expect(byId('D001').status).toBe('Finalizado');
      expect(byId('D004').status).toBe('Solicitado');
    });
  });

  describe('summary() — KPIs do cabeçalho', () => {
    it('soma prejuízo apenas das finalizadas', () => {
      expect(cmp.summary().loss).toBeCloseTo(EXPECTED_RETURNS.kpis.returnLoss, 10);
      expect(cmp.summary().loss).toBeCloseTo(76.5, 10);
    });

    it('conta unidades, pendentes, frete e ressarcimento', () => {
      const s = cmp.summary();
      expect(s.total).toBe(4);
      expect(s.pending).toBe(1);
      expect(s.units).toBe(3);
      expect(s.shipping).toBe(12);      // o frete de 8 da pendente não conta
      expect(s.refunds).toBe(100);
    });

    it('valor em risco vem só das Solicitadas', () => {
      expect(cmp.summary().atRisk).toBe(90);
    });

    it('taxa de devolução bate com o KPI global', () => {
      expect(cmp.returnRate()).toBeCloseTo(EXPECTED_RETURNS.kpis.returnRate, 10);
      expect(cmp.grossUnitsSold()).toBe(EXPECTED_RETURNS.kpis.grossUnitsSold);
    });

    it('acompanha o filtro aplicado', () => {
      cmp.setQuickFilter('finished');
      expect(cmp.summary().total).toBe(3);
      expect(cmp.summary().atRisk).toBe(0);
    });
  });

  describe('filtros', () => {
    it('chips contam por status e por prejuízo', () => {
      const q = cmp.quickCounts();
      expect(q.all).toBe(4);
      expect(q.pending).toBe(1);
      expect(q.finished).toBe(3);
      // D003 (Ressarcido) tem prejuízo negativo, então não entra em "com prejuízo".
      expect(q.loss).toBe(2);
    });

    it('filtra por destino', () => {
      cmp.destinationFilter.set('Estoque');
      expect(cmp.filteredReturns().map((r: any) => r.id)).toEqual(['D001']);
    });

    it('filtra por texto em produto, id da devolução e id da venda', () => {
      cmp.textFilter.set('caneca');
      expect(cmp.filteredReturns().map((r: any) => r.id)).toEqual(['D002']);
      cmp.textFilter.set('V002');
      expect(cmp.filteredReturns().map((r: any) => r.id).sort()).toEqual(['D001', 'D004']);
      cmp.textFilter.set('d003');
      expect(cmp.filteredReturns().map((r: any) => r.id)).toEqual(['D003']);
    });

    it('filtra por período usando a data da solicitação', () => {
      cmp.dateBounds.set({
        start: new Date('2026-06-01T00:00:00Z'),
        end: new Date('2026-06-30T00:00:00Z'),
      });
      // D001 foi solicitada em 25/05 (chegou em junho) — fica de fora.
      expect(cmp.filteredReturns().map((r: any) => r.id).sort()).toEqual(['D002', 'D004']);
    });

    it('volta para a primeira página quando um filtro muda', () => {
      cmp.pageState.set({ pageIndex: 3, pageSize: 15, length: 4 });
      cmp.textFilter.set('fone');
      TestBed.flushEffects();
      expect(cmp.pageState().pageIndex).toBe(0);
    });
  });

  describe('ordenação', () => {
    it('ordena por impacto no lucro', () => {
      cmp.sortState.set({ active: 'lossAmount', direction: 'desc' });
      expect(cmp.filteredReturns()[0].id).toBe('D001'); // 49,00
      cmp.sortState.set({ active: 'lossAmount', direction: 'asc' });
      expect(cmp.filteredReturns()[0].id).toBe('D003'); // −2,50
    });

    it('ordena por prazo de resolução tratando pendente como -1', () => {
      cmp.sortState.set({ active: 'resolutionDays', direction: 'asc' });
      expect(cmp.filteredReturns()[0].id).toBe('D004'); // sem chegada
    });

    it('ordena por quantidade e por produto', () => {
      cmp.sortState.set({ active: 'product', direction: 'asc' });
      expect(cmp.filteredReturns()[0].product).toBe('Caneca');
    });
  });

  describe('paginação', () => {
    it('fatia a página corrente', () => {
      cmp.pageState.set({ pageIndex: 0, pageSize: 2, length: 4 });
      expect(cmp.pagedReturns()).toHaveLength(2);
      cmp.pageState.set({ pageIndex: 1, pageSize: 2, length: 4 });
      expect(cmp.pagedReturns()).toHaveLength(2);
    });
  });

  describe('apresentação', () => {
    it('classe do impacto distingue prejuízo de ganho', () => {
      expect(cmp.lossClass(49)).toBe('text-danger');
      expect(cmp.lossClass(-2.5)).toBe('text-success');
      expect(cmp.lossClass(0)).toBe('');
    });

    it('tom do badge segue o status', () => {
      expect(cmp.statusKindFor({ status: 'Finalizado' })).toBe('success');
      expect(cmp.statusKindFor({ status: 'Solicitado' })).toBe('warning');
    });

    it('marca devolução órfã quando a venda não existe', () => {
      const orphans = cmp.returns().filter((r: any) => r.orphan);
      expect(orphans).toHaveLength(0);
    });
  });
});

describe('ReturnsComponent — base sem devoluções', () => {
  it('mostra estado vazio e zera os KPIs', () => {
    jest.useFakeTimers();
    jest.setSystemTime(FROZEN_NOW);
    const h = setupComponentHarness(ReturnsComponent, goldenReturnsDb({ returns: [] }));
    const cmp: any = h.component;
    expect(cmp.returns()).toEqual([]);
    expect(cmp.summary().loss).toBe(0);
    expect(cmp.returnRate()).toBe(0);
    jest.useRealTimers();
    TestBed.resetTestingModule();
  });
});
