/**
 * Dá prazo a uma Promise que não tem prazo próprio.
 *
 * Existe por causa de 16/09/2026: um `await` sem prazo no caminho do dado
 * (`getIdToken(true)`, que depende de rede e, na época, do App Check) ficou
 * pendurado para sempre e o app parou de receber dado — em pé, calado, sem um
 * erro sequer. Promise pendurada não tem timeout, não tem retry, não tem log:
 * ela simplesmente não acontece, e não existe nada mais difícil de diagnosticar.
 *
 * Regra da casa: todo `await` em chamada de rede no caminho de boot ou de dado
 * passa por aqui. O prazo estourar é um resultado — dá para logar, avisar e
 * tentar de novo. Esperar para sempre não é.
 */

export class PrazoEsgotadoError extends Error {
  constructor(readonly ms: number) {
    super(`Prazo de ${ms}ms esgotado.`);
    this.name = 'PrazoEsgotadoError';
  }
}

/**
 * Resolve com a promessa se ela chegar dentro do prazo; rejeita com
 * `PrazoEsgotadoError` se o prazo vencer primeiro.
 *
 * A promessa original continua correndo — não dá para cancelar Promise. O que
 * muda é que quem esperava para de esperar. O timer é sempre limpo, para não
 * segurar o processo vivo (importante no Node e nos testes).
 */
export function comPrazo<T>(promessa: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  const prazo = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new PrazoEsgotadoError(ms)), ms);
  });

  return Promise.race([promessa, prazo]).finally(() => clearTimeout(timer));
}
