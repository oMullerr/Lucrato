/**
 * Contraste dos tokens, calculado — não estimado.
 *
 * Uso (a partir da raiz do repositório):
 *   node scripts/audit-contraste.mjs
 *
 * Sai com código 1 se algum par ficar abaixo do piso, então serve para CI.
 *
 * ---------------------------------------------------------------------------
 * POR QUE ISTO EXISTE
 *
 * Toda paleta nasce com alguém afirmando que o contraste está bom. A afirmação
 * é gratuita e o cálculo não: `#A06C00` sobre branco parece seguro e dá 4.6:1,
 * enquanto `#B8860B` — que parece igual — dá 4.1 e reprova. A diferença não se
 * enxerga a olho nu, e é exatamente por isso que um humano não deveria ser o
 * juiz.
 *
 * O `audit-mobile.mjs` declara, no próprio rodapé, que contraste computado
 * está fora do escopo dele. Este arquivo fecha essa lacuna.
 *
 * O QUE ELE NÃO COBRE: texto sobre TINT (as cores `--tint-*` são translúcidas
 * e o resultado depende do que está atrás), texto sobre imagem, e o que
 * componentes montam com `color-mix()` em tempo de execução. Para isso continua
 * valendo olhar a tela.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const RAIZ = process.cwd();
const ARQUIVO = join(RAIZ, 'src/styles/_tokens.scss');

/** WCAG 2.1: 4.5 para texto corrido, 3.0 para texto grande e interface. */
const PISO_TEXTO = 4.5;
const PISO_GRANDE = 3.0;

/* ─────────────────────────── Cor ─────────────────────────── */

function canalParaLinear(c) {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

/** Luminância relativa (WCAG). */
function luminancia({ r, g, b }) {
  return 0.2126 * canalParaLinear(r) + 0.7152 * canalParaLinear(g) + 0.0722 * canalParaLinear(b);
}

function contraste(frente, fundo) {
  const a = luminancia(frente);
  const b = luminancia(fundo);
  const [claro, escuro] = a > b ? [a, b] : [b, a];
  return (claro + 0.05) / (escuro + 0.05);
}

/** `#RGB`, `#RRGGBB` ou `rgba(r, g, b, a)`. Devolve `null` se não souber ler. */
function lerCor(bruto) {
  const texto = String(bruto).trim();

  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(texto);
  if (hex) {
    const d = hex[1];
    const par = d.length === 3 ? [...d].map((c) => c + c) : [d.slice(0, 2), d.slice(2, 4), d.slice(4, 6)];
    return { r: parseInt(par[0], 16), g: parseInt(par[1], 16), b: parseInt(par[2], 16), a: 1 };
  }

  const rgba = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+))?\s*\)$/i.exec(texto);
  if (rgba) {
    return { r: +rgba[1], g: +rgba[2], b: +rgba[3], a: rgba[4] === undefined ? 1 : +rgba[4] };
  }

  return null;
}

/** Compõe uma cor translúcida sobre um fundo opaco. */
function sobre(frente, fundo) {
  if (frente.a >= 1) return frente;
  return {
    r: frente.r * frente.a + fundo.r * (1 - frente.a),
    g: frente.g * frente.a + fundo.g * (1 - frente.a),
    b: frente.b * frente.a + fundo.b * (1 - frente.a),
    a: 1,
  };
}

/* ─────────────────────── Leitura dos tokens ─────────────────────── */

/**
 * Extrai os tokens de um bloco.
 *
 * O tema claro mora em `:root {}` e o escuro num `@mixin escuro {}` — o mixin
 * é o que permite aplicar o escuro pela classe E por `prefers-color-scheme`
 * sem escrever os valores duas vezes.
 */
function blocoDe(texto, abertura) {
  const inicio = texto.indexOf(abertura);
  if (inicio < 0) throw new Error(`bloco não encontrado: ${abertura}`);

  let i = texto.indexOf('{', inicio);
  let nivel = 0;
  const comeco = i;
  for (; i < texto.length; i++) {
    if (texto[i] === '{') nivel++;
    else if (texto[i] === '}' && --nivel === 0) break;
  }

  const corpo = texto.slice(comeco + 1, i);
  const tokens = {};
  for (const m of corpo.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    tokens[m[1]] = m[2].trim();
  }
  return tokens;
}

