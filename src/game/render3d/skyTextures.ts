import type Phaser from 'phaser';
import * as THREE from 'three';

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

export const SAND_TEXTURE = 'sky-sand';
export const ASH_TEXTURE = 'sky-ash';
export const GLASS_TEXTURE = 'sky-glass';
export const TELESCOPE_ITEM_TEXTURE = 'sky-telescope-item';
export const TRIPOD_TEXTURE = 'sky-tripod';
export const TELESCOPE_STAND_TEXTURE = 'sky-telescope-stand';

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
