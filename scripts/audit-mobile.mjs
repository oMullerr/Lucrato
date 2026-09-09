/**
 * Auditoria de celular: a parte estática, que roda sem navegador e sem login.
 *
 * Uso (a partir da raiz do repositório):
 *   node scripts/audit-mobile.mjs
 *
 * Sai com código 1 se algo regredir, então serve para CI.
 *
 * ---------------------------------------------------------------------------
 * O QUE ESTE SCRIPT NÃO COBRE
 *
 * Ele lê o código; não mede a tela. Alvo de toque, tamanho de fonte renderizado
 * e transbordo real só aparecem com a página aberta em 375px — e quase toda
 * tela do Lucrato exige login. Para essa metade, o arquivo abaixo tem um trecho
 * pronto para colar no console do navegador (ver AUDITORIA_DE_TELA).
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const RAIZ = process.cwd();
const ALVOS = ['src/app/features', 'src/app/shared', 'src/styles'];

function scssDe(dir) {
  const achados = [];
  const caminhar = (d) => {
    for (const nome of readdirSync(d)) {
      const p = join(d, nome);
      if (statSync(p).isDirectory()) caminhar(p);
      else if (nome.endsWith('.scss')) achados.push(p);
    }
  };
  caminhar(join(RAIZ, dir));
  return achados;
}

const problemas = [];
const arquivos = ALVOS.flatMap(scssDe);

for (const arq of arquivos) {
  const rel = relative(RAIZ, arq).replace(/\\/g, '/');
  const texto = readFileSync(arq, 'utf8');
  const linhas = texto.split('\n');

  /* Uma custom property pode ser declarada dentro do próprio arquivo — o
     `kpi-card` faz isso com `--accent` por variante. Só é morta se ninguém
     declara. */
  const declaradasAqui = new Set(
    [...texto.matchAll(/(--[\w-]+):\s*[^;\s]/g)].map((m) => m[1].slice(2)),
  );

  let emComentario = false;
  linhas.forEach((linha, i) => {
    const n = i + 1;

    /* Comentário não é código: sem isto, uma linha que EXPLICA o problema é
       contada como sendo o problema. */
    if (/\/\*/.test(linha) && !/\*\//.test(linha)) emComentario = true;
    const linhaComentada = emComentario || /^\s*(\/\/|\*|\/\*)/.test(linha);
    if (/\*\//.test(linha)) emComentario = false;
    if (linhaComentada) return;

    /* 1. Media query crua. O projeto rejeita em review (ver
       `_breakpoints.scss`), e `_tokens.scss` é a exceção declarada. */
    if (/@media \(max-width:/.test(linha) && !/_(tokens|breakpoints).scss$/.test(rel)) {
      problemas.push(`${rel}:${n}  @media cru — use bp.below()`);
    }

    /* 2. Largura mínima que não cabe num telefone. O útil dentro de um card a
       375px é ~307px; acima disso a tela é empurrada para fora. */
    /* `min-width` dentro de `@media` é um limiar, não uma largura de caixa. */
    const mw = /@media/.test(linha) ? null : linha.match(/min-width:\s*(\d+)px/);
    if (mw && Number(mw[1]) > 320 && !/\bmin\(/.test(linha)) {
      problemas.push(`${rel}:${n}  min-width: ${mw[1]}px — não cabe em 375px`);
    }

    /* 3. Tokens de cor que não existem. Custom property inexistente e sem
       fallback é inválida no valor computado: a cor vira `inherit` em
       silêncio, e o destaque some sem ninguém perceber. */
    const morto = linha.match(/var\(--(text-tertiary|danger|warning|accent|success|info)\s*\)/);
    if (morto && !declaradasAqui.has(morto[1])) {
      problemas.push(`${rel}:${n}  var(--${morto[1]}) não existe — vira inherit`);
    }
  });
}

/* 4. `100vh` no celular inclui a barra do navegador: o rodapé fica cortado.
   O app já usa `100dvh` na casca; o resto tem de seguir. */
for (const arq of arquivos) {
  const rel = relative(RAIZ, arq).replace(/\\/g, '/');
  readFileSync(arq, 'utf8')
    .split('\n')
    .forEach((linha, i) => {
      if (/\b100vh\b/.test(linha) && !/100dvh/.test(linha)) {
        problemas.push(`${rel}:${i + 1}  100vh — prefira 100dvh no celular`);
      }
    });
}

console.log(`Auditoria estática de celular — ${arquivos.length} arquivos SCSS\n`);

if (problemas.length === 0) {
  console.log('  Nada a corrigir.');
  process.exit(0);
}

for (const p of problemas) console.log(`  ${p}`);
console.log(`\n${problemas.length} problema(s).`);
process.exit(1);

/* ---------------------------------------------------------------------------
 * AUDITORIA_DE_TELA — cole no console do navegador, em qualquer rota, com a
 * janela em 375px. Cobre o que o estático não alcança.
 *
 * (() => {
 *   const visivel = e => e.offsetParent !== null || getComputedStyle(e).position === 'fixed';
 *   const alvos = [...document.querySelectorAll('button,a[href],input,select,textarea,[role=button],[role=tab]')]
 *     .filter(visivel)
 *     .map(e => ({ rotulo: (e.getAttribute('aria-label') || e.textContent || e.type || '').trim().slice(0,30),
 *                  h: Math.round(e.getBoundingClientRect().height) }))
 *     .filter(a => a.h > 0 && a.h < 44);
 *   const campos = [...document.querySelectorAll('input,textarea')].filter(visivel)
 *     .filter(e => parseFloat(getComputedStyle(e).fontSize) < 16);
 *   const d = document.documentElement;
 *   return { rota: location.pathname,
 *            rolaLateral: d.scrollWidth > d.clientWidth,
 *            alvosPequenos: alvos,
 *            camposQueDaoZoomNoIOS: campos.length };
 * })()
 */
