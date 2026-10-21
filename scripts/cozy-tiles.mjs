// O CHAO DO VALE — troca a paleta do atlas de terreno de AMEIXA (o "campo chapado" da aventura
// sombria) para PRADO: o chao vira verde quente, os remendos de terra viram terra de verdade, as
// florzinhas vermelhas (que de longe liam como olhos) viram margaridas amarelas e as frutinhas
// vermelhas do pinheiro viram laranja.
//
// E uma troca de COR EXATA por frame, nunca de forma: os ids de frame nao mudam (o mundo autorado
// continua apontando para os mesmos tiles) e rodar de novo nao faz nada (a cor nova nunca casa com
// uma antiga). Mexe so nos frames listados.
//
//   node scripts/cozy-tiles.mjs
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readPng, writePng } from '../spritefactory/lib/png.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const ATLAS = path.resolve(here, '../public/assets/environment/tilesets/forest_tile_set.png');
const COLS = 3;
const T = 16;

const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const GROUND = {
  // Verde de SALVIA, nao de grama de campo de futebol: a luz do jogo empurra a saturacao para
  // cima, entao a arte nasce contida. A terra e parda e baixa — remendo de chao, nao mancha.
  '#452939': '#4a5e3a', // o chao: verde de prado
  '#3e2533': '#43563a', // o chao: verde um tom abaixo
  '#563648': '#58553c', // o remendo: terra com musgo
  '#6b4a5c': '#686347', // o remendo: terra clara
  '#2b1a24': '#373528', // o remendo: terra funda
};
const FLOWERS = { '#cd4b4b': '#f2d36b', '#ba4141': '#d9b453' };
const FRUIT = { '#cd4b4b': '#e8964a', '#ba4141': '#cf7f3c' };
const PLAN = new Map([
  ...[5, 6, 52, 53, 54, 55, 56].map((f) => [f, GROUND]),
  [10, FLOWERS],
  [15, FRUIT],
]);

const img = readPng(ATLAS);
let changed = 0;
for (const [frame, table] of PLAN) {
  const map = new Map(Object.entries(table).map(([a, b]) => [hex(a).join(','), hex(b)]));
  const fx = (frame % COLS) * T;
  const fy = Math.floor(frame / COLS) * T;
  for (let y = fy; y < fy + T; y += 1) {
    for (let x = fx; x < fx + T; x += 1) {
      const i = (y * img.width + x) * 4;
      const to = map.get(`${img.data[i]},${img.data[i + 1]},${img.data[i + 2]}`);
      if (!to || img.data[i + 3] === 0) continue;
      [img.data[i], img.data[i + 1], img.data[i + 2]] = to;
      changed += 1;
    }
  }
}
writePng(ATLAS, img);
console.log(`forest_tile_set.png: ${changed} pixels recoloured`);
