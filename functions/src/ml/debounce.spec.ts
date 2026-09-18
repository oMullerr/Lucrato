/**
 * Intervalo mínimo entre sincronizações caras.
 *
 * A trava que existia era o sinal `working` do navegador — e ela some num F5.
 * Recarregar e clicar de novo disparava uma segunda varredura por cima da
 * primeira (backfill: 540s, até 3.000 pedidos), e as duas competiam pelo mesmo
 * rate limit do Mercado Livre, que bloqueia por IP.
 *
 * O caso que mais importa aqui é o do relógio estranho: marca no futuro LIBERA.
 * Travar o dono para sempre por causa de um carimbo torto seria trocar um
 * problema de custo por um de disponibilidade — e o segundo é pior.
 */
import { INTERVALOS_MS, minutosDeEspera, podeExecutar } from './debounce';

const AGORA = 1_760_000_000_000;
const MIN = 60_000;

describe('quando pode rodar', () => {
  it('primeira vez sempre passa', () => {
    expect(podeExecutar(null, 10 * MIN, AGORA)).toEqual({ ok: true });
    expect(podeExecutar(undefined, 10 * MIN, AGORA)).toEqual({ ok: true });
  });

  it('depois do intervalo, passa', () => {
    expect(podeExecutar(AGORA - 11 * MIN, 10 * MIN, AGORA)).toEqual({ ok: true });
  });

  it('exatamente no intervalo, passa', () => {
    // O limite e inclusivo: recusar no segundo exato seria arbitrario.
    expect(podeExecutar(AGORA - 10 * MIN, 10 * MIN, AGORA)).toEqual({ ok: true });
  });

  it('antes do intervalo, recusa e diz quanto falta', () => {
    expect(podeExecutar(AGORA - 3 * MIN, 10 * MIN, AGORA)).toEqual({
      ok: false,
      faltamMs: 7 * MIN,
    });
  });

  it('marca no futuro LIBERA, em vez de travar para sempre', () => {
    // Relogio corrigido para tras, migracao de dado, fuso errado numa
    // importacao. Travar o dono por causa disso seria pior que a doenca.
    expect(podeExecutar(AGORA + 60 * MIN, 10 * MIN, AGORA)).toEqual({ ok: true });
  });

  it('marca zerada conta como ausente', () => {
    expect(podeExecutar(0, 10 * MIN, AGORA)).toEqual({ ok: true });
  });
});

describe('espera mostrada ao dono', () => {
  it('arredonda para cima', () => {
    expect(minutosDeEspera(61_000)).toBe(2);
    expect(minutosDeEspera(60_000)).toBe(1);
  });

  it('nunca diz zero minuto — isso nao e uma espera', () => {
    expect(minutosDeEspera(1)).toBe(1);
    expect(minutosDeEspera(0)).toBe(1);
  });
});

describe('os intervalos escolhidos', () => {
  it('o backfill e o mais caro, e tem a espera mais longa das varreduras de pedido', () => {
    expect(INTERVALOS_MS.backfill).toBeGreaterThan(INTERVALOS_MS.syncItems);
  });

  it('as metricas tem a espera mais longa de todas', () => {
    // E uma chamada por anuncio ativo: a API de visitas nao tem multiget.
    for (const [op, ms] of Object.entries(INTERVALOS_MS)) {
      if (op === 'syncMetrics') continue;
      expect(INTERVALOS_MS.syncMetrics).toBeGreaterThan(ms);
    }
  });

  it('nenhum intervalo e curto o bastante para virar enfeite', () => {
    for (const ms of Object.values(INTERVALOS_MS)) {
      expect(ms).toBeGreaterThanOrEqual(5 * MIN);
    }
  });
});
