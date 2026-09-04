/**
 * Service worker: a única parte da extensão que fala com o servidor.
 *
 * O painel roda dentro da página do Mercado Livre, que é território de
 * terceiros — nenhum token pode passar por lá. Ele pede a análise por mensagem
 * e recebe de volta só números.
 *
 * Onde o token fica: `chrome.storage.session`, que o navegador apaga ao fechar.
 * Não usa `local` de propósito — token de identidade não deve sobreviver à
 * sessão do navegador.
 */
import { FUNCTIONS_BASE, ORIGENS_DO_LUCRATO } from './config';
import type { Mensagem, RespostaDeAnalise } from './mensagens';
import { TokenGuardado, expiracaoDoJwt, tokenUtil } from './token';

const CHAVE = 'idToken';

async function tokenGuardado(): Promise<string | null> {
  const dados = await chrome.storage.session.get(CHAVE);
  return tokenUtil(dados[CHAVE] as TokenGuardado | undefined, Date.now());
}

async function guardarToken(token: string): Promise<void> {
  const expiraEm = expiracaoDoJwt(token);
  // Token sem `exp` legível seria guardado como eterno; melhor não guardar.
  if (!expiraEm) return;
  await chrome.storage.session.set({ [CHAVE]: { token, expiraEm } });
}

/**
 * Pede um token novo a uma aba do Lucrato aberta.
 *
 * Sem aba, não há token — e isso é o desenho, não uma limitação a contornar: a
 * extensão não tem sessão própria, então "não estou logado no Lucrato" tem de
 * significar "a extensão não fala com o servidor".
 */
async function pedirTokenAoApp(): Promise<string | null> {
  const abas = await chrome.tabs.query({ url: ORIGENS_DO_LUCRATO });

  for (const aba of abas) {
    if (aba.id === undefined) continue;
    try {
      const r = await chrome.tabs.sendMessage<Mensagem, { token?: string }>(aba.id, {
        tipo: 'pedir-token',
      });
      if (r?.token) {
        await guardarToken(r.token);
        return r.token;
      }
    } catch {
      // Aba sem a ponte injetada ainda, ou fechando. Tenta a próxima.
    }
  }
  return null;
}

async function token(): Promise<string | null> {
  return (await tokenGuardado()) ?? (await pedirTokenAoApp());
}

/**
 * Chama o `mlAnalyze`.
 *
 * É uma callable do Firebase, que pela HTTP aceita `{ data }` e devolve
 * `{ result }`. Chamada daqui, do service worker, e não da página: assim o
 * token nunca entra no contexto do Mercado Livre.
 */
async function analisar(itemId: string): Promise<RespostaDeAnalise> {
  const jwt = await token();
  if (!jwt) return { ok: false, analise: null, motivo: 'sem_sessao' };

  let resposta: Response;
  try {
    resposta = await fetch(`${FUNCTIONS_BASE}/mlAnalyze`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${jwt}` },
      body: JSON.stringify({ data: { item: itemId } }),
    });
  } catch {
    return { ok: false, analise: null, motivo: 'falhou' };
  }

  if (resposta.status === 401 || resposta.status === 403) {
    // Token venceu entre a checagem e a chamada: descarta e deixa a próxima
    // tentativa buscar outro, em vez de repetir com o mesmo token morto.
    await chrome.storage.session.remove(CHAVE);
    return { ok: false, analise: null, motivo: 'sem_sessao' };
  }

  if (!resposta.ok) {
    // A function responde `failed-precondition` quando não há conta do Mercado
    // Livre ligada — é um recado para você, não uma falha da extensão.
    const corpo = await resposta.text().catch(() => '');
    const semConta = corpo.includes('failed-precondition') || corpo.includes('Conecte a conta');
    return { ok: false, analise: null, motivo: semConta ? 'sem_conta' : 'falhou' };
  }

  const corpo = (await resposta.json().catch(() => null)) as { result?: unknown } | null;
  if (!corpo?.result) return { ok: false, analise: null, motivo: 'falhou' };

  return { ok: true, analise: corpo.result as RespostaDeAnalise['analise'] };
}

chrome.runtime.onMessage.addListener((mensagem, _remetente, responder) => {
  const m = mensagem as Mensagem;

  if (m?.tipo === 'analisar' && typeof m.itemId === 'string') {
    analisar(m.itemId).then(responder);
    return true; // resposta assíncrona
  }

  if (m?.tipo === 'token' && typeof m.token === 'string') {
    guardarToken(m.token).then(() => responder({ ok: true }));
    return true;
  }

  return false;
});
