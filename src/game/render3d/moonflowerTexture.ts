import * as THREE from 'three';
import type Phaser from 'phaser';

import { registerTexture3D } from '@/game/render3d/textures3d';

// Procedural pixel-art for the night-blooming flower (MoonflowerObject) — the same generate-at-boot
// approach as bucketTexture.ts, published into both the THREE (3D billboard) and Phaser (editor
// palette) registries under `moonflower-bud` and `moonflower-bloom`.
//
// Both are TOP-DOWN (the flower lies flat on the ground): a small teal CLOSED POD, and a wide,
// pale MOONLIT bloom of six petals with a glowing pollen centre — drawn bright so it blooms in the
// post-process (the bioluminescence you only see in the dark).

const KEY = { bud: 'moonflower-bud', bloom: 'moonflower-bloom' } as const;

// The game's own palette, lifted from the tileset flowers (frames 10/11) and the grass, so the
// moonflower reads as authored, not bolted on: a black outline, the exact lavender of the tileset's
// purple flower, and the grass green for the bud/stem. A moonlit pale + a gold pollen centre give
// it the "night flower that glows" read on top of that base.
const C = {
  out: [0x00, 0x00, 0x00], // outline (every tileset sprite has one)
  // moonlit lavender petals (mid + shadow are the tileset flower's exact #a884f3 / #8d6cd1)
  petHi: [0xe8, 0xe2, 0xfb],
  petMid: [0xa8, 0x84, 0xf3],
  petLo: [0x8d, 0x6c, 0xd1],
  // gold pollen centre (glows in the dark)
  cenHi: [0xf3, 0xe6, 0xa0],
  cenLo: [0xcf, 0xa8, 0x52],
  // grass green for the bud + stem (#626439 / #3a3f3f, plus a lifted highlight)
  grnHi: [0x7c, 0x80, 0x4a],
  grnMid: [0x62, 0x64, 0x39],
  grnLo: [0x3a, 0x3f, 0x3f],
} as const;

const setPx = (
  data: Uint8ClampedArray, x: number, y: number, w: number, rgb: readonly number[], a = 255,
): void => {
  const i = (y * w + x) * 4;
  data[i] = rgb[0]; data[i + 1] = rgb[1]; data[i + 2] = rgb[2]; data[i + 3] = a;
};

// The open bloom, TOP-DOWN: six scalloped petals with a hard black outline, flat lavender shade
// BANDS (not a smooth gradient — that is what read as "flat/plain" before), a gold pollen centre,
// and dark creases between the petals. Bright, so it blooms in the post-process (the glow).
const makeBloom = (): HTMLCanvasElement => {
  const w = 22; const h = 22;
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  const img = ctx.createImageData(w, h);
  const cx = w / 2; const cy = h / 2;
  const rOut = w / 2 - 0.6;
  const rCen = rOut * 0.34;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const dx = x - cx + 0.5; const dy = y - cy + 0.5;
      const r = Math.hypot(dx, dy);
      const ang = Math.atan2(dy, dx);
      const lobe = Math.abs(Math.cos(3 * ang)); // 1 at a petal's middle, 0 in the crease between
      const boundary = rOut * (0.6 + 0.4 * lobe);
      if (r > boundary) { setPx(img.data, x, y, w, C.out, 0); continue; }
      if (r > boundary - 1.25) { setPx(img.data, x, y, w, C.out); continue; } // the petals' outline
      if (r < rCen) {
        setPx(img.data, x, y, w, r < rCen * 0.55 ? C.cenHi : C.cenLo); // gold pollen
        continue;
      }
      // A dark crease down the gap between two petals.
      if (lobe < 0.13) { setPx(img.data, x, y, w, C.petLo); continue; }
      // Flat radial bands (pixel-art), not a gradient.
      const t = (r - rCen) / (boundary - rCen);
      setPx(img.data, x, y, w, t < 0.34 ? C.petHi : t < 0.7 ? C.petMid : C.petLo);
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
};

// The closed bud, drawn SIDE-ON (it stands upright as a billboard, so it reads as a solid thing
// blocking the way, not a sheet of paper on the floor): a grass-green teardrop of folded sepals —
// bulging low, tapering to a point where a sliver of the lavender petals peeks out — on a short
// stem. Black outline + flat green shade bands (highlight left, shadow right), the game's style.
const BUD_W = 16;
const BUD_H = 22;
const makeBud = (): HTMLCanvasElement => {
  const w = BUD_W; const h = BUD_H;
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  const img = ctx.createImageData(w, h);
  const cx = w / 2;
  const bulbCy = h * 0.47; const rx = w * 0.36; const ry = h * 0.27;
  const bulbTop = bulbCy - ry; const bulbBottom = bulbCy + ry;
  const tipTop = h * 0.06;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const dx = x - cx + 0.5; const dy = y - bulbCy + 0.5;
      const e = (dx * dx) / (rx * rx) + (dy * dy) / (ry * ry);
      let kind: 'body' | 'tip' | 'stem' | null = null;
      if (e <= 1) kind = 'body';
      else if (y >= tipTop && y <= bulbTop) {
        const tt = (y - tipTop) / (bulbTop - tipTop); // 0 at the point → 1 at the bulb
        if (Math.abs(dx) <= rx * 0.6 * tt) kind = 'tip';
      }
      if (!kind && y >= bulbBottom - 2 && y <= h - 2 && Math.abs(dx) <= 1.4) kind = 'stem';
      if (!kind) { setPx(img.data, x, y, w, C.out, 0); continue; }
      if (kind === 'stem') {
        setPx(img.data, x, y, w, Math.abs(dx) > 1.0 ? C.out : dx < 0 ? C.grnMid : C.grnLo);
      } else if (kind === 'tip') {
        // The petals peeking from the folded bud tip — a hint of the bloom's lavender.
        const tt = (y - tipTop) / (bulbTop - tipTop);
        setPx(img.data, x, y, w, tt < 0.35 ? C.out : dx < 0 ? C.petHi : C.petMid);
      } else if (e > 0.78) {
        setPx(img.data, x, y, w, C.out); // the black outline rim
      } else {
        // Flat vertical shade bands — highlight on the left, shadow on the right (+ a seam).
        const seam = Math.abs(dx) < 0.9;
        setPx(img.data, x, y, w, seam ? C.grnLo : dx < -rx * 0.28 ? C.grnHi : dx < rx * 0.3 ? C.grnMid : C.grnLo);
      }
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
};

let threeRegistered = false;

/** Publish the bud + bloom textures into the THREE and Phaser registries. Call once at scene boot. */
export const registerMoonflowerTextures = (scene: Phaser.Scene): void => {
  const entries = [['bud', makeBud], ['bloom', makeBloom]] as const;
  for (const [state, make] of entries) {
    const key = KEY[state];
    const needThree = !threeRegistered;
    const needPhaser = !scene.textures.exists(key);
    if (!needThree && !needPhaser) continue;
    const canvas = make();
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
