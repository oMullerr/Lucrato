/**
 * Gera os ícones do PWA a partir da mesma marca do `public/favicon.svg`.
 *
 * Uso (a partir da raiz do repositório):
 *   node scripts/generate-pwa-icons.mjs
 *
 * Saída: public/icons/{icon-192,icon-512,icon-maskable-512,apple-touch-icon}.png
 *
 * ---------------------------------------------------------------------------
 * POR QUE RASTERIZAR À MÃO EM VEZ DE USAR UMA BIBLIOTECA
 *
 * A marca é geometria simples: um retângulo, uma polilinha com ponta redonda e
 * um círculo. Rasterizar isso é meia página de matemática, e o PNG sai do
 * `zlib` que o Node já traz. A alternativa seria um binário nativo (`sharp`) no
 * devDependencies para uma tarefa que roda uma vez por ano — e que ainda
 * atrasaria todo `npm ci`. Zero dependência ganha.
 *
 * ---------------------------------------------------------------------------
 * AS TRÊS VARIANTES, E POR QUE NÃO PODE SER UM ARQUIVO SÓ
 *
 * - `any` (192/512): mantém o canto arredondado do desenho original. É como o
 *   ícone aparece quando o sistema não aplica máscara.
 *
 * - `maskable`: fundo cheio, SEM raio, e a marca reduzida a 85% e centrada.
 *   Dois motivos: o Android aplica a própria máscara, então o raio embutido
 *   arredondaria duas vezes; e a marca original é descentrada (ocupa x=21..51,5
 *   de 64), o que a jogaria para fora da zona segura — o círculo interno de 80%.
 *
 * - `apple-touch-icon`: fundo cheio e sem raio, pelo mesmo motivo do maskable —
 *   o iOS aplica o próprio squircle, e um PNG já arredondado deixa cantos
 *   escuros em volta.
 */
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/* --------------------------- a marca, em 64 unidades --------------------------- */

const FUNDO = [0x0a, 0x6e, 0x5c]; // phthalo teal
const MARCA = [0xe8, 0xc7, 0x7b]; // champanhe

const RAIO_CANTO = 14; // o `rx` do favicon.svg
const TRACO = 8; // stroke-width do "L"
const VERTICES = [
  [21, 14],
  [21, 46],
  [46, 46],
];
const PONTO = { x: 48, y: 18, r: 3.5 };

/** Distância de um ponto ao segmento AB. */
function distSegmento(px, py, [ax, ay], [bx, by]) {
  const vx = bx - ax;
  const vy = by - ay;
  const wx = px - ax;
  const wy = py - ay;
  const len2 = vx * vx + vy * vy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, (wx * vx + wy * vy) / len2));
  const dx = px - (ax + t * vx);
  const dy = py - (ay + t * vy);
  return Math.hypot(dx, dy);
}

/** Retângulo de cantos arredondados: dentro? */
function dentroDoFundo(x, y, raio) {
  if (raio <= 0) return x >= 0 && x <= 64 && y >= 0 && y <= 64;
  const cx = Math.min(Math.max(x, raio), 64 - raio);
  const cy = Math.min(Math.max(y, raio), 64 - raio);
  return Math.hypot(x - cx, y - cy) <= raio;
}

/**
 * A marca cobre este ponto? `escala` e o centro vêm do caso maskable.
 *
 * A caixa da marca é 34,5 x 40 centrada em (34,25 / 30) — contando as pontas
 * redondas do traço e o raio do ponto.
 */
function dentroDaMarca(x, y, escala) {
  let px = x;
  let py = y;
  if (escala !== 1) {
    px = (x - 32) / escala + 34.25;
    py = (y - 32) / escala + 30;
  }
  const meio = TRACO / 2;
  for (let i = 0; i < VERTICES.length - 1; i++) {
    if (distSegmento(px, py, VERTICES[i], VERTICES[i + 1]) <= meio) return true;
  }
  return Math.hypot(px - PONTO.x, py - PONTO.y) <= PONTO.r;
}

