import { Injectable, inject } from '@angular/core';
import { Auth } from '@angular/fire/auth';
import { logError } from './logger';

/** Mesmo canal declarado em `extension/src/config.ts`. */
const CANAL = 'lucrato-ext';

/**
 * Ponte para a extensão de navegador.
 *
 * A extensão não tem conta própria: quando precisa falar com as functions, ela
 * pede um token de identidade a esta página. O app responde com o **ID token**
 * — curto, de uma hora, e o mesmo que o navegador já usa aqui. O refresh token
 * nunca sai daqui, e nada é entregue sem pedido.
 *
 * Por que isto é seguro:
 *  - só responde a mensagens da própria janela e da própria origem, então
 *    nenhum iframe de terceiro consegue pedir;
 *  - só responde com sessão ativa e e-mail verificado, o mesmo portão das
 *    security rules;
 *  - qualquer script que já rode nesta página teria acesso ao mesmo token pelo
 *    SDK do Firebase — a ponte não abre porta nova, só torna explícito o que já
 *    era alcançável de dentro da origem.
 */
@Injectable({ providedIn: 'root' })
export class ExtensionBridgeService {
  private readonly auth = inject(Auth);
  private ouvindo = false;

  /** Liga a ponte. Chamado uma vez, na inicialização do app. */
  start(): void {
    if (this.ouvindo || typeof window === 'undefined') return;
    this.ouvindo = true;
    window.addEventListener('message', this.ouvir);
  }

  /**
   * Desliga a ponte.
   *
   * Simetria com `start`: quem instala um ouvinte global precisa saber
   * removê-lo, senão o único jeito de parar é recarregar a página.
   */
  stop(): void {
    if (!this.ouvindo) return;
    this.ouvindo = false;
    window.removeEventListener('message', this.ouvir);
  }

  private readonly ouvir = (evento: MessageEvent): void => {
    // A checagem de origem é o que separa "a extensão pediu" de "um site
    // qualquer embutiu o Lucrato num iframe e pediu".
    if (evento.source !== window || evento.origin !== window.location.origin) return;

    const d = evento.data as { canal?: string; tipo?: string; pedido?: string } | null;
    if (d?.canal !== CANAL || d.tipo !== 'pedir-token' || typeof d.pedido !== 'string') return;

    void this.responder(d.pedido);
  };

  private async responder(pedido: string): Promise<void> {
    const responderCom = (token: string | null) =>
      window.postMessage(
        { canal: CANAL, tipo: 'token', pedido, token },
        window.location.origin,
      );

    const u = this.auth.currentUser;
    // Mesmo portão do resto do app: sem e-mail verificado não há acesso a dado.
    if (!u || !u.emailVerified) {
      responderCom(null);
      return;
    }

    try {
      responderCom(await u.getIdToken());
    } catch (err) {
      logError('[ExtensionBridge] não deu para emitir o token:', err);
      responderCom(null);
    }
  }
}
