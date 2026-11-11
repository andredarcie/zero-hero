import { describe, expect, it } from 'vitest';
import { homeSink, houseSkeleton } from './homeShell';
import { HOME_BOXES, HOME_CHIMNEYS, HOME_GABLES, HOME_PAINTERS, HOME_WALLS, type HomeKind } from './homeTextures';
import { INK } from './pixelForms';

// A AUDITORIA DO CORPO 3D CONTRA O DESENHO: pinta a fachada numa grade (sem canvas) e mede onde o desenho está de
// verdade — o contorno das paredes, a fileira de baixo, o que fica acima da parede, a lenha e a chaminé.

const SIZE = 48;
const paint = (kind: HomeKind, bare: boolean): Array<string | null> => {
  const grid: Array<string | null> = new Array(SIZE * SIZE).fill(null);
  HOME_PAINTERS[kind]((color, x, y, w, h) => {
    for (let j = Math.round(y); j < Math.round(y) + Math.round(h); j++) {
      for (let i = Math.round(x); i < Math.round(x) + Math.round(w); i++) {
        if (i >= 0 && i < SIZE && j >= 0 && j < SIZE) grid[j * SIZE + i] = color;
      }
    }
  }, false, bare);
  return grid;
};

describe('o corpo 3D das casas bate com o desenho', () => {
  for (const kind of Object.keys(HOME_GABLES) as HomeKind[]) {
    const g = HOME_GABLES[kind]!;
    const w = HOME_WALLS[kind]!;
    const full = paint(kind, false);
    const bare = paint(kind, true);
    const at = (grid: Array<string | null>, x: number, y: number): string | null => grid[y * SIZE + x];

    it(`${kind}: as paredes do desenho vão exatamente das colunas da medida (a primeira e a última pintadas)`, () => {
      for (let y = w.top + 2; y < w.top + 14; y++) {
        let l = 0;
        while (l < SIZE && at(bare, l, y) === null) l++;
        let r = SIZE - 1;
        while (r > 0 && at(bare, r, y) === null) r--;
        expect([y, l, r]).toEqual([y, w.left, w.right]);
      }
    });

    it(`${kind}: a fileira de baixo da parede é a da medida, e a de cima é o contorno do topo`, () => {
      const mid = Math.round((w.left + w.right) / 2);
      let bottom = SIZE - 1;
      while (bottom > 0 && at(bare, mid, bottom) === null) bottom--;
      expect(bottom).toBe(w.bottom);
      expect(at(bare, mid, w.top)).toBe(INK);
    });

    it(`${kind}: a fachada do 3D é só a parede — acima dela não sobra telhado nem chaminé (eles são volume)`, () => {
      for (let y = 0; y < w.top; y++) for (let x = 0; x < SIZE; x++) expect([x, y, at(bare, x, y)]).toEqual([x, y, null]);
      // e o desenho inteiro (o do 2D) continua com o telhado
      expect(at(full, g.cx, g.top)).not.toBeNull();
    });

    it(`${kind}: afundada, a casa encosta a parede no chão — nem flutua, nem entra nele`, () => {
      const s = houseSkeleton(g, w, HOME_CHIMNEYS[kind], 10, 20.3, -homeSink(kind));
      expect(s.walls.y0).toBeCloseTo(0, 6);
    });

    for (const b of HOME_BOXES[kind] ?? []) {
      it(`${kind}: a lenha está exatamente onde ela está desenhada, encostada na parede`, () => {
        const y = b.top + 1;
        expect(at(bare, b.left, y)).not.toBeNull();
        expect(at(bare, b.right, y)).not.toBeNull();
        expect(b.right + 1).toBe(w.left);
        expect(at(bare, b.left, b.top - 1)).toBeNull();
        expect(at(bare, b.left, b.bottom + 1)).toBeNull();
      });
    }

    const c = HOME_CHIMNEYS[kind];
    if (c) {
      it(`${kind}: a chaminé 3D tem as colunas e o topo da chaminé do desenho`, () => {
        expect(at(full, c.left, c.top)).toBe(INK);
        expect(at(full, c.right, c.top)).toBe(INK);
        expect(at(full, c.left - 1, c.top)).toBeNull();
        expect(at(full, c.right + 1, c.top)).toBeNull();
        expect(at(full, c.left, c.top - 1)).toBeNull();
      });
    }
  }
});
