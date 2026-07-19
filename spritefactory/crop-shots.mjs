#!/usr/bin/env node
// Recorta e AMPLIA regioes de um screenshot do playtest, pra poder olhar o braco robotico de
// perto. Ampliacao por vizinho-mais-proximo (nunca interpolada): a arte e pixel art, e qualquer
// suavizacao aqui inventaria cores que nao existem no sprite e mentiria sobre o resultado.
//
// Uso: node spritefactory/crop-shots.mjs <run-dir> <out-dir>

import fs from 'node:fs';
import path from 'node:path';
import { readPng, writePng } from './lib/png.mjs';

const [runDir, outDir] = process.argv.slice(2);
if (!runDir || !outDir) {
  console.error('uso: node spritefactory/crop-shots.mjs <run-dir> <out-dir>');
  process.exit(1);
}

const cropScale = (img, x, y, w, h, scale) => {
  const W = w * scale;
  const H = h * scale;
  const out = { width: W, height: H, data: new Uint8Array(W * H * 4) };
  for (let yy = 0; yy < H; yy += 1) {
    for (let xx = 0; xx < W; xx += 1) {
      const sx = Math.min(img.width - 1, x + Math.floor(xx / scale));
      const sy = Math.min(img.height - 1, y + Math.floor(yy / scale));
      const si = (sy * img.width + sx) * 4;
      const di = (yy * W + xx) * 4;
      out.data[di] = img.data[si];
      out.data[di + 1] = img.data[si + 1];
      out.data[di + 2] = img.data[si + 2];
      out.data[di + 3] = img.data[si + 3];
    }
  }
  return out;
};

// Regioes escolhidas a mao sobre o frame 2560x1600: cada uma enquadra UM braco numa fase
// diferente do ciclo, que e a unica forma de mostrar que ele articula.
const SHOTS = [
  { file: 'braco__03_braco-transportou.png', name: 'repouso-alto', x: 1150, y: 380, w: 560, h: 420 },
  { file: 'braco__03_braco-transportou.png', name: 'estendido', x: 1620, y: 130, w: 560, h: 420 },
  { file: 'braco__01_braco-no-meio-do-arco.png', name: 'meio-do-arco', x: 1150, y: 380, w: 560, h: 420 },
  { file: 'braco__03_braco-transportou.png', name: 'vertical', x: 300, y: 800, w: 560, h: 420 },
];

fs.mkdirSync(outDir, { recursive: true });
for (const shot of SHOTS) {
  const src = path.join(runDir, 'screenshots', shot.file);
  if (!fs.existsSync(src)) { console.warn(`pulei (nao existe): ${src}`); continue; }
  const img = readPng(src);
  const out = cropScale(img, shot.x, shot.y, shot.w, shot.h, 2);
  const dest = path.join(outDir, `${shot.name}.png`);
  writePng(dest, out);
  console.log(`${dest}  ${out.width}x${out.height}`);
}