/** Resolve `var(--x)` de um nível — basta para `--color-profit` e irmãos. */
function resolver(tokens, nome) {
  const bruto = tokens[nome];
  if (!bruto) return null;
  const ref = /^var\(\s*(--[\w-]+)\s*\)$/.exec(bruto);
  return lerCor(ref ? tokens[ref[1]] ?? '' : bruto);
}

/* ─────────────────────── Pares a verificar ─────────────────────── */

/** Superfícies onde texto de verdade aparece. */
const SUPERFICIES = ['--bg-canvas', '--bg-surface-1', '--bg-surface-2', '--bg-surface-3', '--bg-overlay'];

/** Texto corrido: piso cheio. */
const TEXTOS = ['--text-primary', '--text-secondary', '--text-muted'];

/**
 * Cores de dado e de interface: piso de 3:1.
 *
 * São número grande, ícone, borda de estado e rótulo curto em negrito — nunca
 * parágrafo. `--color-*-2` fica de fora por ser sempre a variante de hover/ativo
 * da cor já verificada.
 */
const INTERFACE = [
  '--brand-primary',
  '--color-success',
  '--color-danger',
  '--color-warning',
  '--color-info',
  '--color-neutral',
  '--color-profit',
  '--color-loss',
];

/**
 * Texto sobre cor SÓLIDA.
 *
 * É o par que mais escapa: no tema escuro a marca e o perigo são cores claras,
 * e o `#ffffff` que cinco componentes cravavam virava texto branco sobre
 * salmão. Nenhum teste de comportamento pega isso.
 */
const SOBRE_SOLIDO = [
  ['--on-brand', '--brand-primary'],
  ['--on-danger', '--color-danger'],
];

/** O painel do login é escuro nos DOIS temas — texto branco, acento próprio. */
const SOBRE_HERO = [
  ['--accent-on-dark', '--bg-hero-1'],
  ['--accent-on-dark', '--bg-hero-3'],
  ['--accent-on-dark', '--bg-sidebar'],
  ['--accent-on-dark', '--bg-sidebar-2'],
];

function verificar(nomeDoTema, tokens) {
  const problemas = [];

  const fundoDe = (nome) => {
    const cor = resolver(tokens, nome);
    if (!cor) return null;
    return cor.a >= 1 ? cor : null;
  };

  const checar = (frenteNome, fundoNome, piso) => {
    const fundo = fundoDe(fundoNome);
    const frenteBruta = resolver(tokens, frenteNome);
    if (!fundo || !frenteBruta) return;

    const razao = contraste(sobre(frenteBruta, fundo), fundo);
    if (razao + 1e-9 < piso) {
      problemas.push(
        `${nomeDoTema}  ${frenteNome} sobre ${fundoNome}  ${razao.toFixed(2)}:1  (piso ${piso})`,
      );
    }
  };

  for (const sup of SUPERFICIES) {
    for (const t of TEXTOS) checar(t, sup, PISO_TEXTO);
    for (const c of INTERFACE) checar(c, sup, PISO_GRANDE);
  }

  /* A barra lateral é escura nos DOIS temas, então o texto dela tem de ser
     conferido contra o fundo dela, não contra o canvas da página. */
  for (const t of ['--text-sidebar', '--text-sidebar-muted']) {
    for (const s of ['--bg-sidebar', '--bg-sidebar-2']) checar(t, s, PISO_TEXTO);
  }

  for (const [frente, fundo] of SOBRE_SOLIDO) checar(frente, fundo, PISO_TEXTO);
  /* Acento sobre superficie escura e sempre elemento grafico (ponto ativo,
     seta do wordmark), nunca paragrafo: piso de interface. */
  for (const [frente, fundo] of SOBRE_HERO) checar(frente, fundo, PISO_GRANDE);

  return problemas;
}

/* ───────────────────────────── Execução ───────────────────────────── */

const texto = readFileSync(ARQUIVO, 'utf8');
const claro = blocoDe(texto, ':root');
const escuro = { ...claro, ...blocoDe(texto, '@mixin escuro') };

const problemas = [...verificar('claro ', claro), ...verificar('escuro', escuro)];

const pares =
  (SUPERFICIES.length * (TEXTOS.length + INTERFACE.length) + 4 + SOBRE_SOLIDO.length + SOBRE_HERO.length) * 2;
console.log(`Contraste dos tokens — ${pares} pares nos dois temas\n`);

if (problemas.length === 0) {
  console.log('  Tudo acima do piso.');
  process.exit(0);
}

for (const p of problemas) console.log(`  ${p}`);
console.log(`\n${problemas.length} par(es) abaixo do piso.`);
process.exit(1);
