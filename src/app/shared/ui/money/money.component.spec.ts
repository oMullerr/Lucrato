import { resolveMoneyTone } from './money.component';

describe('resolveMoneyTone', () => {
  it('respeita tom explícito independente do valor', () => {
    expect(resolveMoneyTone(-10, 'profit')).toBe('profit');
    expect(resolveMoneyTone(10, 'loss')).toBe('loss');
    expect(resolveMoneyTone(10, 'neutral')).toBe('neutral');
  });

  it('auto: positivo é lucro, negativo é prejuízo', () => {
    expect(resolveMoneyTone(0.01, 'auto')).toBe('profit');
    expect(resolveMoneyTone(-0.01, 'auto')).toBe('loss');
  });

  it('auto: zero e null são neutros', () => {
    expect(resolveMoneyTone(0, 'auto')).toBe('neutral');
    expect(resolveMoneyTone(null, 'auto')).toBe('neutral');
  });
});
