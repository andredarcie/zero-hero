import * as THREE from 'three';
import type Phaser from 'phaser';

import { registerTexture3D } from '@/game/render3d/textures3d';

// Carvao procedural em pixel-art, na mesma paleta queimada do jogo — o mesmo esquema do
// bucketTexture: desenhado uma vez e publicado nas DUAS pipelines de textura, THREE (billboard
// de chao + costas do heroi + carga do braco) e Phaser (cerimonia de item-get e o swing).
//
// O carvao e o PRODUTO do fogo (um arbusto seco que terminou de arder as vezes o deixa) e o
// alimento da tocha: pisar nele segurando o graveto ACESO o consome e enche o combustivel.

const PALETTE: Record<string, readonly [number, number, number, number]> = {
  '.': [0, 0, 0, 0], // transparente
  k: [0x1c, 0x16, 0x12, 255], // contorno carbonizado (o mais escuro da arte de madeira)
  c: [0x2f, 0x2a, 0x25, 255], // corpo do carvao
  g: [0x4a, 0x44, 0x3d, 255], // faceta cinzenta
  h: [0x6e, 0x66, 0x5c, 255], // brilho frio da faceta
  o: [0xd2, 0x62, 0x2a, 255], // brasa ainda viva
  y: [0xf2, 0xa8, 0x4e, 255], // miolo claro da brasa
};

// 14×12, um naco de carvao com facetas e duas brasas respirando por dentro.
const LUMP = [
  '..............',
  '.....kkkk.....',
  '...kkcggckk...',
  '..kcgghhgcck..',
  '.kcghcoycgcck.',
  '.kccgcgcgccgk.',
  '.kgccgccohcck.',
  '.kccgcccgcck..',
  '..kccgccgck...',
  '...kkccckk....',
  '.....kkkk.....',
  '..............',
] as const;

export const CHARCOAL_TEXTURE_KEY = 'charcoal-item';

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

/**
 * Publica a textura do carvao nas duas pipelines sob a chave `charcoal-item`. Chamar no boot da
 * cena, DEPOIS do loader 3D (GameScene.create). Idempotente por pipeline, como o balde.
 */
export const registerCharcoalTexture = (scene: Phaser.Scene): void => {
  const needThree = !threeRegistered;
  const needPhaser = !scene.textures.exists(CHARCOAL_TEXTURE_KEY);
  if (!needThree && !needPhaser) return;
  const canvas = makeCanvas(LUMP);
  if (needThree) {
    const tex = new THREE.CanvasTexture(canvas);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    registerTexture3D(CHARCOAL_TEXTURE_KEY, tex);
  }
  if (needPhaser) scene.textures.addCanvas(CHARCOAL_TEXTURE_KEY, canvas);
  threeRegistered = true;
};
