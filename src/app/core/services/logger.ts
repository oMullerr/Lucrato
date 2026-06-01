import { environment } from '../../../environments/environment';

/**
 * Loga diagnósticos detalhados apenas fora de produção.
 *
 * Em produção evita expor detalhes internos (mensagens de erro, caminhos,
 * payloads, tokens) no console do navegador. As mensagens destinadas ao
 * usuário continuam vindo do NotifyService — esta função é só para o
 * diagnóstico técnico do desenvolvedor.
 */
export function logError(...args: unknown[]): void {
  if (!environment.production) {
    console.error(...args);
  }
}
