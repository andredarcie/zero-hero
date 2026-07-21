import * as THREE from 'three';
import type Phaser from 'phaser';

import { registerTexture3D } from '@/game/render3d/textures3d';

export const LEVEL_PORTAL_PARTICLE_KEY = 'level-portal-particle';
export const LEVEL_PORTAL_SIGIL_KEY = 'level-portal-sigil';

const PALETTE: Record<string, readonly [number, number, number, number]> = {
  '.': [0, 0, 0, 0],
  d: [0x39, 0x22, 0x8b, 255],
  p: [0x88, 0x2c, 0x98, 255],
  h: [0xaf, 0x3f, 0xc3, 255],
  w: [0xcd, 0xcd, 0xcd, 255],
};

// Pequeno losango com nucleo claro. Ao ser ampliado com NEAREST continua sendo uma particula
// de pixels inteiros, nao uma esfera/gradiente alheia aos sprites do jogo.
const PARTICLE = [
  '.h.',
  'hwh',
  '.h.',
] as const;

// Glifo de soleira deitado no chao. As lacunas deixam o desenho respirar e impedem que o portal
// vire uma mancha roxa; o pulso vem apenas de alpha discreto no LevelPortalObject.
const SIGIL = [
  '................',
  '....pp....pp....',
  '..ph........hp..',
  '.hd..........dh.',
  '..ph........hp..',
  '....pp....pp....',
  '................',
  '................',
] as const;

const makeCanvas = (rows: readonly string[]): HTMLCanvasElement => {
  const canvas = document.createElement('canvas');
  canvas.width = rows[0].length;
  canvas.height = rows.length;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  const image = ctx.createImageData(canvas.width, canvas.height);
  rows.forEach((row, y) => row.split('').forEach((pixel, x) => {
    const [r, g, b, a] = PALETTE[pixel] ?? PALETTE['.'];
    const i = (y * canvas.width + x) * 4;
    image.data[i] = r;
    image.data[i + 1] = g;
    image.data[i + 2] = b;
    image.data[i + 3] = a;
  }));
  ctx.putImageData(image, 0, 0);
  return canvas;
};

let registered = false;

/** Registra apenas os acentos procedurais; o portal principal vem do sheet da Sprite Factory. */
export const registerLevelPortalTextures = (_scene: Phaser.Scene): void => {
  if (registered) return;
  const entries = [
    [LEVEL_PORTAL_PARTICLE_KEY, PARTICLE],
    [LEVEL_PORTAL_SIGIL_KEY, SIGIL],
  ] as const;
  for (const [key, rows] of entries) {
    const texture = new THREE.CanvasTexture(makeCanvas(rows));
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;
    registerTexture3D(key, texture);
  }
  registered = true;
};
