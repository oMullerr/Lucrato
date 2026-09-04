/**
 * Protocolo de mensagens da extensão.
 *
 * Três partes conversam e nenhuma confia na outra por padrão:
 *   painel (na página do Mercado Livre)  →  service worker  →  Cloud Function
 *   service worker  →  ponte (na página do Lucrato)  →  app
 *
 * Tudo tipado num lugar só porque mensagem de extensão é `unknown` no destino:
 * sem um contrato explícito, um erro de digitação vira falha silenciosa.
 */
import type { AnaliseDoMl } from './analise';

/** Painel pedindo os dados de mercado de um anúncio. */
export interface PedidoDeAnalise {
  tipo: 'analisar';
  itemId: string;
}

/** Ponte devolvendo o token que o app forneceu. */
export interface EntregaDeToken {
  tipo: 'token';
  token: string;
}

/** Service worker perguntando à ponte se o app tem sessão. */
export interface PedidoDeToken {
  tipo: 'pedir-token';
}

export type Mensagem = PedidoDeAnalise | EntregaDeToken | PedidoDeToken;

/** Resposta da análise. `motivo` explica a degradação, não é erro fatal. */
export interface RespostaDeAnalise {
  ok: boolean;
  analise: AnaliseDoMl | null;
  /**
   * `sem_sessao`  — o Lucrato não está aberto ou você não está logado
   * `sem_conta`   — o Lucrato está aberto, mas sem conta do Mercado Livre ligada
   * `falhou`      — a consulta não voltou
   */
  motivo?: 'sem_sessao' | 'sem_conta' | 'falhou';
}
