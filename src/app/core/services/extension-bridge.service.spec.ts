/**
 * Ponte de token para a extensão.
 *
 * Estes testes são quase todos sobre o que a ponte RECUSA. Ela entrega uma
 * credencial, então cada caminho em que ela responde sem dever responder é uma
 * brecha — e uma brecha silenciosa, que nenhuma tela mostraria.
 */
import { TestBed } from '@angular/core/testing';
import { Auth } from '@angular/fire/auth';
import { ExtensionBridgeService } from './extension-bridge.service';

const CANAL = 'lucrato-ext';

interface UsuarioFalso {
  emailVerified: boolean;
  getIdToken: jest.Mock;
}

/**
 * O ouvinte é global (`window`), então uma ponte de um teste responderia ao
 * pedido do teste seguinte. Cada caso desliga a sua no fim.
 */
let ligadas: ExtensionBridgeService[] = [];

afterEach(() => {
  for (const s of ligadas) s.stop();
  ligadas = [];
});

function montar(currentUser: UsuarioFalso | null) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      ExtensionBridgeService,
      { provide: Auth, useValue: { currentUser } },
    ],
  });
  const s = TestBed.inject(ExtensionBridgeService);
  s.start();
  ligadas.push(s);
  return s;
}

let contador = 0;

/**
 * Dispara um `message` como a ponte da extensão faria e espera a resposta.
 *
 * Cada chamada usa um identificador novo: `postMessage` é assíncrona, e uma
 * resposta atrasada de um caso chegaria no seguinte se os dois usassem o mesmo.
 */
function pedir(
  pedido = `p${++contador}`,
  over: Partial<{ canal: string; tipo: string; origin: string; source: unknown }> = {},
): Promise<string | null | undefined> {
  return new Promise(resolve => {
    let respondeu = false;

    const ouvir = (e: MessageEvent) => {
      const d = e.data as { canal?: string; tipo?: string; pedido?: string; token?: string | null };
      if (d?.canal !== CANAL || d.tipo !== 'token' || d.pedido !== pedido) return;
      respondeu = true;
      window.removeEventListener('message', ouvir);
      resolve(d.token);
    };
    window.addEventListener('message', ouvir);

    const evento = new MessageEvent('message', {
      data: { canal: over.canal ?? CANAL, tipo: over.tipo ?? 'pedir-token', pedido },
      origin: over.origin ?? window.location.origin,
      source: 'source' in over ? (over.source as Window) : window,
    });
    window.dispatchEvent(evento);

    // A resposta passa por `getIdToken` e por uma `postMessage`, que o jsdom
    // entrega como macrotask. `undefined` aqui significa "não respondeu".
    setTimeout(() => {
      if (!respondeu) {
        window.removeEventListener('message', ouvir);
        resolve(undefined);
      }
    }, 100);
  });
}

const logado = (): UsuarioFalso => ({
  emailVerified: true,
  getIdToken: jest.fn().mockResolvedValue('jwt-curto'),
});

describe('entrega o token quando deve', () => {
  it('sessao ativa e e-mail verificado recebem o token', async () => {
    montar(logado());
    await expect(pedir()).resolves.toBe('jwt-curto');
  });

  it('a resposta carrega o identificador do pedido', async () => {
    // `pedir` só aceita a resposta cujo `pedido` bate. Sem isso, uma resposta
    // atrasada de outro pedido seria tomada como sendo deste.
    montar(logado());
    await expect(pedir('pedido-especifico-42')).resolves.toBe('jwt-curto');
  });
});

describe('recusa quando nao deve entregar', () => {
  it('sem sessao, responde nulo em vez de nada', async () => {
    // Responder nulo importa: a extensão precisa saber que perguntou e não
    // tem sessão, para dizer "abra o Lucrato" em vez de ficar esperando.
    montar(null);
    await expect(pedir()).resolves.toBeNull();
  });

  it('e-mail nao verificado nao recebe token', async () => {
    // Mesmo portão das security rules: sem verificar o e-mail, sem dado.
    montar({ emailVerified: false, getIdToken: jest.fn() });
    await expect(pedir()).resolves.toBeNull();
  });

  it('falha ao emitir o token nao vaza excecao nem trava a extensao', async () => {
    montar({ emailVerified: true, getIdToken: jest.fn().mockRejectedValue(new Error('rede')) });
    await expect(pedir()).resolves.toBeNull();
  });
});

describe('ignora quem nao e a propria pagina', () => {
  it('mensagem de outra origem nao e respondida', async () => {
    // É o que impede um site que embuta o Lucrato num iframe de pedir o token.
    const u = logado();
    montar(u);
    await expect(pedir(undefined, { origin: 'https://site-malicioso.example' })).resolves.toBeUndefined();
    expect(u.getIdToken).not.toHaveBeenCalled();
  });

  it('mensagem vinda de outra janela nao e respondida', async () => {
    const u = logado();
    montar(u);
    await expect(pedir(undefined, { source: null })).resolves.toBeUndefined();
    expect(u.getIdToken).not.toHaveBeenCalled();
  });

  it('mensagem de outro canal e ignorada', async () => {
    const u = logado();
    montar(u);
    await expect(pedir(undefined, { canal: 'outra-coisa' })).resolves.toBeUndefined();
    expect(u.getIdToken).not.toHaveBeenCalled();
  });

  it('mensagem de tipo desconhecido e ignorada', async () => {
    const u = logado();
    montar(u);
    await expect(pedir(undefined, { tipo: 'me-de-tudo' })).resolves.toBeUndefined();
    expect(u.getIdToken).not.toHaveBeenCalled();
  });
});

describe('ligar a ponte', () => {
  it('start duas vezes nao registra dois ouvintes', async () => {
    const u = logado();
    const s = montar(u);
    s.start();
    await pedir();
    // Dois ouvintes responderiam duas vezes ao mesmo pedido.
    expect(u.getIdToken).toHaveBeenCalledTimes(1);
  });
});
