import type Phaser from 'phaser';
import * as THREE from 'three';

import {
  INK, paintColumn, RAMPS, toneOf, type Paint,
} from '@/game/render3d/pixelForms';
import { registerTexture3D } from '@/game/render3d/textures3d';

// A ARTE DA QUEST DA VEGA: a areia, a cinza, o vidro, o tripé e o telescópio. Pixel desenhado aqui, nas
// duas pipelines, como a arte da Iris (ver paintTextures).

const PALETTE: Readonly<Record<string, readonly [number, number, number, number]>> = {
  '.': [0, 0, 0, 0],
  k: [32, 24, 18, 255], // contorno
  S: [172, 164, 140, 255], // areia: o sol do mundo a amarela, então ela nasce quase cinza
  s: [142, 132, 108, 255],
  z: [104, 94, 74, 255],
  A: [122, 120, 118, 255], // cinza
  a: [92, 90, 90, 255],
  d: [60, 58, 60, 255],
  e: [236, 118, 44, 255], // brasa
  G: [176, 226, 214, 255], // vidro
  g: [112, 176, 170, 255],
  w: [240, 252, 246, 255],
  W: [176, 124, 76, 255], // madeira
  m: [124, 84, 50, 255],
  I: [150, 154, 164, 255], // ferro
  i: [92, 96, 108, 255],
  T: [214, 170, 82, 255], // o latão do tubo
  t: [150, 106, 48, 255],
  L: [150, 216, 240, 255], // a lente
  E: [226, 216, 190, 255], // o esmalte da caneca: claro, para ela não sumir no azul do herói
  F: [172, 158, 128, 255],
  c: [112, 72, 44, 255], // o chá
  H: [236, 206, 160, 255], // a mão
};

const SAND = [
  '................',
  '................',
  '................',
  '................',
  '................',
  '.......kkk......',
  '.....kkSSSkk....',
  '....kSSSSSSSk...',
  '...kSSSsSSSSSk..',
  '...kSSSSSSsSSk..',
  '..kSSsSSSSSSSSk.',
  '..kSSSSSsSSSsSk.',
  '..kssSSSSSSSssk.',
  '...kkzzzzzzzkk..',
  '.....kkkkkkk....',
  '................',
];

const ASH = [
  '................',
  '................',
  '................',
  '................',
  '................',
  '.......kkk......',
  '.....kkAAAkk....',
  '....kAAAaAAAk...',
  '...kAAaAAAdAAk..',
  '...kAAAAdAAAAk..',
  '..kAdAAAAAAaAAk.',
  '..kAAAaAAAdAAAk.',
  '..kaaAAAAAAAaak.',
  '...kkddddddkkk..',
  '.....kkkkkkk....',
  '................',
];

const GLASS = [
  '................',
  '................',
  '.....kkkkkk.....',
  '...kkGGGGGGkk...',
  '..kGwwGGGGGGGk..',
  '..kGwGGGGGGGgk..',
  '.kGGGGGGGGGGGgk.',
  '.kGGGGGGGGGGGgk.',
  '.kGGGGGGGGGGggk.',
  '.kGGGGGGGGGGggk.',
  '..kGGGGGGGGggk..',
  '..kgGGGGGGgggk..',
  '...kkgggggkk....',
  '.....kkkkkk.....',
  '................',
  '................',
];

// O telescópio dobrado, para levar nas costas.
const TELESCOPE_ITEM = [
  '................',
  '............kkk.',
  '...........kLLk.',
  '..........kTTLk.',
  '.........kTTTtk.',
  '........kTTTtk..',
  '.......kTTTtk...',
  '......kTTTtk....',
  '.....kIIItk.....',
  '....kTTTtk......',
  '...kTTtk.k......',
  '..kTttk.kWk.....',
  '..kkkk.kWk......',
  '......kWk.......',
  '.....kWk........',
  '......k.........',
];

const TRIPOD = [
  '................',
  '................',
  '................',
  '................',
  '................',
  '.......kk.......',
  '......kIIk......',
  '......kiik......',
  '......kWmk......',
  '.....kWkmWk.....',
  '.....kWkkWk.....',
  '....kWk.kmWk....',
  '....kWk.kkWk....',
  '...kWk...kmWk...',
  '...kWk....kWk...',
  '...kk......kk...',
];

