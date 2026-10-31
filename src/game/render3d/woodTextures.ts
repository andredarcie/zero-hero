import type Phaser from 'phaser';
import * as THREE from 'three';

import { registerTexture3D } from '@/game/render3d/textures3d';

// A ARTE DA QUEST DO BRAM: o cepo, com a madeira que chega, e o suporte da lenha. A pilha é desenhada
// da que o jogador montou, em três tons: ela clareia enquanto seca (ver `publishStack`).

const COLORS: Readonly<Record<string, readonly [number, number, number, number]>> = {
  '.': [0, 0, 0, 0],
  k: [32, 24, 18, 255],
  W: [150, 104, 62, 255],
  w: [104, 70, 42, 255],
  L: [206, 170, 118, 255], // o topo cortado
  l: [170, 132, 86, 255],
  B: [92, 62, 38, 255], // casca
  S: [168, 168, 160, 255], // a lâmina
};

const CHOPPING_BLOCK = [
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '....kkkkkkkk....',
  '...kLLlLLLLLk...',
  '...kLlLLlLLLk...',
  '....kkkkkkkk....',
  '...kBWBWWBWBk...',
  '...kBWWBWWBBk...',
  '...kBWBWWBWBk...',
  '...kBBWBWWBBk...',
  '....kkkkkkkk....',
  '................',
];

// Um pedaço de madeira deitado, ao lado do cepo, por unidade que chega.
const LOG_SPOTS: ReadonlyArray<readonly [number, number]> = [[0, 12], [11, 12], [0, 9], [11, 9]];

const paintRows = (ctx: CanvasRenderingContext2D, rows: readonly string[], ox = 0, oy = 0): void => {
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x += 1) {
      const [r, g, b, a] = COLORS[row[x]] ?? COLORS['.'];
      if (a === 0) continue;
      ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
      ctx.fillRect(ox + x, oy + y, 1, 1);
    }
  });
};

const LOG = ['kkkkk', 'kBWBl', 'kWBWL', 'kkkkk'];

const blockCanvas = (logs: number): HTMLCanvasElement => {
  const canvas = document.createElement('canvas');
  canvas.width = 16;
  canvas.height = 16;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  paintRows(ctx, CHOPPING_BLOCK);
  for (let i = 0; i < logs; i += 1) paintRows(ctx, LOG, LOG_SPOTS[i][0], LOG_SPOTS[i][1]);
  return canvas;
};

// O SUPORTE: dois trilhos que seguram a lenha fora do chão. Chão molhado encharca a lenha de baixo.
export const STACK_COLS = 5;
export const STACK_ROWS = 3;
const STACK_SIZE = 32;
const CELL_W = 6;
const CELL_H = 6;
const RACK_X = 1;
const RACK_BOTTOM = 25;

/** Do verde recém-rachado (0) ao seco (3): a madeira clareia. */
const DRY_TONES: ReadonlyArray<{ top: string; ring: string }> = [
  { top: '#7d6242', ring: '#5a452c' },
  { top: '#927450', ring: '#6a5338' },
  { top: '#a98a62', ring: '#7c6444' },
  { top: '#bfa27a', ring: '#8f7650' },
];

const stackCanvas = (heights: readonly number[], dry: number): HTMLCanvasElement => {
  const canvas = document.createElement('canvas');
  canvas.width = STACK_SIZE;
  canvas.height = STACK_SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  const rect = (color: string, x: number, y: number, w: number, h: number): void => {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w, h);
  };
  const tone = DRY_TONES[Math.max(0, Math.min(DRY_TONES.length - 1, dry))];
  // Os trilhos e os pés.
  rect('#201812', RACK_X - 1, RACK_BOTTOM, CELL_W * STACK_COLS + 2, 2);
  rect('#8e623a', RACK_X, RACK_BOTTOM, CELL_W * STACK_COLS, 1);
  rect('#201812', RACK_X, RACK_BOTTOM + 2, 2, 3);
  rect('#201812', RACK_X + CELL_W * STACK_COLS - 2, RACK_BOTTOM + 2, 2, 3);
  heights.forEach((height, col) => {
    for (let row = 0; row < height; row += 1) {
      const x = RACK_X + col * CELL_W;
      const y = RACK_BOTTOM - (row + 1) * CELL_H;
      // O topo de uma tora, redondo: sem os quatro cantos, e com o miolo.
      rect('#201812', x + 1, y, CELL_W - 2, CELL_H);
      rect('#201812', x, y + 1, CELL_W, CELL_H - 2);
      rect(tone.top, x + 1, y + 1, CELL_W - 2, CELL_H - 2);
      rect(tone.ring, x + 2, y + 2, CELL_W - 4, CELL_H - 4);
    }
  });
  return canvas;
};

const publish3D = (key: string, canvas: HTMLCanvasElement): void => {
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  registerTexture3D(key, tex);
};

export const chopBlockTexture = (logs: number): string => `wood-block-${logs}`;
export const WOOD_STACK_TEXTURE = 'wood-stack';

let threeRegistered = false;

export const registerWoodTextures = (scene: Phaser.Scene): void => {
  for (let logs = 0; logs <= LOG_SPOTS.length; logs += 1) {
    const key = chopBlockTexture(logs);
    const canvas = blockCanvas(logs);
    if (!threeRegistered) publish3D(key, canvas);
    if (!scene.textures.exists(key)) scene.textures.addCanvas(key, canvas);
  }
  threeRegistered = true;
};

/** O suporte com a pilha que o jogador montou. A textura é trocada inteira a cada tom. */
export const publishStack = (heights: readonly number[], dry: number): void => {
  publish3D(WOOD_STACK_TEXTURE, stackCanvas(heights, dry));
};
