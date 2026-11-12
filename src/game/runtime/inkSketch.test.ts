import { describe, expect, it } from 'vitest';

import { INK_ZOOM, artBox, inkStrokes, zoomed, type Rgba } from './inkSketch';

// O DESENHO A PENA: a arte do bicho vira traço na ordem de uma mão — o contorno primeiro, dando a volta, depois a
// sombra e o hachurado.

/** Um bicho de mentira: um quadrado 4×4 escuro no meio de um quadro 6×6, com um pixel claro dentro. */
const art = (light: [number, number] | null = null): Rgba => (x, y) => {
  const inside = x >= 1 && x <= 4 && y >= 1 && y <= 4;
  if (!inside) return [0, 0, 0, 0];
  if (light && x === light[0] && y === light[1]) return [240, 240, 240, 255];
  return [20, 20, 20, 255];
};

describe('o desenho a pena', () => {
  it('o contorno vem inteiro antes de qualquer sombra', () => {
    const strokes = inkStrokes(6, 6, art());
    const tones = strokes.map((s) => s.tone);
    const firstInner = tones.findIndex((t) => t !== 0);
    expect(firstInner).toBe(12); // as 12 bordas do quadrado 4×4
    expect(tones.slice(firstInner).every((t) => t !== 0)).toBe(true);
  });

  it('a pena dá a volta: o contorno começa em cima e segue em sentido único', () => {
    const contour = inkStrokes(6, 6, art()).filter((s) => s.tone === 0);
    expect(contour[0].y).toBe(1);
    // Nenhum salto de um lado ao outro do bicho: cada traço é vizinho (até a diagonal) do anterior.
    for (let i = 1; i < contour.length; i += 1) {
      const d = Math.max(Math.abs(contour[i].x - contour[i - 1].x), Math.abs(contour[i].y - contour[i - 1].y));
      expect(d).toBeLessThanOrEqual(2);
    }
  });

  it('o escuro vira sombra cheia, o claro vira hachurado ou papel', () => {
    const strokes = inkStrokes(6, 6, art([2, 2]));
    const at = (x: number, y: number) => strokes.find((s) => s.x === x && s.y === y);
    expect(at(3, 3)?.tone).toBe(1);
    // (2,2) é claro e (2+2) % 3 !== 0: fica papel.
    expect(at(2, 2)).toBeUndefined();
    expect(strokes.some((s) => s.x === 0 || s.y === 0)).toBe(false);
  });

  it('a divisa entre duas cores ganha um traço, do lado escuro (o olho, a asa, as manchas)', () => {
    const strokes = inkStrokes(6, 6, art([2, 2]));
    expect(strokes.find((s) => s.x === 3 && s.y === 2)?.tone).toBe(0);
    expect(strokes.find((s) => s.x === 2 && s.y === 3)?.tone).toBe(0);
  });

  it('a pena é mais fina que o pixel: o desenho é recortado e ampliado', () => {
    const box = artBox(6, 6, art());
    expect(box).toEqual({ x: 1, y: 1, w: 4, h: 4 });
    const big = zoomed(art(), box!, INK_ZOOM);
    expect(big(0, 0)[3]).toBe(255);
    expect(big(4 * INK_ZOOM - 1, 4 * INK_ZOOM - 1)[3]).toBe(255);
    // Ampliado, o contorno continua com a espessura de um pixel: ele é bem menos que o bicho.
    const strokes = inkStrokes(4 * INK_ZOOM, 4 * INK_ZOOM, big);
    expect(strokes.filter((s) => s.tone === 0).length).toBe(4 * (4 * INK_ZOOM - 1));
  });

  it('sem bicho, sem traço', () => {
    expect(inkStrokes(4, 4, () => [0, 0, 0, 0])).toEqual([]);
    expect(artBox(4, 4, () => [0, 0, 0, 0])).toBeNull();
  });
});
