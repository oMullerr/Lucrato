/**
 * Content script do Mercado Livre: decide se o painel aparece e o alimenta.
 *
 * O painel só nasce em página de anúncio. Aparecer na busca ou no carrinho
 * seria ruído, e ruído faz a extensão ser desinstalada.
 *
 * O anúncio pode trocar sem recarregar a página — o Mercado Livre navega pelo
 * History API — então a URL é observada, não lida uma vez só.
 */
import { PADRAO, SeusNumeros } from './analise';
import type { Mensagem, RespostaDeAnalise } from './mensagens';
import { Painel } from './painel';
import { lerPagina } from './page';

const CHAVE = 'seusNumeros';

let painel: Painel | null = null;
let itemAtual = '';

/** Seus números seguem de um anúncio para o outro: custo e imposto não mudam. */
async function carregarSeusNumeros(): Promise<SeusNumeros> {
  try {
    const dados = await chrome.storage.local.get(CHAVE);
    return { ...PADRAO, ...((dados[CHAVE] as Partial<SeusNumeros>) ?? {}) };
  } catch {
    return { ...PADRAO };
  }
}

async function salvarSeusNumeros(seus: SeusNumeros): Promise<void> {
  // O frete é do anúncio, não seu: guardá-lo levaria o frete de um produto
  // para o próximo, que é o tipo de erro difícil de perceber.
  const { freteManual, ...persistir } = seus;
  void freteManual;
  await chrome.storage.local.set({ [CHAVE]: persistir }).catch(() => {});
}

async function montar(): Promise<void> {
  const pagina = lerPagina(document, window.location.href);

  if (!pagina.itemId) {
    painel?.destruir();
    painel = null;
    itemAtual = '';
    return;
  }

  if (pagina.itemId === itemAtual && painel) return;
  itemAtual = pagina.itemId;

  const seus = await carregarSeusNumeros();
  painel?.destruir();
  painel = new Painel({ pagina, analise: null, seus });
  painel.onMudanca(salvarSeusNumeros);

  // O painel já é útil antes da resposta: a matemática é local. A consulta só
  // troca a comissão estimada pela real.
  let resposta: RespostaDeAnalise;
  try {
    resposta = await chrome.runtime.sendMessage<Mensagem, RespostaDeAnalise>({
      tipo: 'analisar',
      itemId: pagina.itemId,
    });
  } catch {
    resposta = { ok: false, analise: null, motivo: 'falhou' };
  }

  // Você pode ter navegado para outro anúncio enquanto a resposta vinha.
  if (itemAtual !== pagina.itemId) return;
  painel?.atualizar({ analise: resposta?.analise ?? null, motivo: resposta?.motivo });
}

/** O Mercado Livre troca de anúncio sem recarregar; a URL é a fonte da verdade. */
function observarNavegacao(): void {
  let ultima = window.location.href;
  setInterval(() => {
    if (window.location.href === ultima) return;
    ultima = window.location.href;
    void montar();
  }, 1_000);
  window.addEventListener('popstate', () => void montar());
}

void montar();
observarNavegacao();
