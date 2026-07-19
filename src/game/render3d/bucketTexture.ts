import * as THREE from 'three';
import type Phaser from 'phaser';

import { registerTexture3D } from '@/game/render3d/textures3d';

// Procedural pixel-art water bucket, painted in the game's own wood/iron/water palette — the same
// approach as stoneTexture.ts / woodTexture.ts, so a new item looks authored, not bolted on.
//
// Two states, EMPTY and FULL, drawn once and published into BOTH texture pipelines: THREE (the
// 3D back-item + ground-pickup billboards) and Phaser (the item-get ceremony and the swing sprite).
// The game has no HUD — the empty/full state simply reads as the art the hero carries on his back.

const PALETTE: Record<string, readonly [number, number, number, number]> = {
  '.': [0, 0, 0, 0], // transparent
  k: [0x24, 0x1a, 0x10, 255], // charred outline (matches the wood art's darkest line)
  w: [0x6b, 0x4a, 0x2c, 255], // stave in shadow
  l: [0x9a, 0x70, 0x47, 255], // stave, lit (the wood palette's bright plank)
  m: [0x9a, 0xa0, 0xa8, 255], // iron band / handle
  a: [0x4f, 0x74, 0xa8, 255], // water (the river's slate-navy)
  b: [0xa9, 0xc2, 0xe6, 255], // water glint
};

// Authored top-down (row 0 = the handle arc above the rim). 14 wide × 15 tall.
const EMPTY = [
  '....mmmmmm....',
  '...m......m...',
  '..m........m..',
  '..m........m..',
  '.kkkkkkkkkkkk.',
  '.kllllllllllk.',
  '.kwlwlwlwlwlk.',
  '.kmmmmmmmmmmk.',
  '.kwlwlwlwlwlk.',
  '.kwlwlwlwlwlk.',
  '..kwlwlwlwlk..',
  '..kmmmmmmmmk..',
  '..kwlwlwlwlk..',
  '..kwwwwwwwwk..',
  '...kkkkkkkk...',
] as const;

// The full bucket is the empty one with water filling the brim (surface glint over water body).
const FULL = EMPTY.map((row, i) =>
  (i === 5 ? '.kbbbbbbbbbbk.' : i === 6 ? '.kaaaaaaaaaak.' : row));

const BUCKET_KEY = { empty: 'bucket-icon', full: 'bucket-full-icon' } as const;

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

// The THREE registry is a module-level map that outlives a scene restart, so register it only once.
let threeRegistered = false;

/**
 * Publish the two bucket textures into the THREE (3D) and Phaser (2D) registries under the keys
 * `bucket-icon` and `bucket-full-icon`. Call once at scene boot, AFTER the 3D loader has run
 * (GameScene.create). Idempotent per pipeline — safe across scene restarts.
 */
export const registerBucketTextures = (scene: Phaser.Scene): void => {
  for (const state of ['empty', 'full'] as const) {
    const key = BUCKET_KEY[state];
    const needThree = !threeRegistered;
    const needPhaser = !scene.textures.exists(key);
    if (!needThree && !needPhaser) continue;
    const canvas = makeCanvas(state === 'empty' ? EMPTY : FULL);
    if (needThree) {
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
