/**
 * O detalhe que vai para o log quando o Mercado Livre recusa uma chamada.
 *
 * Existe por causa de 23/09/2026: a busca de pedidos passou a levar 403 em
 * produção, e o log só dizia `ml_api_403:/orders/search`. O corpo da resposta,
 * que diz QUAL das cinco causas de 403 era, estava guardado no erro e ninguém
 * o registrava.
 */
import { MlApiError, detalharErro } from './client';

describe('detalharErro', () => {
  it('leva o corpo e o status da resposta do Mercado Livre', () => {
    const corpo = '{"code":"PA_UNAUTHORIZED_RESULT_FROM_POLICIES","blocked_by":"PolicyAgent"}';
    const d = detalharErro(new MlApiError(403, corpo, '/orders/search'));

    expect(d).toEqual({ motivo: 'ml_api_403:/orders/search', status: 403, corpo });
  });

  it('mantém o motivo igual ao de antes — é ele que vai para `lastError` e para os testes de fluxo', () => {
    expect(detalharErro(new MlApiError(404, '', '/orders/1')).motivo).toBe('ml_api_404:/orders/1');
  });

  it('erro que não é da API: só o motivo, sem inventar status', () => {
    expect(detalharErro(new Error('reconexao_necessaria'))).toEqual({ motivo: 'reconexao_necessaria' });
  });

  it('valor que nem é Error não derruba o catch que o chamou', () => {
    expect(detalharErro('quebrou')).toEqual({ motivo: 'quebrou' });
    expect(detalharErro(undefined)).toEqual({ motivo: 'undefined' });
  });
});
