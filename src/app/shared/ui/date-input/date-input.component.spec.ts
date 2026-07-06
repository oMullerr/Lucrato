import { addMonths, buildMonthGrid, formatBr, isOutOfRange, isSameDay } from './date-input.component';

describe('buildMonthGrid', () => {
  it('sempre retorna 6 semanas de 7 dias, começando no domingo e terminando no sábado', () => {
    const weeks = buildMonthGrid(2026, 6, null, null, null, new Date(2026, 6, 4));
    expect(weeks).toHaveLength(6);
    weeks.forEach((week) => expect(week).toHaveLength(7));
    expect(weeks[0][0].date.getDay()).toBe(0);
    expect(weeks[5][6].date.getDay()).toBe(6);
  });

  it('marca inMonth só pros dias do mês pedido (junho/agosto ficam de fora em julho)', () => {
    const weeks = buildMonthGrid(2026, 6, null, null, null, new Date(2026, 6, 4));
    const flat = weeks.flat();
    const july1 = flat.find((c) => c.date.getFullYear() === 2026 && c.date.getMonth() === 6 && c.day === 1);
    const july31 = flat.find((c) => c.date.getFullYear() === 2026 && c.date.getMonth() === 6 && c.day === 31);
    expect(july1?.inMonth).toBe(true);
    expect(july31?.inMonth).toBe(true);
    const outside = flat.filter((c) => c.date.getMonth() !== 6);
    expect(outside.every((c) => !c.inMonth)).toBe(true);
  });

  it('marca isToday só na data de hoje informada', () => {
    const today = new Date(2026, 6, 4);
    const flat = buildMonthGrid(2026, 6, null, null, null, today).flat();
    const marked = flat.filter((c) => c.isToday);
    expect(marked).toHaveLength(1);
    expect(marked[0].day).toBe(4);
  });

  it('marca isSelected só na data selecionada; null não seleciona nada', () => {
    const selected = new Date(2026, 6, 15);
    const flat = buildMonthGrid(2026, 6, selected, null, null, new Date(2026, 6, 4)).flat();
    expect(flat.filter((c) => c.isSelected)).toHaveLength(1);

    const noneSelected = buildMonthGrid(2026, 6, null, null, null, new Date(2026, 6, 4)).flat();
    expect(noneSelected.some((c) => c.isSelected)).toBe(false);
  });

  it('desabilita dias fora do intervalo [min, max], inclusive nas pontas', () => {
    const min = new Date(2026, 6, 10);
    const max = new Date(2026, 6, 20);
    const flat = buildMonthGrid(2026, 6, null, min, max, new Date(2026, 6, 4)).flat();
    const inMonth = flat.filter((c) => c.inMonth);

    expect(inMonth.find((c) => c.day === 9)?.disabled).toBe(true);
    expect(inMonth.find((c) => c.day === 10)?.disabled).toBe(false);
    expect(inMonth.find((c) => c.day === 20)?.disabled).toBe(false);
    expect(inMonth.find((c) => c.day === 21)?.disabled).toBe(true);
  });
});

describe('addMonths', () => {
  it('avança dentro do mesmo ano', () => {
    expect(addMonths(2026, 6, 1)).toEqual({ year: 2026, month: 7 });
  });

  it('rola pro ano seguinte em dezembro', () => {
    expect(addMonths(2026, 11, 1)).toEqual({ year: 2027, month: 0 });
  });

  it('rola pro ano anterior em janeiro', () => {
    expect(addMonths(2026, 0, -1)).toEqual({ year: 2025, month: 11 });
  });
});

describe('isSameDay', () => {
  it('ignora hora/minuto/segundo', () => {
    const a = new Date(2026, 6, 4, 8, 0);
    const b = new Date(2026, 6, 4, 23, 59);
    expect(isSameDay(a, b)).toBe(true);
  });

  it('false pra dias diferentes ou null', () => {
    expect(isSameDay(new Date(2026, 6, 4), new Date(2026, 6, 5))).toBe(false);
    expect(isSameDay(null, new Date(2026, 6, 4))).toBe(false);
    expect(isSameDay(new Date(2026, 6, 4), null)).toBe(false);
  });
});

describe('isOutOfRange', () => {
  it('inclusive nas pontas de min e max', () => {
    const min = new Date(2026, 6, 10);
    const max = new Date(2026, 6, 20);
    expect(isOutOfRange(new Date(2026, 6, 10), min, max)).toBe(false);
    expect(isOutOfRange(new Date(2026, 6, 20), min, max)).toBe(false);
    expect(isOutOfRange(new Date(2026, 6, 9), min, max)).toBe(true);
    expect(isOutOfRange(new Date(2026, 6, 21), min, max)).toBe(true);
  });

  it('sem min/max nada fica fora do intervalo', () => {
    expect(isOutOfRange(new Date(2026, 6, 4), null, null)).toBe(false);
  });
});

describe('formatBr', () => {
  it('formata dd/mm/aaaa com zero à esquerda', () => {
    expect(formatBr(new Date(2026, 6, 4))).toBe('04/07/2026');
    expect(formatBr(new Date(2026, 0, 1))).toBe('01/01/2026');
  });
});
