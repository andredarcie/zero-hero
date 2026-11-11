import { describe, expect, it } from 'vitest';

import { paintYard, YARD_DEPTH, YARD_LEAF, YARD_PEBBLE, YARD_RAMP, YARD_TEXELS, YARD_WIDTH } from './homeYard';

const W = YARD_WIDTH * YARD_TEXELS;
const H = YARD_DEPTH * YARD_TEXELS;

/** O terreiro pintado: a cor de cada pixel (o último que o pintou), ou nada onde ficou transparente. */
const paint = (seed: number): Array<string | undefined> => {
  const px: Array<string | undefined> = new Array(W * H);
  paintYard((color, x, y, w, h) => {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) px[(y + j) * W + x + i] = color;
  }, seed);
  return px;
};
const lum = (hex: string): number => {
  const n = parseInt(hex.slice(1), 16);
  return 0.3 * (n >> 16) + 0.59 * ((n >> 8) & 255) + 0.11 * (n & 255);
};
const at = (px: Array<string | undefined>, x: number, y: number): string | undefined =>
  (x >= 0 && y >= 0 && x < W && y < H ? px[y * W + x] : undefined);
const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;

describe('o terreiro das casas', () => {
  const seeds = [1, 2, 3, 4];

  it('só leva a terra, a pedrinha e a folha seca: nenhum verde pintado (o capim volta por buraco, na cor do bioma) e nenhum graveto', () => {
    const allowed = new Set<string>([...YARD_RAMP, ...YARD_PEBBLE, ...YARD_LEAF]);
    for (const s of seeds) for (const c of paint(s)) if (c) expect(allowed.has(c)).toBe(true);
  });

  it('nenhum pixel solto: todo torrão, até o de fora da beira, tem ao menos um vizinho de terra', () => {
    for (const s of seeds) {
      const px = paint(s);
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          if (!at(px, x, y)) continue;
          expect(Boolean(at(px, x - 1, y) || at(px, x + 1, y) || at(px, x, y - 1) || at(px, x, y + 1))).toBe(true);
        }
      }
    }
  });

  it('o grão é de um pixel: a terra troca de tom tanto dentro de um par de pixels quanto entre pares (a de antes andava em blocos de 2×2)', () => {
    let inside = 0;
    let across = 0;
    for (const s of seeds) {
      const px = paint(s);
      for (let y = 0; y < H; y++) {
        for (let x = 0; x + 2 < W; x += 2) {
          const [a, b, c] = [at(px, x, y), at(px, x + 1, y), at(px, x + 2, y)];
          if (!a || !b || !c) continue;
          if (a !== b) inside++;
          if (b !== c) across++;
        }
      }
    }
    expect(inside / across).toBeGreaterThan(0.7);
  });

  it('a beira é de um rebaixo com a luz de cima à esquerda: a terra embaixo do capim é escura, a de cima do capim é clara', () => {
    const shaded: number[] = [];
    const lit: number[] = [];
    for (const s of seeds) {
      const px = paint(s);
      for (let y = 1; y < H - 1; y++) {
        for (let x = 0; x < W; x++) {
          const c = at(px, x, y);
          if (!c || !YARD_RAMP.includes(c as (typeof YARD_RAMP)[number])) continue;
          if (!at(px, x, y - 1)) shaded.push(lum(c));
          else if (!at(px, x, y + 1)) lit.push(lum(c));
        }
      }
    }
    expect(shaded.length).toBeGreaterThan(50);
    expect(lit.length).toBeGreaterThan(50);
    expect(mean(lit) - mean(shaded)).toBeGreaterThan(20);
  });

  it('o caminho que desce da porta é a terra pisada, mais clara que a do resto do terreiro', () => {
    for (const s of seeds) {
      const px = paint(s);
      const center: number[] = [];
      const sides: number[] = [];
      for (let y = Math.round(H * 0.45); y < Math.round(H * 0.7); y++) {
        for (let x = 0; x < W; x++) {
          const c = at(px, x, y);
          if (!c) continue;
          if (Math.abs(x - W / 2) < 3) center.push(lum(c));
          else if (Math.abs(x - W / 2) > 14) sides.push(lum(c));
        }
      }
      expect(mean(center)).toBeGreaterThan(mean(sides) + 8);
    }
  });

  it('a terra fica dentro do decalque, com folga de capim nos cantos', () => {
    for (const s of seeds) {
      const px = paint(s);
      for (const [x, y] of [[0, 0], [W - 1, 0], [0, H - 1], [W - 1, H - 1]]) expect(at(px, x, y)).toBeUndefined();
    }
  });

  it('é sempre o mesmo para a mesma casa, e cada casa tem o seu', () => {
    expect(paint(2)).toEqual(paint(2));
    expect(paint(2)).not.toEqual(paint(3));
  });
});
