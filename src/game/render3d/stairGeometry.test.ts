import { describe, expect, it } from 'vitest';

import { buildStairGeometry, STAIR_FRAMES, STAIR_SHADE } from './stairGeometry';
import { tilesetFrameUv } from './textures3d';

type Stair = { x: number; z: number; ux: number; uz: number; base: number };

/** Cada triângulo da malha: os três cantos no mundo, a arte (pelo quadro) em unidades de tile, e o quadro. */
const triangles = (stairs: Stair[]) => {
  const geo = buildStairGeometry(stairs);
  const pos = geo.getAttribute('position');
  const uv = geo.getAttribute('uv');
  const bounds = geo.getAttribute('aUvBounds');
  const index = geo.getIndex()!;
  const frames = Object.values(STAIR_FRAMES).map((f) => ({ f, uv: tilesetFrameUv(f) }));
  const out: Array<{ frame: number; p: number[][]; a: number[][] }> = [];
  for (let i = 0; i < index.count; i += 3) {
    const vs = [index.getX(i), index.getX(i + 1), index.getX(i + 2)];
    // (a malha guarda em float32: a comparação tem folga)
    const hit = frames.find((fr) => Math.abs(fr.uv.cu0 - bounds.getX(vs[0])) < 1e-5 && Math.abs(fr.uv.cv0 - bounds.getY(vs[0])) < 1e-5)!;
    const f = hit.uv;
    out.push({
      frame: hit.f,
      p: vs.map((v) => [pos.getX(v), pos.getY(v), pos.getZ(v)]),
      // a arte em tiles: 0..1 de um lado ao outro do quadro
      a: vs.map((v) => [(uv.getX(v) - f.u0) / (f.u1 - f.u0), (uv.getY(v) - f.v0) / (f.v1 - f.v0)]),
    });
  }
  return out;
};

const NORTH: Stair = { x: 3, z: 5, ux: 0, uz: -1, base: 0 };
const EAST: Stair = { x: 8, z: 2, ux: 1, uz: 0, base: 1 };

describe('a escada de pedra lavrada', () => {
  it('nenhuma face estica nem espreme a arte: um pixel de arte para cada 1/16 de tile (o capeamento inclinado é visto de cima)', () => {
    for (const tri of triangles([NORTH, EAST])) {
      if (tri.frame === STAIR_FRAMES.coping) continue;
      for (const [i, j] of [[0, 1], [1, 2], [2, 0]]) {
        const world = Math.hypot(tri.p[i][0] - tri.p[j][0], tri.p[i][1] - tri.p[j][1], tri.p[i][2] - tri.p[j][2]);
        const art = Math.hypot(tri.a[i][0] - tri.a[j][0], tri.a[i][1] - tri.a[j][1]);
        expect(Math.abs(world - art)).toBeLessThan(0.05); // (o pé do pilar passa 0,04 da escada e a arte para na beira)
      }
    }
  });

  it('o espelho de cada degrau cai numa faixa inteira da pintura (4 pixels), nunca no meio de duas', () => {
    for (const tri of triangles([NORTH, EAST]).filter((t) => t.frame === STAIR_FRAMES.riser)) {
      for (const [, b] of tri.a) expect(Math.abs(b * 4 - Math.round(b * 4))).toBeLessThan(1e-4);
    }
  });

  it('a face em pé que passa de um andar é cortada na divisa: nenhum pedaço atravessa a altura de um nível', () => {
    for (const tri of triangles([NORTH, EAST])) {
      if (tri.frame === STAIR_FRAMES.coping || tri.frame === STAIR_FRAMES.tread) continue;
      const ys = tri.p.map((p) => p[1]);
      const lo = Math.min(...ys);
      const hi = Math.max(...ys);
      expect(Math.floor(lo + 1e-6)).toBe(Math.floor(hi - 1e-6));
    }
  });

  it('a pintura é a da pedra lavrada, nunca o calçamento', () => {
    const used = new Set(triangles([NORTH]).map((t) => t.frame));
    for (const f of used) expect(Object.values(STAIR_FRAMES)).toContain(f);
    expect(used.has(STAIR_FRAMES.tread)).toBe(true);
    expect(used.has(STAIR_FRAMES.riser)).toBe(true);
  });

  it('escadas gêmeas são uma escadaria: sem mureta nem pilar entre elas', () => {
    const copings = (s: Stair[]): number => triangles(s).filter((t) => t.frame === STAIR_FRAMES.coping).length;
    const single = copings([NORTH]);
    const pair = copings([NORTH, { ...NORTH, x: NORTH.x + 1 }]);
    expect(single).toBe(12); // duas muretas e quatro pilares
    expect(pair).toBe(single); // a escadaria de dois tem uma mureta de cada lado, como a de um
  });

  it('o degrau é a face mais clara, o capeamento um passo abaixo, e o espelho é sombra mais funda debaixo da quina', () => {
    expect(STAIR_SHADE.tread).toBeGreaterThan(STAIR_SHADE.cap);
    expect(STAIR_SHADE.tread).toBeGreaterThan(STAIR_SHADE.postCap);
    expect(STAIR_SHADE.treadBack).toBeLessThan(STAIR_SHADE.tread);
    expect(STAIR_SHADE.riserTop).toBeLessThan(STAIR_SHADE.riserFoot);
    expect(STAIR_SHADE.riserFoot).toBeLessThan(STAIR_SHADE.treadBack);
  });
});
