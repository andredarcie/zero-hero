import { describe, expect, it } from 'vitest';
import { HOUSE_DEPTH, houseSkeleton } from './homeShell';
import { HOME_CHIMNEYS, HOME_GABLES, HOME_WALLS, type HomeKind } from './homeTextures';

const deg = (rad: number): number => (rad * 180) / Math.PI;

describe('o esqueleto das casas: um telhado de quatro águas sobre uma caixa', () => {
  for (const kind of Object.keys(HOME_GABLES) as HomeKind[]) {
    const s = houseSkeleton(HOME_GABLES[kind]!, HOME_WALLS[kind]!, HOME_CHIMNEYS[kind], 10, 20.3);
    const { walls: w, eave: e, ridge: r } = s;
    const half = (e.zFront - e.zBack) / 2;
    const rise = r.y - e.y;

    it(`${kind}: o beiral fica no topo da parede e passa dela dos quatro lados`, () => {
      expect(e.y).toBeCloseTo(w.y1, 9);
      expect(e.x0).toBeLessThan(w.x0);
      expect(e.x1).toBeGreaterThan(w.x1);
      expect(e.zFront).toBeGreaterThan(w.zFront);
      expect(e.zBack).toBeLessThan(w.zBack);
    });

    it(`${kind}: a cumeeira fica no meio, acima do beiral, e as quatro águas têm o mesmo caimento`, () => {
      expect(r.z).toBeCloseTo((e.zFront + e.zBack) / 2, 9);
      expect((r.x0 + r.x1) / 2).toBeCloseTo((e.x0 + e.x1) / 2, 9);
      expect(rise).toBeGreaterThan(0);
      expect(r.x1).toBeGreaterThan(r.x0);
      // o caimento da frente e de trás (sobre a meia profundidade) é o mesmo das dos lados (sobre o recuo da cumeeira)
      expect(rise / (r.x0 - e.x0)).toBeCloseTo(rise / half, 9);
      expect(rise / (e.x1 - r.x1)).toBeCloseTo(rise / half, 9);
    });

    it(`${kind}: o caimento fica abaixo dos 48° da câmera (a água de trás aparece) e longe de ser chato`, () => {
      const pitch = deg(Math.atan2(rise, half));
      expect(pitch).toBeGreaterThan(20);
      expect(pitch).toBeLessThan(40);
    });

    it(`${kind}: as paredes vão da fachada até o fundo do que é sólido, do pé até o beiral`, () => {
      expect(w.zFront - w.zBack).toBeCloseTo(HOUSE_DEPTH, 9);
      expect(w.zFront).toBeLessThan(20.3);
      expect(w.zFront).toBeGreaterThan(20.29);
      expect(w.y1).toBeGreaterThan(w.y0);
    });

    if (s.chimney) {
      it(`${kind}: a chaminé nasce de dentro do telhado, na linha da cumeeira, e passa dela`, () => {
        const c = s.chimney!;
        expect(c.y0).toBeLessThanOrEqual(e.y);
        expect(c.y1).toBeGreaterThan(r.y);
        expect((c.zFront + c.zBack) / 2).toBeCloseTo(r.z, 9);
        expect(c.x0).toBeGreaterThan(e.x0);
        expect(c.x1).toBeLessThan(e.x1);
      });
    }
  }
});
