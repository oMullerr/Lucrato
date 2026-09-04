/**
 * Ponte de token, injetada só nas páginas do próprio Lucrato.
 *
 * O content script vive num mundo isolado: ele enxerga o DOM, mas não as
 * variáveis do app. Então não há como "pegar" o token — ele precisa ser
 * entregue. O app responde a um pedido explícito, mesma origem, e devolve um
 * token de identidade de curta duração. Nada de senha, nada de refresh token.
 *
 * A ponte não guarda nada: repassa e esquece.
 */
import { CANAL } from './config';
import type { Mensagem } from './mensagens';

/** Quanto esperar o app responder antes de desistir. */
const TIMEOUT_MS = 3_000;

function pedirAoApp(): Promise<string | null> {
  return new Promise(resolve => {
    const pedido = `${CANAL}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
    let pronto = false;

    const terminar = (token: string | null) => {
      if (pronto) return;
      pronto = true;
      window.removeEventListener('message', ouvir);
      resolve(token);
    };

    function ouvir(evento: MessageEvent): void {
      // Só a própria página responde. Sem esta checagem, um iframe de terceiro
      // poderia se passar pelo app e injetar um token qualquer.
      if (evento.source !== window || evento.origin !== window.location.origin) return;

      const d = evento.data as { canal?: string; tipo?: string; pedido?: string; token?: unknown };
      if (d?.canal !== CANAL || d.tipo !== 'token' || d.pedido !== pedido) return;

      terminar(typeof d.token === 'string' && d.token ? d.token : null);
    }

    window.addEventListener('message', ouvir);
    window.postMessage({ canal: CANAL, tipo: 'pedir-token', pedido }, window.location.origin);
    setTimeout(() => terminar(null), TIMEOUT_MS);
  });
}

chrome.runtime.onMessage.addListener((mensagem, _remetente, responder) => {
  if ((mensagem as Mensagem)?.tipo !== 'pedir-token') return false;
  pedirAoApp().then(token => responder({ token }));
  return true;
});