const TELESCOPE_STAND = [
  '................',
  '............kkk.',
  '...........kLLk.',
  '..........kTTLk.',
  '.........kTTTtk.',
  '........kTTTtk..',
  '.......kTTTtk...',
  '......kIIItk....',
  '.....kTTiik.....',
  '....kTttkmk.....',
  '....kkkkWkmWk...',
  '.......kWkkWk...',
  '......kWk.kmWk..',
  '......kWk..kWk..',
  '.....kWk....kWk.',
  '.....kk......kk.',
];

// A caneca de esmalte da Vega, e o fiapo de vapor que sobe dela.
const MUG = [
  '................',
  '................',
  '................',
  '................',
  '....kkkkkkk.....',
  '....kcccccEkk...',
  '....kEEEEEFk.k..',
  '...HkEEEEEFk.k..',
  '...HkEEEEEFk.k..',
  '....kEEEEEFkk...',
  '....kFFFFFFk....',
  '.....kkkkkk.....',
  '................',
  '................',
  '................',
  '................',
];

// A mesma, bebida até o fim: por dentro só o escuro do esmalte.
const EMPTY_MUG = MUG.map((row) => row.split('c').join('k'));

const STEAM = ['ww', 'ww'];

export const SHIP_TEXTURE = 'sky-ship';
export const SHIP_OPEN_TEXTURE = 'sky-ship-open';
export const SHIP_FLAME_TEXTURE = 'sky-ship-flame';
export const BED_TEXTURE = 'fire-bed';
export const MUG_TEXTURE = 'sky-mug';
export const EMPTY_MUG_TEXTURE = 'sky-mug-empty';
export const STEAM_TEXTURE = 'sky-steam';
export const SAND_TEXTURE = 'sky-sand';
export const ASH_TEXTURE = 'sky-ash';
export const GLASS_TEXTURE = 'sky-glass';
export const TELESCOPE_ITEM_TEXTURE = 'sky-telescope-item';
export const TRIPOD_TEXTURE = 'sky-tripod';
export const TELESCOPE_STAND_TEXTURE = 'sky-telescope-stand';

/** A nave da Vega, em 32×32: um corpo redondo, com a luz vindo da esquerda, como as casas (ver pixelForms). */
export const paintShip = (rect: Paint, open: boolean): void => {
  // As aletas ficam atrás do casco.
  for (let i = 0; i < 8; i += 1) {
    rect(INK, 7 - i, 19 + i, 4 + i, 1);
    rect(RAMPS.orange[0], 8 - i, 19 + i, 3 + i, 1);
    rect(INK, 21, 19 + i, 4 + i, 1);
    rect(RAMPS.orange[2], 21, 19 + i, 3 + i, 1);
  }
  rect(INK, 0, 27, 7, 2);
  rect(INK, 25, 27, 7, 2);
  const half = (y: number): number => (y < 13 ? Math.sqrt(y / 13) * 8.5 : y > 25 ? 8.5 - (y - 25) * 0.5 : 8.5);
  rect(INK, 15, 0, 2, 1);
  paintColumn(rect, () => 16, 1, 27, half, RAMPS.metal);
  rect(INK, 9, 28, 14, 1);
  // O nariz e a faixa, com a mesma luz do casco.
  for (let y = 1; y < 28; y += 1) {
    if (y > 5 && (y < 19 || y > 21)) continue;
    const h = half(y);
    for (let x = Math.round(16 - h); x < Math.round(16 + h); x += 1) rect(toneOf(RAMPS.orange, ((x + 0.5 - 16) / Math.max(1, h)) * -0.95 + 0.12), x, y, 1, 1);
  }
  // A emenda do nariz, desencontrada da faixa.
  rect(RAMPS.metal[3], 10, 6, 12, 1);
  // A escotilha.
  rect(INK, 13, 8, 6, 6);
  rect(INK, 12, 9, 8, 4);
  rect(RAMPS.metal[2], 13, 9, 6, 4);
  rect(RAMPS.metal[2], 14, 8, 4, 6);
  rect('#3f7a92', 14, 9, 4, 4);
  rect('#8cc6d8', 14, 9, 2, 2);
  rect('#e0f4f4', 14, 9, 1, 1);
  // A porta: fechada é chapa com trinco; aberta, a luz de dentro e a rampa.
  rect(INK, 12, 16, 8, 12);
  if (open) {
    rect('#ffb040', 13, 17, 6, 11);
    rect('#ffd870', 13, 17, 4, 7);
    rect('#fff0b0', 13, 17, 2, 3);
    rect(INK, 11, 28, 10, 1);
    rect(RAMPS.metal[2], 12, 28, 8, 1);
    rect(INK, 10, 29, 12, 1);
    rect(RAMPS.metal[3], 11, 29, 10, 1);
  } else {
    rect(RAMPS.metal[1], 13, 17, 3, 11);
    rect(RAMPS.metal[2], 16, 17, 3, 11);
    rect(RAMPS.metal[3], 13, 22, 6, 1);
    rect(RAMPS.orange[0], 17, 24, 1, 2);
  }
};

