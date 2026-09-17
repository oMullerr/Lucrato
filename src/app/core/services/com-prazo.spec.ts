import { comPrazo, PrazoEsgotadoError } from './com-prazo';

describe('comPrazo', () => {
  afterEach(() => jest.useRealTimers());

  it('entrega o valor quando a promessa chega dentro do prazo', async () => {
    await expect(comPrazo(Promise.resolve('ok'), 1000)).resolves.toBe('ok');
  });

  it('propaga a rejeição original quando ela chega antes do prazo', async () => {
    const erro = new Error('falhou de verdade');
    await expect(comPrazo(Promise.reject(erro), 1000)).rejects.toBe(erro);
  });

  it('rejeita com PrazoEsgotadoError quando o prazo vence primeiro', async () => {
    jest.useFakeTimers();
    const nuncaResponde = new Promise<string>(() => undefined);

    const corrida = comPrazo(nuncaResponde, 5000);
    const veredito = corrida.catch((e: unknown) => e);
    await jest.advanceTimersByTimeAsync(5001);

    const erro = await veredito;
    expect(erro).toBeInstanceOf(PrazoEsgotadoError);
    expect((erro as PrazoEsgotadoError).ms).toBe(5000);
  });

  /* Timer vivo segura o event loop e faz o Jest reclamar de handle aberto —
     sintoma de que em produção ele também ficaria pendurado. */
  it('limpa o timer quando a promessa ganha a corrida', async () => {
    jest.useFakeTimers();
    const limpar = jest.spyOn(global, 'clearTimeout');

    await comPrazo(Promise.resolve('rápido'), 30_000);

    expect(limpar).toHaveBeenCalled();
    limpar.mockRestore();
  });
});
