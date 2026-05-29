import { BrlPipe } from './brl.pipe';

describe('BrlPipe', () => {
  let pipe: BrlPipe;

  // Normaliza espaços (NBSP vs espaço comum) para tornar os asserts estáveis
  // entre versões de Node/ICU.
  function normalize(s: string): string {
    return s.replace(/ /g, ' ');
  }

  beforeEach(() => {
    pipe = new BrlPipe();
  });

  it('retorna "—" para null', () => {
    expect(pipe.transform(null)).toBe('—');
  });

  it('retorna "—" para undefined', () => {
    expect(pipe.transform(undefined)).toBe('—');
  });

  it('retorna "—" quando valor é 0 e hideZero = true', () => {
    expect(pipe.transform(0, true)).toBe('—');
  });

  it('formata 0 como "R$ 0,00" quando hideZero não é passado', () => {
    expect(normalize(pipe.transform(0))).toBe('R$ 0,00');
  });

  it('formata número inteiro com separador de milhar', () => {
    expect(normalize(pipe.transform(1234))).toBe('R$ 1.234,00');
  });

  it('formata número decimal com vírgula como separador decimal', () => {
    expect(normalize(pipe.transform(1234.5))).toBe('R$ 1.234,50');
  });

  it('arredonda valores com mais de 2 casas decimais', () => {
    expect(normalize(pipe.transform(10.456))).toBe('R$ 10,46');
  });

  it('formata número negativo', () => {
    expect(normalize(pipe.transform(-50.5))).toContain('50,50');
  });

  it('formata valor 0 sem hideZero como zero monetário', () => {
    expect(normalize(pipe.transform(0, false))).toBe('R$ 0,00');
  });
});