/* ------------------------------- rasterização ------------------------------- */

/** 4x4 amostras por pixel: sem isso a diagonal do "L" e o círculo saem serrilhados. */
const AMOSTRAS = 4;

function rasterizar(tamanho, { raio, escala }) {
  const px = Buffer.alloc(tamanho * tamanho * 4);
  const passo = 64 / tamanho;
  const sub = passo / AMOSTRAS;

  for (let y = 0; y < tamanho; y++) {
    for (let x = 0; x < tamanho; x++) {
      let fundo = 0;
      let marca = 0;

      for (let sy = 0; sy < AMOSTRAS; sy++) {
        for (let sx = 0; sx < AMOSTRAS; sx++) {
          const ux = (x * passo) + (sx + 0.5) * sub;
          const uy = (y * passo) + (sy + 0.5) * sub;
          if (dentroDoFundo(ux, uy, raio)) fundo++;
          if (dentroDaMarca(ux, uy, escala)) marca++;
        }
      }

      const total = AMOSTRAS * AMOSTRAS;
      const aFundo = fundo / total;
      const aMarca = (marca / total) * aFundo; // a marca nunca vaza para fora do fundo
      const alfa = aFundo;

      // Composição da marca sobre o fundo, já com o alfa do recorte.
      const i = (y * tamanho + x) * 4;
      for (let c = 0; c < 3; c++) {
        px[i + c] = Math.round(FUNDO[c] * (1 - aMarca / (alfa || 1)) + MARCA[c] * (aMarca / (alfa || 1)));
      }
      px[i + 3] = Math.round(alfa * 255);
    }
  }
  return px;
}

/* --------------------------------- PNG --------------------------------- */

const TABELA_CRC = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = TABELA_CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function bloco(tipo, dados) {
  const corpo = Buffer.concat([Buffer.from(tipo, 'ascii'), dados]);
  const tam = Buffer.alloc(4);
  tam.writeUInt32BE(dados.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(corpo));
  return Buffer.concat([tam, corpo, crc]);
}

function png(tamanho, pixels) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(tamanho, 0);
  ihdr.writeUInt32BE(tamanho, 4);
  ihdr[8] = 8; // 8 bits por canal
  ihdr[9] = 6; // RGBA
  // 10..12 = compressão, filtro, entrelaçamento: todos 0

  // Cada linha leva um byte de filtro na frente; 0 = sem filtro.
  const linhas = Buffer.alloc(tamanho * (tamanho * 4 + 1));
  for (let y = 0; y < tamanho; y++) {
    const destino = y * (tamanho * 4 + 1);
    linhas[destino] = 0;
    pixels.copy(linhas, destino + 1, y * tamanho * 4, (y + 1) * tamanho * 4);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    bloco('IHDR', ihdr),
    bloco('IDAT', deflateSync(linhas, { level: 9 })),
    bloco('IEND', Buffer.alloc(0)),
  ]);
}

/* --------------------------------- saída --------------------------------- */

const destino = join(process.cwd(), 'public', 'icons');
mkdirSync(destino, { recursive: true });

const icones = [
  { arquivo: 'icon-192.png', tamanho: 192, raio: RAIO_CANTO, escala: 1 },
  { arquivo: 'icon-512.png', tamanho: 512, raio: RAIO_CANTO, escala: 1 },
  { arquivo: 'icon-maskable-512.png', tamanho: 512, raio: 0, escala: 0.85 },
  { arquivo: 'apple-touch-icon.png', tamanho: 180, raio: 0, escala: 1 },
];

for (const { arquivo, tamanho, raio, escala } of icones) {
  const dados = png(tamanho, rasterizar(tamanho, { raio, escala }));
  writeFileSync(join(destino, arquivo), dados);
  console.log(`  ${arquivo.padEnd(24)} ${tamanho}x${tamanho}  ${(dados.length / 1024).toFixed(1)} KB`);
}

console.log('\nÍcones gerados em public/icons/.');
