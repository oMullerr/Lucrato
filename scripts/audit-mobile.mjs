/**
 * Auditoria estática: celular e acessibilidade, sem navegador e sem login.
 *
 * Uso (a partir da raiz do repositório):
 *   node scripts/audit-mobile.mjs
 *
 * Sai com código 1 se algo regredir, então serve para CI.
 *
 * Dois eixos, pela mesma razão: os dois falham em SILÊNCIO. Uma cor que não
 * existe vira `inherit` sem erro; um botão sem nome acessível funciona
 * perfeitamente para quem enxerga. Nenhum dos dois aparece num teste que mede
 * comportamento, e por isso precisam de alguém olhando o código.
 *
 * ---------------------------------------------------------------------------
 * O QUE ESTE SCRIPT NÃO COBRE
 *
 * Ele lê o código; não mede a tela. Alvo de toque, tamanho de fonte renderizado,
 * transbordo real, contraste calculado e ordem de foco só aparecem com a página
 * aberta — e quase toda tela do Lucrato exige login. Para essa metade, o arquivo
 * abaixo tem um trecho pronto para colar no console do navegador (ver
 * AUDITORIA_DE_TELA).
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const RAIZ = process.cwd();
const ALVOS = ['src/app/features', 'src/app/shared', 'src/styles'];
/** Onde procurar template: inclui `core`, que também tem componente. */
const ALVOS_TEMPLATE = ['src/app/features', 'src/app/shared', 'src/app/core'];

function arquivosDe(dir, extensoes) {
  const achados = [];
  const caminhar = (d) => {
    for (const nome of readdirSync(d)) {
      const p = join(d, nome);
      if (statSync(p).isDirectory()) caminhar(p);
      else if (extensoes.some((e) => nome.endsWith(e))) achados.push(p);
    }
  };
  caminhar(join(RAIZ, dir));
  return achados;
}

const scssDe = (dir) => arquivosDe(dir, ['.scss']);

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

/* ─────────────────────── Eixo de acessibilidade ─────────────────────────
 *
 * Havia `aria-label` nos botões de ícone e um `TooltipDirective` próprio, mas
 * nada VERIFICAVA nada disso: o próximo botão de ícone entrava sem nome e
 * ninguém via, porque para quem enxerga ele funciona igual.
 *
 * As quatro regras abaixo foram escolhidas por serem exatas no código deste
 * projeto — cada uma rodou contra a base inteira antes de entrar, e as que
 * produziam falso positivo foram corrigidas, não afrouxadas. Contraste, ordem
 * de foco e nome calculado ficam para a auditoria de tela: dependem do que o
 * navegador resolve, e chutar aqui encheria o CI de ruído.
 */

/** Um template: arquivo `.html`, ou o `template:` embutido de um `.ts`. */
function templates() {
  const docs = [];
  for (const dir of ALVOS_TEMPLATE) {
    for (const arq of arquivosDe(dir, ['.html'])) {
      docs.push({
        rel: relative(RAIZ, arq).replace(/\\/g, '/'),
        texto: readFileSync(arq, 'utf8'),
        offset: 0,
      });
    }
    for (const arq of arquivosDe(dir, ['.ts'])) {
      if (arq.endsWith('.spec.ts')) continue;
      const texto = readFileSync(arq, 'utf8');
      const m = /template:\s*`/.exec(texto);
      if (!m) continue;

      /* Acha a crase que fecha, pulando `${...}` — sem isto, um template com
         interpolação seria cortado no meio e metade das regras nem rodaria. */
      const inicio = m.index + m[0].length;
      let fim = inicio;
      let nivel = 0;
      for (; fim < texto.length; fim++) {
        if (texto[fim] === '\\') { fim++; continue; }
        if (texto[fim] === '$' && texto[fim + 1] === '{') { nivel++; fim++; continue; }
        if (texto[fim] === '}' && nivel > 0) { nivel--; continue; }
        if (texto[fim] === '`' && nivel === 0) break;
      }

      docs.push({
        rel: relative(RAIZ, arq).replace(/\\/g, '/'),
        texto: texto.slice(inicio, fim),
        offset: texto.slice(0, inicio).split('\n').length - 1,
      });
    }
  }
  return docs;
}

