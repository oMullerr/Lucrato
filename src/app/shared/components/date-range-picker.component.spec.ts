jest.mock('@angular/fire/firestore', () => ({
  Firestore: class Firestore {},
  doc: jest.fn(),
  setDoc: jest.fn(),
  onSnapshot: jest.fn(),
}));

import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TranslateService } from '@ngx-translate/core';
import { LanguageService } from '../../core/services/language.service';
import { DateRangePickerComponent } from './date-range-picker.component';

/**
 * Testa a lógica pura do seletor (bounds, label, commit do custom) via DI,
 * sem renderizar o template — mesmo padrão do harness das telas (viewChild/effects
 * de template não rodam aqui, o que é irrelevante para os computeds).
 */
describe('DateRangePickerComponent (seletor de período compartilhado)', () => {
  let cmp: any;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-06-15T12:00:00Z'));

    TestBed.configureTestingModule({
      providers: [
        DateRangePickerComponent,
        { provide: TranslateService, useValue: { instant: (k: string) => k } },
        { provide: LanguageService, useValue: { lang: signal('pt-BR') } },
      ],
    });
    cmp = TestBed.inject(DateRangePickerComponent);
  });

  afterEach(() => {
    jest.useRealTimers();
    TestBed.resetTestingModule();
  });

  it('default "all" → range="all" e rangeBounds() null (não filtra nada)', () => {
    expect(cmp.range()).toBe('all');
    expect(cmp.rangeBounds()).toBeNull();
  });

  it('preset define janela com pontas em início/fim de dia', () => {
    cmp.range.set('7d');
    const b = cmp.rangeBounds();
    expect(b).not.toBeNull();
    expect([b.start.getHours(), b.start.getMinutes(), b.start.getSeconds(), b.start.getMilliseconds()]).toEqual([0, 0, 0, 0]);
    expect([b.end.getHours(), b.end.getMinutes(), b.end.getSeconds(), b.end.getMilliseconds()]).toEqual([23, 59, 59, 999]);
  });

  it('preset maior recua mais no tempo (30d começa antes de 7d)', () => {
    cmp.range.set('7d');
    const s7 = cmp.rangeBounds().start.getTime();
    cmp.range.set('30d');
    const s30 = cmp.rangeBounds().start.getTime();
    expect(s30).toBeLessThan(s7);
  });

  it('"custom" incompleto → null; completo → dia inteiro nas duas pontas', () => {
    cmp.range.set('custom');
    cmp.customStart.set(new Date(2026, 4, 1));
    expect(cmp.rangeBounds()).toBeNull();
    cmp.customEnd.set(new Date(2026, 4, 10));
    const b = cmp.rangeBounds();
    expect(b.start.getHours()).toBe(0);
    expect(b.end.getHours()).toBe(23);
    expect(b.end.getMilliseconds()).toBe(999);
  });

  it('customRangeLabel formata DD/MM – DD/MM', () => {
    cmp.customStart.set(new Date(2026, 4, 1));
    cmp.customEnd.set(new Date(2026, 4, 10));
    expect(cmp.customRangeLabel()).toBe('01/05 – 10/05');
  });

  it('onPickerClosed() só comita "custom" quando as duas datas existem', () => {
    cmp.range.set('all');
    cmp.onPickerClosed();
    expect(cmp.range()).toBe('all'); // sem datas → não comita

    cmp.customStart.set(new Date(2026, 4, 1));
    cmp.customEnd.set(new Date(2026, 4, 10));
    cmp.onPickerClosed();
    expect(cmp.range()).toBe('custom');
  });

  it('variant default é "pills"', () => {
    expect(cmp.variant()).toBe('pills');
  });

  it('clear() volta para "all" (sem filtro) a partir de preset ou custom', () => {
    cmp.range.set('30d');
    cmp.clear();
    expect(cmp.range()).toBe('all');
    expect(cmp.rangeBounds()).toBeNull();

    cmp.range.set('custom');
    cmp.customStart.set(new Date(2026, 4, 1));
    cmp.customEnd.set(new Date(2026, 4, 10));
    cmp.clear();
    expect(cmp.range()).toBe('all');
    expect(cmp.customStart()).toBeNull();
    expect(cmp.customEnd()).toBeNull();
    expect(cmp.rangeBounds()).toBeNull();
  });

  it('triggerLabel: rótulo do preset ativo; custom → DD/MM – DD/MM', () => {
    // fake instant devolve a própria chave → checamos a chave do preset
    expect(cmp.triggerLabel()).toBe('dateRange.rangeAll'); // default 'all'
    cmp.range.set('30d');
    expect(cmp.triggerLabel()).toBe('dateRange.range30d');
    cmp.range.set('custom');
    cmp.customStart.set(new Date(2026, 4, 1));
    cmp.customEnd.set(new Date(2026, 4, 10));
    expect(cmp.triggerLabel()).toBe('01/05 – 10/05');
  });
});
