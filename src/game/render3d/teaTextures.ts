import type * as Engine from '@/game/engine';
import * as THREE from 'three';

import { registerTexture3D } from '@/game/render3d/textures3d';
import { createCanvas } from '@/game/platform/platform';

// A ARTE DO CHÁ DA SHUI: as três pedras com os gravetos, a chama pequena (dois quadros), a chaleira de ferro, o
// cogumelo de chapéu pontudo que veio na cesta e a gota de chá. Pixel desenhado aqui, nas duas pipelines, no traço
// da caneca da Thea (ver skyTextures): 16 px por tile, contorno escuro, as cores do vale.

const PALETTE: Readonly<Record<string, readonly [number, number, number, number]>> = {
  '.': [0, 0, 0, 0],
  k: [32, 24, 18, 255], // contorno
  A: [138, 134, 126, 255], // pedra
  a: [96, 92, 88, 255],
  W: [150, 104, 62, 255], // graveto
  m: [104, 70, 42, 255],
  e: [236, 118, 44, 255], // brasa
  Y: [255, 228, 132, 255], // a chama
  O: [244, 150, 56, 255],
  R: [198, 74, 40, 255],
  I: [118, 124, 138, 255], // o ferro da chaleira
  i: [78, 82, 96, 255],
  d: [50, 52, 64, 255],
  T: [196, 160, 104, 255], // o chapéu do cogumelo (Psilocybe semilanceata): pardo, com o bico na ponta
  t: [146, 110, 66, 255],
  P: [228, 216, 184, 255], // o pé, claro e fino
  c: [112, 72, 44, 255], // o chá
};

// Pequenos de propósito: uma chaleira de verdade é um quarto da altura de quem a carrega (o tile é a altura da Shui).
const EMPTY = '................';

const HEARTH = [
  ...Array<string>(12).fill(EMPTY),
  '......W..W......',
  '...kk..WW..kk...',
  '..kAak.ee.kaAk..',
  '...kk......kk...',
];

const FLAME_A = [
  ...Array<string>(10).fill(EMPTY),
  '.......Y........',
  '.......OY.......',
  '......OYO.......',
  '.......RO.......',
  EMPTY,
  EMPTY,
];

const FLAME_B = [
  ...Array<string>(10).fill(EMPTY),
  '........Y.......',
  '.......YO.......',
  '.......OYO......',
  '.......OR.......',
  EMPTY,
  EMPTY,
];

const KETTLE = [
  ...Array<string>(7).fill(EMPTY),
  '......kkkk......',
  '.....k....k.....',
  '.....kkIIkk.....',
  '....kIiiiiIk.kk.',
  '....kiiiiiiikIk.',
  '....kdiiiiidk...',
  '.....kddddk.....',
  '......kkkk......',
  EMPTY,
];

const LIBERTY_CAP = [
  '................',
  '................',
  '................',
  '.......k........',
  '......kTk.......',
  '.....kTTTk......',
  '.....kTtTk......',
  '....kTTtTTk.....',
  '....ktttttk.....',
  '.....kkPkk......',
  '.......kPk......',
  '......kPk.......',
  '......kPk.......',
  '.......kPk......',
  '.......kk.......',
  '................',
];

const DROP = ['cc', 'cc'];

export const TEA_HEARTH_TEXTURE = 'tea-hearth';
export const TEA_FLAME_TEXTURES = ['tea-flame-a', 'tea-flame-b'] as const;
export const TEA_KETTLE_TEXTURE = 'tea-kettle';
export const LIBERTY_CAP_TEXTURE = 'tea-liberty-cap';
export const TEA_DROP_TEXTURE = 'tea-drop';

const rowsCanvas = (rows: readonly string[]): HTMLCanvasElement => {
  const canvas = createCanvas();
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

export const registerTeaTextures = (scene: Engine.Scene): void => {
  const sheets: ReadonlyArray<readonly [string, readonly string[]]> = [
    [TEA_HEARTH_TEXTURE, HEARTH],
    [TEA_FLAME_TEXTURES[0], FLAME_A],
    [TEA_FLAME_TEXTURES[1], FLAME_B],
    [TEA_KETTLE_TEXTURE, KETTLE],
    [LIBERTY_CAP_TEXTURE, LIBERTY_CAP],
    [TEA_DROP_TEXTURE, DROP],
  ];
  for (const [key, rows] of sheets) {
    const canvas = rowsCanvas(rows);
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
