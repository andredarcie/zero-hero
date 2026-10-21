import * as THREE from 'three';
import type Phaser from 'phaser';

import { registerTexture3D } from '@/game/render3d/textures3d';

// A PECA DO FIM que nao tinha arte: o ESPETO com o cogumelo, cru e assado. Desenhadas uma vez e publicadas nas DUAS pipelines de textura,
// o mesmo esquema do bucketTexture/charcoalTexture: THREE (billboard no mundo) e Phaser.
//
type Rgba = readonly [number, number, number, number];

const PALETTE: Record<string, Rgba> = {
  '.': [0, 0, 0, 0],
  k: [0x1b, 0x1d, 0x33, 255], // contorno: o navy de tinta do jogo
  s: [0x8e, 0x97, 0xa8, 255], // aco
  w: [0xd4, 0xda, 0xe3, 255], // fio que pega a luz
  d: [0x5c, 0x63, 0x75, 255], // aco na sombra
  g: [0xb0, 0x8a, 0x3e, 255], // guarda de latao
  y: [0xe2, 0xbf, 0x6a, 255], // brilho do latao
  l: [0x6b, 0x40, 0x22, 255], // couro do punho
  m: [0x8f, 0x5a, 0x31, 255], // couro claro
  e: [0x4a, 0x3a, 0x2a, 255], // terra revolvida no pe
  b: [0x6f, 0x5a, 0x3e, 255], // terra clara
  // o espeto e o cogumelo
  t: [0x7a, 0x52, 0x2c, 255], // graveto
  u: [0xa8, 0x77, 0x44, 255], // graveto claro
  c: [0x3f, 0x6f, 0xb8, 255], // chapeu azul do cogumelo (a mesma cor dos do bosque)
  v: [0x7b, 0xa7, 0xe0, 255], // brilho do chapeu
  n: [0xe8, 0xdc, 0xc0, 255], // pe do cogumelo
  r: [0xb5, 0x6a, 0x2e, 255], // chapeu ja tostado
  // a rachadura que a espada abriu no chao
  q: [0x16, 0x0f, 0x0d, 230], // o fundo da fenda
  p: [0x3a, 0x2a, 0x22, 170], // a borda revolvida
};

// 16×16: o graveto com o cogumelo espetado na ponta, inclinado sobre o fogo.
const ROAST_STICK = [
  '................',
  '...........kkk..',
  '..........kcvck.',
  '.........kccvcck',
  '.........kkkkkk.',
  '..........knnk..',
  '.........kutk...',
  '........kutk....',
  '.......kutk.....',
  '......kutk......',
  '.....kutk.......',
  '....kutk........',
  '...kutk.........',
  '..kutk..........',
  '..kkk...........',
  '................',
] as const;

// 16×16, deitada no chao: a TERRA RACHADA onde a espada entrou — fendas finas que saem do centro
// e se ramificam, sem nunca sair do tile.
const GROUND_CRACK = [
  '................',
  '.......p........',
  '.......q.....p..',
  '..p....q....q...',
  '...q...qp..q....',
  '....q...q.q.....',
  '.....qq.qq......',
  'pqq...qqqq..qqp.',
  '......qqqqqq...q',
  '.....q..qq.q....',
  '....q...q...q...',
  '...p...q.....q..',
  '..q....q......p.',
  '.p.....p........',
  '................',
  '................',
] as const;

// O mesmo espeto depois de assado: o chapeu dourou.
const ROAST_STICK_DONE = ROAST_STICK.map((row) => row.replace(/c/g, 'r').replace(/v/g, 'y'));

export const ROAST_STICK_TEXTURE = 'roast-stick';
export const GROUND_CRACK_TEXTURE = 'ground-crack';
export const ROAST_STICK_DONE_TEXTURE = 'roast-stick-done';

const makeCanvas = (rows: readonly string[]): HTMLCanvasElement => {
  const h = rows.length;
  const w = rows[0].length;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  const img = ctx.createImageData(w, h);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const [r, g, b, a] = PALETTE[rows[y][x]] ?? PALETTE['.'];
      const idx = (y * w + x) * 4;
      img.data[idx] = r;
      img.data[idx + 1] = g;
      img.data[idx + 2] = b;
      img.data[idx + 3] = a;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
};

// O registro THREE e um mapa de modulo que sobrevive ao restart da cena: registrar uma vez so.
let threeRegistered = false;

/** Publica as tres texturas nas duas pipelines. Chamar no boot da cena (GameScene.create). */
export const registerCozyTextures = (scene: Phaser.Scene): void => {
  const sheets: ReadonlyArray<readonly [string, readonly string[]]> = [
    [ROAST_STICK_TEXTURE, ROAST_STICK],
    [GROUND_CRACK_TEXTURE, GROUND_CRACK],
    [ROAST_STICK_DONE_TEXTURE, ROAST_STICK_DONE],
  ];
  for (const [key, rows] of sheets) {
    const needPhaser = !scene.textures.exists(key);
    if (threeRegistered && !needPhaser) continue;
    const canvas = makeCanvas(rows);
    if (!threeRegistered) {
      const tex = new THREE.CanvasTexture(canvas);
      tex.magFilter = THREE.NearestFilter;
      tex.minFilter = THREE.NearestFilter;
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.needsUpdate = true;
      registerTexture3D(key, tex);
    }
    if (needPhaser) scene.textures.addCanvas(key, canvas);
  }
  threeRegistered = true;
};