/** Um nome acessível pode chegar por qualquer um destes. */
const TEM_NOME = /(?:\[?attr\.)?aria-label\]?=|aria-labelledby=|\[?ariaLabel\]?=|\[?title\]?=/;
/** Tags que já são operáveis pelo teclado por conta própria. */
const JA_INTERATIVO = /^(button|a|input|select|textarea|option|summary|details|app-button)$/;

const docsTemplate = templates();

for (const { rel, texto, offset } of docsTemplate) {
  const linhaDe = (idx) => offset + texto.slice(0, idx).split('\n').length;

  /* 5. Controle só com ícone e sem nome acessível. Funciona perfeitamente
     para quem enxerga, e é um botão sem rótulo para quem não. */
  for (const m of texto.matchAll(/<(button|a)\b([^>]*)>([\s\S]*?)<\/\1>/g)) {
    const [, tag, atributos, dentro] = m;
    /* `{{ }}` é texto visível — foi o que este script aprendeu na primeira
       rodada, quando acusou 156 botões que tinham rótulo traduzido. E
       `<ng-content>` pode trazer o rótulo de fora. */
    if (/<ng-content\b/.test(dentro)) continue;
    if (dentro.replace(/<[^>]*>/g, '').trim()) continue;
    if (TEM_NOME.test(atributos)) continue;
    problemas.push(`${rel}:${linhaDe(m.index)}  <${tag}> só com ícone e sem aria-label`);
  }

  /* 6. Imagem sem texto alternativo — inclusive a forma ligada, `[alt]`. */
  for (const m of texto.matchAll(/<img\b([^>]*)>/g)) {
    if (!/\[?alt\]?=/.test(m[1])) {
      problemas.push(`${rel}:${linhaDe(m.index)}  <img> sem alt`);
    }
  }

  /* 7. Clique em elemento que o teclado não alcança. Precisa de `tabindex`
     para chegar E de uma tecla para acionar; só um dos dois deixa o controle
     alcançável e inerte, que é pior que invisível. Quem está marcado como
     `aria-hidden` não conta: é decoração, como o véu de um drawer. */
  for (const m of texto.matchAll(/<([a-z][\w-]*)\b([^>]*\(click\)="([^"]*)"[^>]*)>/g)) {
    const [, tag, atributos, acao] = m;
    if (JA_INTERATIVO.test(tag)) continue;
    if (/aria-hidden="true"/.test(atributos)) continue;
    /* `(click)="$event.stopPropagation()"` não é um controle: é a barreira que
       impede o clique de subir para a linha-pai. Não há o que o teclado
       acione, e exigir tabindex aqui poria uma parada de foco em cada linha
       expandida — tornando a tabela PIOR de navegar. */
    if (/^[\s;]*\$event\.(stopPropagation|preventDefault)\(\)[\s;]*$/.test(acao)) continue;
    if (/\btabindex=/.test(atributos) && /\(key(down|up)/.test(atributos)) continue;
    problemas.push(`${rel}:${linhaDe(m.index)}  <${tag}> com (click) que o teclado não alcança`);
  }

  /* 8. `tabindex` positivo desmonta a ordem natural de foco da página
     inteira, não só do elemento. */
  for (const m of texto.matchAll(/tabindex="?([1-9]\d*)"?/g)) {
    problemas.push(`${rel}:${linhaDe(m.index)}  tabindex="${m[1]}" — quebra a ordem de foco`);
  }
}

console.log(
  `Auditoria estática — ${arquivos.length} arquivos SCSS, ${docsTemplate.length} templates\n`,
);

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