/** O fogo: branco no miolo, laranja na beira, afinando para baixo. */
export const paintShipFlame = (rect: Paint): void => {
  const layers: ReadonlyArray<readonly [string, number, number]> = [['#d9501f', 7, 16], ['#f08a24', 5, 13], ['#ffc83a', 3, 10], ['#fff2b0', 2, 6]];
  for (const [color, half, height] of layers) {
    for (let y = 0; y < height; y += 1) {
      const w = Math.max(1, Math.round(half * (1 - y / height) ** 0.7));
      rect(color, 8 - w, y, w * 2, 1);
    }
  }
};

/** O colchão visto de cima, com o travesseiro à esquerda: é para lá que a cabeça do herói cai. */
const paintBed = (rect: Paint): void => {
  rect(INK, 4, 9, 24, 14);
  rect(RAMPS.plaster[1], 5, 10, 22, 12);
  for (let x = 15; x < 27; x += 4) rect(RAMPS.blue[1], x, 10, 1, 12);
  rect(RAMPS.plaster[2], 5, 20, 22, 2);
  rect(RAMPS.plaster[0], 6, 11, 6, 9);
  rect(RAMPS.plaster[2], 6, 19, 6, 1);
  rect(RAMPS.plaster[3], 12, 10, 1, 12);
};

const paintedCanvas = (size: number, paint: (rect: Paint) => void): HTMLCanvasElement => {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  paint((color, x, y, w, h) => {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w, h);
  });
  return canvas;
};

const rowsCanvas = (rows: readonly string[]): HTMLCanvasElement => {
  const canvas = document.createElement('canvas');
  canvas.width = rows[0].length;
  canvas.height = rows.length;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  const img = ctx.createImageData(canvas.width, canvas.height);
  rows.forEach((row, y) => {
    for (let x = 0; x < canvas.width; x += 1) {
      const [r, g, b, a] = PALETTE[row[x]] ?? PALETTE['.'];
      img.data.set([r, g, b, a], (y * canvas.width + x) * 4);
    }
  });
  ctx.putImageData(img, 0, 0);
  return canvas;
};

// O registro THREE é um mapa de módulo que sobrevive ao restart da cena: registrar uma vez só.
let threeRegistered = false;

export const registerSkyTextures = (scene: Phaser.Scene): void => {
  const sheets: ReadonlyArray<readonly [string, HTMLCanvasElement]> = [
    [SAND_TEXTURE, rowsCanvas(SAND)],
    [ASH_TEXTURE, rowsCanvas(ASH)],
    [GLASS_TEXTURE, rowsCanvas(GLASS)],
    [TELESCOPE_ITEM_TEXTURE, rowsCanvas(TELESCOPE_ITEM)],
    [TRIPOD_TEXTURE, rowsCanvas(TRIPOD)],
    [SHIP_TEXTURE, paintedCanvas(32, (rect) => paintShip(rect, false))],
    [SHIP_OPEN_TEXTURE, paintedCanvas(32, (rect) => paintShip(rect, true))],
    [SHIP_FLAME_TEXTURE, paintedCanvas(16, paintShipFlame)],
    [BED_TEXTURE, paintedCanvas(32, paintBed)],
    [MUG_TEXTURE, rowsCanvas(MUG)],
    [EMPTY_MUG_TEXTURE, rowsCanvas(EMPTY_MUG)],
    [STEAM_TEXTURE, rowsCanvas(STEAM)],
    [TELESCOPE_STAND_TEXTURE, rowsCanvas(TELESCOPE_STAND)],
  ];
  for (const [key, canvas] of sheets) {
    if (!threeRegistered) {
      const tex = new THREE.CanvasTexture(canvas);
      tex.magFilter = THREE.NearestFilter;
      tex.minFilter = THREE.NearestFilter;
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.needsUpdate = true;
      registerTexture3D(key, tex);
    }
    if (!scene.textures.exists(key)) scene.textures.addCanvas(key, canvas);
  }
  threeRegistered = true;
};
