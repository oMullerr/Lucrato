import { Injectable, inject } from '@angular/core';
import { Functions, httpsCallable } from '@angular/fire/functions';

import { environment } from '../../../environments/environment';

/**
 * Manda para o servidor o erro que estourou no navegador.
 *
 * Até setembro/2026 produção era cega: o log é silenciado quando
 * `environment.production` é true e não havia reporte nenhum. O app passou dias
 * quebrado por CSP sem um sinal chegar em ninguém — quem descobriu foi o dono,
 * no olho. Esta classe é o sinal.
 *
 * Três travas, todas pela mesma razão (o reporte não pode virar o problema):
 *   - nunca lança, nem quando a chamada falha;
 *   - no máximo TETO_POR_SESSAO envios, porque erro em laço de render existe;
 *   - repetição da mesma mensagem não vai duas vezes.
 */
@Injectable({ providedIn: 'root' })
export class ErrorReporterService {
  /** Um erro em ciclo de render dispara centenas por minuto. Cinco bastam. */
  private static readonly TETO_POR_SESSAO = 5;

  private readonly functions = inject(Functions);
  private readonly jaMandadas = new Set<string>();
  private enviados = 0;
  private reportando = false;

  report(erro: unknown): void {
    if (!environment.production) return;
    /* Um erro levantado DENTRO do reporte não pode chamar o reporte de novo. */
    if (this.reportando) return;
    if (this.enviados >= ErrorReporterService.TETO_POR_SESSAO) return;

    const dados = this.montar(erro);
    if (!dados.message || this.jaMandadas.has(dados.message)) return;

    this.jaMandadas.add(dados.message);
    this.enviados += 1;
    this.reportando = true;

    try {
      const chamar = httpsCallable<typeof dados, { ok: boolean }>(this.functions, 'logClientError');
      void chamar(dados).catch(() => undefined);
    } catch {
      /* Sem rede, sem Functions, sem nada: o usuário já tem o toast. */
    } finally {
      this.reportando = false;
    }
  }

  private montar(erro: unknown): {
    message: string;
    name: string;
    stack: string;
    url: string;
    build: string;
  } {
    const comoErro = erro as { message?: unknown; name?: unknown; stack?: unknown } | null;
    const texto = (valor: unknown) => (typeof valor === 'string' ? valor : '');
    /* `throw 'texto'` e `throw 42` existem. Já `String({})` vira
       "[object Object]", que ocuparia a cota da sessão sem dizer nada. */
    const solto = typeof erro === 'string' || typeof erro === 'number' ? String(erro) : '';

    return {
      message: texto(comoErro?.message) || solto,
      name: texto(comoErro?.name),
      stack: texto(comoErro?.stack),
      url: globalThis.location?.href ?? '',
      build: this.bundle(),
    };
  }

  /** Qual bundle o usuário está rodando. Denuncia quem ficou preso em versão
   *  velha no cache do service worker — que foi exatamente o caso deste mês. */
  private bundle(): string {
    const script = globalThis.document?.querySelector('script[src*="main-"]');
    const src = script?.getAttribute('src') ?? '';
    return src.split('/').pop() ?? '';
  }
}
