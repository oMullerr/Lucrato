/**
 * Contagem de número, para a tela mostrar o valor CHEGANDO.
 *
 * Nasceu dentro do `app-money`, animando só o número-herói. Saiu de lá para o
 * `kpi-card` poder usar a mesma rotina — e "a mesma" é o ponto: dois números
 * contando lado a lado em velocidades diferentes leem como defeito, não como
 * enfeite.
 *
 * NÃO É DECORAÇÃO. Um número que aparece pronto não diz de onde veio; um que
 * sobe até o valor mostra a escala do salto no caminho. É a diferença entre ler
 * "R$ 5.007,40" e ver que são cinco mil.
 *
 * Módulo puro: recebe números e uma função de saída, devolve como cancelar.
 * Sem Angular, sem signal — quem chama decide onde guardar o estado.
 */

/** Duração padrão. Curta o bastante para não atrasar a leitura. */
export const DURACAO_PADRAO_MS = 600;

/** O usuário pediu menos movimento no sistema operacional? */
export function prefereMenosMovimento(): boolean {
  return (
    typeof window !== 'undefined' &&
    !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  );
}

/**
 * Anima de `de` até `ate`, chamando `aoPassar` a cada quadro.
 *
 * Devolve a função de cancelamento. Quando o movimento está desligado — ou o
 * salto é de zero —, entrega o valor final de uma vez e devolve um cancelador
 * que não faz nada: quem chama não precisa saber qual caminho foi tomado.
 */
export function contarAte(
  de: number,
  ate: number,
  aoPassar: (valor: number) => void,
  duracaoMs: number = DURACAO_PADRAO_MS,
): () => void {
  if (de === ate || duracaoMs <= 0 || prefereMenosMovimento()) {
    aoPassar(ate);
    return () => {};
  }

  const inicio = performance.now();
  let id = 0;

  const passo = (agora: number) => {
    const t = Math.min(1, (agora - inicio) / duracaoMs);
    // Ease-out cúbico: rápido no começo, assenta no fim.
    const suave = 1 - Math.pow(1 - t, 3);
    aoPassar(de + (ate - de) * suave);
    if (t < 1) id = requestAnimationFrame(passo);
    else aoPassar(ate);
  };

  id = requestAnimationFrame(passo);
  return () => cancelAnimationFrame(id);
}
