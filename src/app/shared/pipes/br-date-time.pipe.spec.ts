/**
 * Hora da liberação do dinheiro.
 *
 * Quase todo caso aqui é sobre fuso, porque é onde este pipe pode errar de um
 * jeito que ninguém percebe: o número aparece, parece plausível, e está uma
 * hora — ou um dia — fora do que o app do Mercado Pago mostra.
 */
import { BrDateTimePipe } from './br-date-time.pipe';
import { BrDatePipe } from './br-date.pipe';

describe('BrDateTimePipe', () => {
  let pipe: BrDateTimePipe;

  beforeEach(() => {
    pipe = new BrDateTimePipe();
  });

  describe('ausência de dado', () => {
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
  });

  describe('converte do fuso do Mercado Pago para o do vendedor', () => {
    // O Mercado Pago devolve com o offset dele, -04:00. Ler a string crua
    // mostraria 18:54 — uma hora a menos do que o relógio do vendedor.
    it('recebivel real: 18:54 em -04:00 vira 19:54 em Brasilia', () => {
      expect(pipe.transform('2026-09-11T18:54:14.000-04:00')).toBe('11/09/2026, 19:54');
    });

    it('credito real da conta: 15:44 em -04:00 vira 16:44', () => {
      expect(pipe.transform('2026-09-04T15:44:23.000-04:00')).toBe('04/09/2026, 16:44');
    });

    it('aceita carimbo em UTC e converte igual', () => {
      expect(pipe.transform('2026-09-11T22:54:14.000Z')).toBe('11/09/2026, 19:54');
    });
  });

  describe('viradas de dia', () => {
    // Único horário que muda o dia entre o carimbo e o Brasil. Nenhum dos 141
    // recebíveis da conta real cai aqui hoje, mas o próximo pode cair.
    it('23:30 em -04:00 ja e o dia seguinte no Brasil', () => {
      expect(pipe.transform('2026-09-11T23:30:00.000-04:00')).toBe('12/09/2026, 00:30');
    });

    it('21:18 em -04:00 continua no mesmo dia', () => {
      expect(pipe.transform('2026-06-08T21:18:09.000-04:00')).toBe('08/06/2026, 22:18');
    });
  });

  it('nao troca o brDate: aquele formata em UTC e erraria o dia', () => {
    // A razão de este pipe existir em vez de um argumento no brDate. Passar um
    // instante por lá dá 09/06 para um dinheiro que cai no dia 08 no Brasil.
    const instante = '2026-06-08T21:18:09.000-04:00';
    expect(new BrDatePipe().transform(instante)).toBe('09/06/2026');
    expect(pipe.transform(instante)).toContain('08/06/2026');
  });
});
