/**
 * A contagem de número.
 *
 * O que se prova aqui é quase todo sobre os caminhos em que ela NÃO anima.
 * Uma animação que não termina deixa o número errado na tela para sempre, e
 * "quase 5.007,40" num app de dinheiro é pior que nenhum efeito.
 */
import { contarAte, prefereMenosMovimento } from './contar';

/** `requestAnimationFrame` controlado, para o teste mandar no relógio. */
function comRelogioFalso() {
  const quadros: ((t: number) => void)[] = [];
  const rafOriginal = globalThis.requestAnimationFrame;
  const cancelOriginal = globalThis.cancelAnimationFrame;
  const agoraOriginal = performance.now;
  let agora = 0;

  globalThis.requestAnimationFrame = ((cb: (t: number) => void) => {
    quadros.push(cb);
    return quadros.length;
  }) as typeof requestAnimationFrame;
  globalThis.cancelAnimationFrame = ((id: number) => { quadros[id - 1] = () => {}; }) as typeof cancelAnimationFrame;
  performance.now = () => agora;

  return {
    avancar(ms: number) {
      agora += ms;
      const pendentes = quadros.splice(0, quadros.length);
      for (const q of pendentes) q(agora);
    },
    restaurar() {
      globalThis.requestAnimationFrame = rafOriginal;
      globalThis.cancelAnimationFrame = cancelOriginal;
      performance.now = agoraOriginal;
    },
  };
}

function comMatchMedia(reduzido: boolean) {
  const original = window.matchMedia;
  window.matchMedia = ((q: string) => ({
    matches: reduzido && q.includes('reduce'),
    media: q,
  })) as unknown as typeof window.matchMedia;
  return () => { window.matchMedia = original; };
}

describe('quando NÃO anima', () => {
  it('movimento reduzido entrega o valor final de uma vez', () => {
    const restaurar = comMatchMedia(true);
    const vistos: number[] = [];
    try {
      contarAte(0, 5007.4, (v) => vistos.push(v));
      expect(vistos).toEqual([5007.4]);
    } finally { restaurar(); }
  });

  it('salto de zero não vira animação', () => {
    const restaurar = comMatchMedia(false);
    const vistos: number[] = [];
    try {
      contarAte(42, 42, (v) => vistos.push(v));
      expect(vistos).toEqual([42]);
    } finally { restaurar(); }
  });

  it('duração zero entrega o final', () => {
    const restaurar = comMatchMedia(false);
    const vistos: number[] = [];
    try {
      contarAte(0, 10, (v) => vistos.push(v), 0);
      expect(vistos).toEqual([10]);
    } finally { restaurar(); }
  });

  it('cancelar sem animação é seguro', () => {
    const restaurar = comMatchMedia(true);
    try {
      expect(() => contarAte(0, 1, () => {})()).not.toThrow();
    } finally { restaurar(); }
  });
});

describe('quando anima', () => {
  it('termina EXATAMENTE no alvo, sem sobra de ponto flutuante', () => {
    /* O passo é suavizado, então o penúltimo quadro cai perto mas não em cima.
       Se a rotina parasse ali, a tela ficaria com "R$ 5.007,39" para sempre. */
    const restaurarMedia = comMatchMedia(false);
    const relogio = comRelogioFalso();
    const vistos: number[] = [];
    try {
      contarAte(0, 5007.4, (v) => vistos.push(v), 600);
      relogio.avancar(300);
      relogio.avancar(300);
      expect(vistos[vistos.length - 1]).toBe(5007.4);
    } finally { relogio.restaurar(); restaurarMedia(); }
  });

  it('passa por valores intermediários, crescendo', () => {
    const restaurarMedia = comMatchMedia(false);
    const relogio = comRelogioFalso();
    const vistos: number[] = [];
    try {
      contarAte(0, 1000, (v) => vistos.push(v), 600);
      relogio.avancar(200);
      relogio.avancar(200);
      const meio = vistos.filter((v) => v > 0 && v < 1000);
      expect(meio.length).toBeGreaterThan(0);
      expect([...vistos].sort((a, b) => a - b)).toEqual(vistos);
    } finally { relogio.restaurar(); restaurarMedia(); }
  });

  it('cancelar interrompe: nenhum quadro novo depois', () => {
    const restaurarMedia = comMatchMedia(false);
    const relogio = comRelogioFalso();
    const vistos: number[] = [];
    try {
      const cancelar = contarAte(0, 1000, (v) => vistos.push(v), 600);
      relogio.avancar(100);
      const depoisDoPrimeiro = vistos.length;
      cancelar();
      relogio.avancar(500);
      expect(vistos.length).toBe(depoisDoPrimeiro);
    } finally { relogio.restaurar(); restaurarMedia(); }
  });

  it('conta para baixo também', () => {
    const restaurarMedia = comMatchMedia(false);
    const relogio = comRelogioFalso();
    const vistos: number[] = [];
    try {
      contarAte(100, 0, (v) => vistos.push(v), 600);
      relogio.avancar(700);
      expect(vistos[vistos.length - 1]).toBe(0);
    } finally { relogio.restaurar(); restaurarMedia(); }
  });
});

describe('a leitura da preferência', () => {
  it('reconhece movimento reduzido', () => {
    const restaurar = comMatchMedia(true);
    try { expect(prefereMenosMovimento()).toBe(true); } finally { restaurar(); }
  });

  it('sem preferência, devolve false', () => {
    const restaurar = comMatchMedia(false);
    try { expect(prefereMenosMovimento()).toBe(false); } finally { restaurar(); }
  });
});
