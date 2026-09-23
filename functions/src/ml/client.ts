/**
 * Cliente HTTP da API do Mercado Livre.
 *
 * Três responsabilidades, todas chatas de repetir em cada chamada:
 *   - anexar um access token válido (renovando quando vence);
 *   - respeitar o rate limit, recuando com jitter no 429;
 *   - tratar 401 como "o token morreu antes da hora" e tentar uma única vez.
 *
 * Somente leitura: o cliente expõe apenas GET de propósito. Se um dia a
 * integração precisar escrever, isso tem de ser uma decisão explícita, não um
 * método que já estava aqui à disposição.
 */
import { logger } from 'firebase-functions/v2';

import { ML_API } from '../config';
import { backoffDelayMs } from './crypto';
import { getValidAccessToken, invalidarAccessToken } from './tokens';

/** Tentativas em cima de 429/5xx antes de desistir. */
const MAX_TENTATIVAS = 4;

export class MlApiError extends Error {
  constructor(
    readonly status: number,
    readonly corpo: string,
    readonly caminho: string,
  ) {
    super(`ml_api_${status}:${caminho}`);
    this.name = 'MlApiError';
  }
}

/**
 * O que o log precisa saber de uma falha — com o corpo da resposta do ML.
 *
 * O `MlApiError` sempre guardou o corpo, mas os `catch` registravam só a
 * mensagem (`ml_api_403:/orders/search`), e o motivo real morria ali. Um 403
 * do Mercado Livre tem pelo menos cinco causas — IP recusado
 * (`blocked_by: PolicyAgent`), scope desabilitado, token de outro usuário,
 * usuário inativo, aplicativo bloqueado — e cada uma pede um conserto
 * diferente. Em 23/09/2026 a busca de pedidos passou a levar 403 em produção,
 * e sem o corpo não havia como saber qual das cinco era.
 *
 * O corpo é resposta de erro do ML (status, código, mensagem): não carrega
 * token, que só vai no cabeçalho da requisição.
 */
export function detalharErro(err: unknown): { motivo: string; status?: number; corpo?: string } {
  if (err instanceof MlApiError) {
    return { motivo: err.message, status: err.status, corpo: err.corpo };
  }
  return { motivo: String((err as Error)?.message ?? err) };
}

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface MlClient {
  /** GET no caminho informado. `params` vira query string. */
  get<T>(caminho: string, params?: Record<string, string | number | undefined>): Promise<T>;
}

export function criarMlClient(uid: string, clientId: string, clientSecret: string): MlClient {
  async function get<T>(
    caminho: string,
    params: Record<string, string | number | undefined> = {},
  ): Promise<T> {
    const url = new URL(caminho.startsWith('http') ? caminho : `${ML_API}${caminho}`);
    for (const [chave, valor] of Object.entries(params)) {
      if (valor !== undefined && valor !== '') url.searchParams.set(chave, String(valor));
    }

    let renovouPor401 = false;

    for (let tentativa = 0; tentativa < MAX_TENTATIVAS; tentativa++) {
      const token = await getValidAccessToken(uid, clientId, clientSecret);
      const resposta = await fetch(url, {
        headers: { Authorization: `Bearer ${token}`, accept: 'application/json' },
      });

      if (resposta.ok) return (await resposta.json()) as T;

      // Token revogado ou invalidado antes de expirar: vale uma segunda chance.
      if (resposta.status === 401 && !renovouPor401) {
        renovouPor401 = true;
        await invalidarAccessToken(uid);
        continue;
      }

      // Excesso de chamadas ou instabilidade do lado deles: recua e tenta de novo.
      if (resposta.status === 429 || resposta.status >= 500) {
        const espera = backoffDelayMs(tentativa);
        logger.warn('Mercado Livre pediu para esperar', {
          uid,
          caminho,
          status: resposta.status,
          espera,
          tentativa,
        });
        await dormir(espera);
        continue;
      }

      const corpo = (await resposta.text()).slice(0, 500);
      throw new MlApiError(resposta.status, corpo, caminho);
    }

    throw new MlApiError(429, 'tentativas esgotadas', caminho);
  }

  return { get };
}
