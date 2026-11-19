// AS TEXTURAS DAS RELÍQUIAS E DA TORRE: o desenho de relicArt e towerArt virando textura, nas duas pipelines — no 3D
// (a relíquia pulando do buraco, a terra revirada, a torre) e no 2D (a cerimônia de "você encontrou" e o caderno).

import type * as Engine from '@/game/engine';
import * as THREE from 'three';

import { createCanvas } from '@/game/platform/platform';
import { RELIC_KINDS, type RelicKind } from '@/game/relics/relics';
import { registerTexture3D } from '@/game/render3d/textures3d';
import { DUG_PATCH_ART, DUG_PATCH_COLORS, penOf, RELIC_ART, RELIC_PX, SAND_ART_COLORS, SAND_DUG_ART, SAND_HINT_ART } from './relicArt';
import { paintTower, TOWER_H, TOWER_W } from './towerArt';

export const relicTexture = (kind: RelicKind): string => `relic-${kind}`;
export const DUG_PATCH_TEXTURE = 'ground-dug';
/** Na areia da praia: a pontinha do cartão que aparece (no lugar da trinca), e a areia revirada depois da pá. */
export const SAND_HINT_TEXTURE = 'sand-relic-hint';
export const SAND_DUG_TEXTURE = 'sand-dug';
export const TOWER_TEXTURE = 'cell-tower';

/** Um canvas pintado pelo pincel das relíquias (cor vazia apaga). */
const painted = (w: number, h: number, paint: (rect: (color: string, x: number, y: number, w: number, h: number) => void) => void): HTMLCanvasElement => {
  const canvas = createCanvas();
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  paint((color, x, y, rw, rh) => {
    if (!color) { ctx.clearRect(x, y, rw, rh); return; }
    ctx.fillStyle = color;
    ctx.fillRect(x, y, rw, rh);
  });
  return canvas;
};

const groundPaint = (art: readonly string[], colors: Readonly<Record<string, readonly [number, number, number, number]>>): HTMLCanvasElement => {
  const size = art.length;
  const canvas = createCanvas();
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  const image = ctx.createImageData(size, size);
  art.forEach((row, y) => {
    for (let x = 0; x < row.length; x += 1) {
      const color = colors[row[x]];
      if (color) image.data.set(color, (y * size + x) * 4);
    }
  });
  ctx.putImageData(image, 0, 0);
  return canvas;
};

const to3D = (key: string, canvas: HTMLCanvasElement): void => {
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  registerTexture3D(key, tex);
};

// O registro THREE é um mapa de módulo que sobrevive ao restart da cena: registrar uma vez só.
let threeRegistered = false;

export const registerRelicTextures = (scene: Engine.Scene): void => {
  for (const kind of RELIC_KINDS) {
    const key = relicTexture(kind);
    const canvas = painted(RELIC_PX, RELIC_PX, (rect) => RELIC_ART[kind](penOf(rect)));
    if (!threeRegistered) to3D(key, canvas);
    if (!scene.textures.exists(key)) scene.textures.addCanvas(key, canvas);
  }
  if (!threeRegistered) {
    to3D(DUG_PATCH_TEXTURE, groundPaint(DUG_PATCH_ART, DUG_PATCH_COLORS));
    to3D(SAND_HINT_TEXTURE, groundPaint(SAND_HINT_ART, SAND_ART_COLORS));
    to3D(SAND_DUG_TEXTURE, groundPaint(SAND_DUG_ART, SAND_ART_COLORS));
    to3D(TOWER_TEXTURE, painted(TOWER_W, TOWER_H, paintTower));
  }
  threeRegistered = true;
};
