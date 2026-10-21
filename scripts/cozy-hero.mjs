// O CAVALEIRO SEM ELMO — gera, a partir do proprio hero.png, as duas pecas do gesto final da
// abertura: o heroi de cabeca descoberta (hero-bare.png, mesma folha, mesmos frames) e o elmo
// sozinho (helmet.png), que fica pendurado na espada fincada.
//
// O corpo nao muda um pixel: so as linhas 0-7 de cada frame (o elmo, com os chifres e o visor
// verde) sao trocadas por uma cabeca — cabelo, rosto, olhos de tinta e bochecha corada nos frames
// de frente; so cabelo nos de costas. Deterministico, sem sorteio: rodar de novo escreve o mesmo.
//
//   node scripts/cozy-hero.mjs
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readPng, writePng } from '../spritefactory/lib/png.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const DIR = path.resolve(here, '../public/assets/characters/player');
const hero = readPng(path.join(DIR, 'hero.png'));
const COLS = 5;
const T = 16;

const PAL = {
  '.': null,
  H: [0x4e, 0x34, 0x20], // cabelo, contorno
  h: [0x7a, 0x52, 0x32], // cabelo
  l: [0x9a, 0x6c, 0x42], // cabelo, brilho
  s: [0xe8, 0xb9, 0x8f], // pele
  S: [0xc9, 0x93, 0x6d], // pele na sombra (queixo)
  K: [0x1d, 0x2b, 0x53], // olho: o navy de tinta do jogo
  P: [0xe4, 0x8f, 0x86], // bochecha
  m: [0xb0, 0x6a, 0x58], // boca
};
// A cabeca de FRENTE, linhas 0-7 (as mesmas que o elmo ocupava; o corpo comeca na linha 8).
const FRONT = [
  '................',
  '......HHHH......',
  '....HHhllhHH....',
  '...HhhhhhhhhH...',
  '...hhsssssshh...',
  '...hsKssssKsh...',
  '...hPssmmssPh...',
  '....SSssssSS....',
];
// A cabeca de COSTAS: so cabelo, com a nuca um tom abaixo.
const BACK = [
  '................',
  '......HHHH......',
  '....HHhhhhHH....',
  '...HhhlhhhhhH...',
  '...HhhhhhlhhH...',
  '...HhhhhhhhhH...',
  '...HhhhhhhhhH...',
  '....HHhhhhHH....',
];
const BACK_FRAMES = new Set([4, 6]);
for (const row of [...FRONT, ...BACK]) if (row.length !== T) throw new Error(`linha com ${row.length}: ${row}`);

const out = { width: hero.width, height: hero.height, data: Buffer.from(hero.data) };
const frames = (hero.width / T) * (hero.height / T);
for (let f = 0; f < frames; f += 1) {
  const fx = (f % COLS) * T;
  const fy = Math.floor(f / COLS) * T;
  // um frame vazio na folha continua vazio
  let any = false;
  for (let y = fy; y < fy + T && !any; y += 1) {
    for (let x = fx; x < fx + T && !any; x += 1) any = hero.data[(y * hero.width + x) * 4 + 3] > 0;
  }
  if (!any) continue;
  const head = BACK_FRAMES.has(f) ? BACK : FRONT;
  for (let y = 0; y < 8; y += 1) {
    for (let x = 0; x < T; x += 1) {
      const i = ((fy + y) * hero.width + fx + x) * 4;
      const c = PAL[head[y][x]];
      if (!c) { out.data[i + 3] = 0; continue; }
      [out.data[i], out.data[i + 1], out.data[i + 2]] = c;
      out.data[i + 3] = 255;
    }
  }
}
writePng(path.join(DIR, 'hero-bare.png'), out);

// O ELMO sozinho: as linhas 0-7 do frame de frente parado (3), num quadro de 16x8.
const helmet = { width: T, height: 8, data: Buffer.alloc(T * 8 * 4) };
const hx = (3 % COLS) * T;
for (let y = 0; y < 8; y += 1) {
  for (let x = 0; x < T; x += 1) {
    const src = (y * hero.width + hx + x) * 4;
    const dst = (y * T + x) * 4;
    for (let k = 0; k < 4; k += 1) helmet.data[dst + k] = hero.data[src + k];
  }
}
writePng(path.join(DIR, 'helmet.png'), helmet);
console.log('hero-bare.png + helmet.png');
