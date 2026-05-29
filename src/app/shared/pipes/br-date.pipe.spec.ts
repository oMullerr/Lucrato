import { BrDatePipe } from './br-date.pipe';

describe('BrDatePipe', () => {
  let pipe: BrDatePipe;

  beforeEach(() => {
    pipe = new BrDatePipe();
  });

  it('retorna "—" para null', () => {
    expect(pipe.transform(null)).toBe('—');
  });

  it('retorna "—" para undefined', () => {
    expect(pipe.transform(undefined)).toBe('—');
  });

  it('retorna "—" para string vazia', () => {
    expect(pipe.transform('')).toBe('—');
  });

  it('retorna "—" para string inválida', () => {
    expect(pipe.transform('banana')).toBe('—');
  });

  it('formata ISO date como dd/MM/yyyy em timezone UTC', () => {
    expect(pipe.transform('2026-05-28')).toBe('28/05/2026');
  });

  it('formata data com hora preservando o dia UTC', () => {
    expect(pipe.transform('2026-01-15T10:30:00Z')).toBe('15/01/2026');
  });

  it('preserva ano de 4 dígitos para datas antigas', () => {
    expect(pipe.transform('1999-12-31')).toBe('31/12/1999');
  });

  it('retorna "—" para "Invalid Date"', () => {
    expect(pipe.transform('Invalid Date')).toBe('—');
  });
});
