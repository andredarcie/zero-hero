// A tiny pixel canvas for authoring sprites in code, plus the grid format the factory prefers.
//
// The primary authoring format is the TEXT GRID: 16 strings of 16 characters, '.' transparent,
// letters keyed to a palette map. It is deliberately the same shape `factory.mjs dump` prints for
// shipped sprites, so studying an original and drafting a new sprite are the same act.
//
// Pix exists for what grids can't say: seeded noise (foliage speckle), programmatic frames,
// mirroring. Everything stays binary-alpha by construction — there is no blending anywhere.

import { hexToRgb } from './palette.mjs';

export class Pix {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.data = new Uint8Array(width * height * 4);
  }

  set(x, y, rgb) {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return;
    const i = (y * this.width + x) * 4;
    this.data[i] = rgb[0]; this.data[i + 1] = rgb[1]; this.data[i + 2] = rgb[2];
    this.data[i + 3] = 255;
  }

  clear(x, y) {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return;
    this.data[(y * this.width + x) * 4 + 3] = 0;
  }

  get(x, y) {
    const i = (y * this.width + x) * 4;
    return this.data[i + 3] < 128
      ? null
      : [this.data[i], this.data[i + 1], this.data[i + 2]];
  }

  fillRect(x, y, w, h, rgb) {
    for (let yy = y; yy < y + h; yy += 1) for (let xx = x; xx < x + w; xx += 1) this.set(xx, yy, rgb);
  }

  hline(x0, x1, y, rgb) { for (let x = x0; x <= x1; x += 1) this.set(x, y, rgb); }
  vline(x, y0, y1, rgb) { for (let y = y0; y <= y1; y += 1) this.set(x, y, rgb); }

  /** Filled ellipse, hard-edged. cx/cy may be fractional (…+0.5 centres on a pixel seam). */
  ellipse(cx, cy, rx, ry, rgb) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y += 1) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x += 1) {
        const dx = (x + 0.5 - cx) / rx; const dy = (y + 0.5 - cy) / ry;
        if (dx * dx + dy * dy <= 1) this.set(x, y, rgb);
      }
    }
  }

  /** Stamp a text grid at (ox, oy). palette maps letter → '#rrggbb'. '.' and ' ' are transparent. */
  stampGrid(grid, palette, ox = 0, oy = 0) {
    const rgbs = Object.fromEntries(Object.entries(palette).map(([k, v]) => [k, hexToRgb(v)]));
    grid.forEach((row, y) => {
      for (let x = 0; x < row.length; x += 1) {
        const ch = row[x];
        if (ch === '.' || ch === ' ') continue;
        const rgb = rgbs[ch];
        if (!rgb) throw new Error(`grid uses '${ch}' at ${x},${y + oy} but palette has no such key`);
        this.set(ox + x, oy + y, rgb);
      }
    });
  }

  /** Copy another Pix in at (ox, oy) — transparent pixels don't overwrite. */
  blit(src, ox, oy) {
    for (let y = 0; y < src.height; y += 1) {
      for (let x = 0; x < src.width; x += 1) {
        const c = src.get(x, y);
        if (c) this.set(ox + x, oy + y, c);
      }
    }
  }

  mirrorX() {
    const out = new Pix(this.width, this.height);
    for (let y = 0; y < this.height; y += 1) {
      for (let x = 0; x < this.width; x += 1) {
        const c = this.get(x, y);
        if (c) out.set(this.width - 1 - x, y, c);
      }
    }
    return out;
  }

  toImage() { return { width: this.width, height: this.height, data: this.data }; }
}

/** Deterministic RNG (mulberry32) — foliage speckle must not change between two builds, or the
 *  self-review loop can't tell an edit from noise. */
export const seededRng = (seed) => {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/** Sprinkle rgb over the region where mask(x,y) is true, with probability p — the tree/grass
 *  speckle idiom. */
export const speckle = (pix, rng, p, rgb, mask) => {
  for (let y = 0; y < pix.height; y += 1) {
    for (let x = 0; x < pix.width; x += 1) {
      if (mask(x, y) && rng() < p) pix.set(x, y, rgb);
    }
  }
};

/** Render a text grid straight to an image (single-frame convenience). */
export const gridToImage = (grid, palette) => {
  const h = grid.length;
  const w = Math.max(...grid.map((r) => r.length));
  const pix = new Pix(w, h);
  pix.stampGrid(grid, palette);
  return pix.toImage();
};

/** Lay frames out into one sheet image. layout: 'row' (16×16 → 80×16) or 'column' (16×32). */
export const framesToSheet = (frames, layout = 'row') => {
  const fw = frames[0].width; const fh = frames[0].height;
  for (const f of frames) {
    if (f.width !== fw || f.height !== fh) throw new Error('all frames must share one size');
  }
  const cols = layout === 'row' ? frames.length : 1;
  const rows = layout === 'row' ? 1 : frames.length;
  const sheet = new Pix(fw * cols, fh * rows);
  frames.forEach((f, i) => {
    const p = new Pix(f.width, f.height);
    p.data.set(f.data);
    sheet.blit(p, layout === 'row' ? i * fw : 0, layout === 'row' ? 0 : i * fh);
  });
  return sheet.toImage();
};
