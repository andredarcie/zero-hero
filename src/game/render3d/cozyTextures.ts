import * as THREE from 'three';
import type Phaser from 'phaser';

import { registerTexture3D } from '@/game/render3d/textures3d';

// AS DUAS PECAS DA HISTORIA que nao tinham arte: a ESPADA FINCADA (o primeiro gesto do jogo) e o
// ESPETO com o cogumelo (o ultimo). Desenhadas uma vez e publicadas nas DUAS pipelines de textura,
// o mesmo esquema do bucketTexture/charcoalTexture: THREE (billboard no mundo) e Phaser.
//
// A espada nao e a arte de item virada de cabeca para baixo: aquela e um toco largo de 16px
// pensado para ser lido no inventario, e cravada no chao ela leria como uma pa. Fincada, o que
// conta e a SILHUETA — lamina fina e longa descendo para a terra, a guarda atravessada e o punho
// de couro em cima, que e o que se ve de uma espada que alguem largou de proposito.

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
};

// 16×16: a espada cravada. O pomo no alto, o punho, a guarda e a lamina que entra na terra.
const PLANTED_SWORD = [
  '.......kk.......',
  '......kyyk......',
  '.......kk.......',
  '.......kmk......',
  '.......klk......',
  '.......kmk......',
  '....kkkkkkkk....',
  '....kygggggk....',
  '....kkkkkkkk....',
  '......kwsdk.....',
  '......kwsdk.....',
  '......kwsdk.....',
  '......kwsdk.....',
  '......kwsdk.....',
  '....ebkwsdkbe...',
  '...eebbkkkbbee..',
] as const;

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

// O mesmo espeto depois de assado: o chapeu dourou.
const ROAST_STICK_DONE = ROAST_STICK.map((row) => row.replace(/c/g, 'r').replace(/v/g, 'y'));

export const PLANTED_SWORD_TEXTURE = 'planted-sword';
export const ROAST_STICK_TEXTURE = 'roast-stick';
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
    [PLANTED_SWORD_TEXTURE, PLANTED_SWORD],
    [ROAST_STICK_TEXTURE, ROAST_STICK],
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
