// Renders a review sheet for a sprite — the artifact the self-improve loop LOOKS at.
//
// One PNG, three rows per frame column:
//   1. the frame at 12× over a checkerboard (shape + palette judgement)
//   2. the frame at 6× composited on the REAL day grass tile (public/assets grass.png)
//   3. the same on a night-graded grass tile — the game is mostly night, and a sprite that only
//      reads in daylight is a sprite that doesn't work.
//   4. a 1× strip at true scale, because zoom flatters everything.
//
// The context tiles are the shipped ones, not mockups: if the sprite vanishes against them here,
// it will vanish in game.

import path from 'node:path';
import { Pix } from './pixel.mjs';
import { readPng } from './png.mjs';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const GRASS_TILE = path.join(ROOT, 'public', 'assets', 'environment', 'terrain', 'grass.png');

const CHECKER = [[70, 70, 78], [92, 92, 102]];

// The night grade: crush toward the ink-navy ambient the 3D lighting produces.
const nightify = ([r, g, b]) => [
  Math.round(r * 0.22 + 14),
  Math.round(g * 0.22 + 12),
  Math.round(b * 0.30 + 38),
];

const frameAt = (image, f, frameW, frameH) => {
  const cols = image.width / frameW;
  const fx = (f % cols) * frameW; const fy = Math.floor(f / cols) * frameH;
  return (x, y) => {
    const i = ((fy + y) * image.width + fx + x) * 4;
    return image.data[i + 3] >= 128
      ? [image.data[i], image.data[i + 1], image.data[i + 2]]
      : null;
  };
};

export const makePreview = (image, { frameW = 16, frameH = 16 } = {}) => {
  const frames = (image.width / frameW) * (image.height / frameH);
  let grass = null;
  try { grass = readPng(GRASS_TILE); } catch { /* factory still works outside the repo */ }
  const grassAt = grass ? (x, y) => {
    const i = ((y % grass.height) * grass.width + (x % grass.width)) * 4;
    return [grass.data[i], grass.data[i + 1], grass.data[i + 2]];
  } : () => [100, 185, 100];

  const PAD = 8;
  const Z1 = 12; const Z2 = 6;
  const cellW = Math.max(frameW * Z1, frameW * Z2) + PAD;
  const rowY = [
    PAD,                                  // checker 12x
    PAD + frameH * Z1 + PAD,              // day 6x
    PAD + frameH * Z1 + PAD + frameH * Z2 + PAD, // night 6x
  ];
  const oneXY = rowY[2] + frameH * Z2 + PAD;
  const W = PAD + frames * cellW;
  const H = oneXY + frameH + PAD;
  const out = new Pix(W, H);
  out.fillRect(0, 0, W, H, [24, 24, 28]);

  for (let f = 0; f < frames; f += 1) {
    const px = frameAt(image, f, frameW, frameH);
    const baseX = PAD + f * cellW;

    // 12× on checkerboard
    for (let y = 0; y < frameH * Z1; y += 1) {
      for (let x = 0; x < frameW * Z1; x += 1) {
        const sx = Math.floor(x / Z1); const sy = Math.floor(y / Z1);
        const c = px(sx, sy) ?? CHECKER[(sx + sy) & 1];
        out.set(baseX + x, rowY[0] + y, c);
      }
    }
    // 6× on day grass, then night grass
    for (const [row, grade] of [[rowY[1], (c) => c], [rowY[2], nightify]]) {
      for (let y = 0; y < frameH * Z2; y += 1) {
        for (let x = 0; x < frameW * Z2; x += 1) {
          const sx = Math.floor(x / Z2); const sy = Math.floor(y / Z2);
          const c = px(sx, sy) ?? grassAt(sx, sy);
          out.set(baseX + x, row + y, grade(c));
        }
      }
    }
    // 1× true scale on day grass
    for (let y = 0; y < frameH; y += 1) {
      for (let x = 0; x < frameW; x += 1) {
        out.set(baseX + x, oneXY + y, px(x, y) ?? grassAt(x, y));
      }
    }
  }
  return out.toImage();
};
