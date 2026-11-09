import type * as Engine from '@/game/engine';
import * as THREE from 'three';

import { ASSET_KEYS } from '@/game/constants';
import { registerTexture3D } from '@/game/render3d/textures3d';
import { createCanvas } from '@/game/platform/platform';

// A ARTE DA QUEST DO MARCO: o cepo, a terra preparada para a fogueira e o galho cortado em dois. O galho
// cortado é o PRÓPRIO sprite do graveto, duas vezes: a fidelidade é pedido do autor, e um desenho
// paralelo do mesmo objeto seria uma segunda gramática para ele.

const COLORS: Readonly<Record<string, string>> = {
  k: '#201812', W: '#96683e', w: '#68462a', L: '#ceaa76', l: '#aa8456', B: '#5c3e26',
  // A lenha: bem mais escura que o cepo, porque o sol quente do jogo dobra a cor e a pilha saía como barras de ouro.
  T: '#6f5636', t: '#584226', R: '#46301d', D: '#2f2014', E: '#8c7048',
  // As pedras em volta.
  H: '#6d6d72', s: '#4c4c52',
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

// A FOGUEIRA APAGADA: dois galhos cruzados, baixos e largos, com pedras nas pontas, e o V aberto é onde o fogo nasce.
// Lenha empilhada em pirâmide lia como um monte de tijolos: nas fogueiras de pixel art a base é rasa e a chama sai do meio.
const LOG_PILE = [
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '..kk........kk..',
  '.kETk......kRDk.',
  '..kTTk....kRRk..',
  '...kTTk..kRRk...',
  '.kkkkTTkkRRkkkk.',
  'kHHskkTTRRkkHHsk',
  'kssskkkkkkkkkssk',
];

export const CHOP_BLOCK_TEXTURE = 'wood-block';
export const FIRE_PIT_TEXTURE = 'wood-fire-pit';
export const LOG_PILE_TEXTURE = 'wood-log-pile';
export const SPLIT_WOOD_TEXTURE = 'split-wood';
export const WOOD_CRADLE_TEXTURE = 'wood-cradle';

const rowsCanvas = (rows: readonly string[]): HTMLCanvasElement => {
  const canvas = createCanvas();
  canvas.width = 16;
  canvas.height = 16;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return canvas;
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x += 1) {
      const color = COLORS[row[x]];
      if (!color) continue;
      ctx.fillStyle = color;
      ctx.fillRect(x, y, 1, 1);
    }
  });
  return canvas;
};

/** A terra limpa onde a fogueira vai nascer: um círculo de chão batido, de beira irregular. */
const pitCanvas = (): HTMLCanvasElement => {
  const size = 32;
  const canvas = createCanvas();
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return canvas;
  // Uma semente fixa: a mesma terra em toda partida.
  let seed = 41;
  const rand = (): number => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const center = (size - 1) / 2;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const angle = Math.atan2(y - center, x - center);
      const edge = 12.5 + Math.sin(angle * 5 + 1) * 1 + Math.sin(angle * 11) * 0.8;
      const dist = Math.hypot(x - center, y - center);
      if (dist > edge + rand() * 1.4) continue;
      const noise = rand();
      // Terra escura e apagada: é sobre ela que os galhos têm de aparecer.
      let color = noise < 0.2 ? '#352a1e' : noise < 0.6 ? '#3e3123' : '#463828';
      if (dist > edge - 1.5) color = noise < 0.5 ? '#2c2318' : '#352a1d';
      else if (noise > 0.965) color = '#5a4a35';
      ctx.fillStyle = color;
      ctx.fillRect(x, y, 1, 1);
    }
  }
  return canvas;
};

/** O galho cortado em dois: o sprite do graveto, duas vezes, um pouco afastados. */
const splitWoodCanvas = (scene: Engine.Scene): HTMLCanvasElement => {
  const canvas = createCanvas();
  canvas.width = 16;
  canvas.height = 16;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const source = scene.textures.get(ASSET_KEYS.woodIcon).getSourceImage() as CanvasImageSource;
  if (!ctx) return canvas;
  ctx.imageSmoothingEnabled = false;
  // Em tamanho natural: o graveto é fino, e encolhê-lo faria dele um risco.
  ctx.drawImage(source, -3, 0);
  ctx.drawImage(source, 3, 0);
  return canvas;
};

/** O graveto no colo: deitado, mais largo que o corpo do herói, e as duas luvas segurando por baixo. */
const woodCradleCanvas = (scene: Engine.Scene): HTMLCanvasElement => {
  const canvas = createCanvas();
  canvas.width = 16;
  canvas.height = 16;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const source = scene.textures.get(ASSET_KEYS.woodIcon).getSourceImage() as CanvasImageSource;
  if (!ctx) return canvas;
  ctx.imageSmoothingEnabled = false;
  // Um quarto de volta exato, para o pixel continuar pixel.
  for (const shift of [-3, -1, 1]) {
    ctx.setTransform(0, 1, -1, 0, 16 + shift, 0);
    ctx.drawImage(source, 0, 0);
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  for (const x of [3, 11]) {
    ctx.fillStyle = '#1d2758';
    ctx.fillRect(x, 8, 2, 3);
    ctx.fillStyle = '#2f3e80';
    ctx.fillRect(x, 8, 1, 1);
  }
  return canvas;
};

/** O sprite do graveto, para quem desenha fora do mundo (a tela de acender a fogueira). */
export const woodSprite = (scene: Engine.Scene): CanvasImageSource => scene.textures.get(ASSET_KEYS.woodIcon).getSourceImage() as CanvasImageSource;

const publish3D = (key: string, canvas: HTMLCanvasElement): void => {
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  registerTexture3D(key, tex);
};

let threeRegistered = false;

export const registerWoodTextures = (scene: Engine.Scene): void => {
  const sheets: ReadonlyArray<readonly [string, HTMLCanvasElement]> = [
    [CHOP_BLOCK_TEXTURE, rowsCanvas(CHOPPING_BLOCK)],
    [LOG_PILE_TEXTURE, rowsCanvas(LOG_PILE)],
    [FIRE_PIT_TEXTURE, pitCanvas()],
    [SPLIT_WOOD_TEXTURE, splitWoodCanvas(scene)],
    [WOOD_CRADLE_TEXTURE, woodCradleCanvas(scene)],
  ];
  for (const [key, canvas] of sheets) {
    if (!threeRegistered) publish3D(key, canvas);
    if (!scene.textures.exists(key)) scene.textures.addCanvas(key, canvas);
  }
  threeRegistered = true;
};
