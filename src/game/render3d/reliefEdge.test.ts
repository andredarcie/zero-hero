import { describe, expect, it } from 'vitest';

import { FACE_AWAY, lipTuft, RIM_LIP_KEEP, RIM_SHADE, rimClass, stepFacesAway } from './reliefEdge';
import { buildMassHeightGrid, buildReliefContourGeometry, makeReliefField, tileKey } from './terrainGeometry';

const all = (): boolean => true;
/** Um planalto de nível 1 nas células 0..9 × 0..9; o resto é chão. */
const block = (i: number, j: number): number => (i >= 0 && i <= 9 && j >= 0 && j <= 9 ? 1 : 0);

describe('a beirada do topo (rimClass)', () => {
  it('o pixel da beira é o contorno, o de dentro é o beiço aceso, o miolo e o chão ficam', () => {
    expect(rimClass(block, all, all, 0, 5)).toBe(1);
    expect(rimClass(block, all, all, 5, 0)).toBe(1); // a beira de trás (norte) também
    expect(rimClass(block, all, all, 1, 5)).toBe(2);
    expect(rimClass(block, all, all, 5, 5)).toBe(0);
    expect(rimClass(block, all, all, -1, 5)).toBe(0); // o chão de baixo não ganha nada
  });

  it('o beiço aceso sai em tufos: sem o tufo, a célula de dentro fica como estava', () => {
    expect(rimClass(block, all, () => false, 1, 5)).toBe(0);
    expect(rimClass(block, all, () => false, 0, 5)).toBe(1); // o contorno não falha
  });

  it('a beira da frente (sul) não tem contorno: ali a parede aparece e o capim cai por cima, e ela é o beiço aceso', () => {
    expect(rimClass(block, all, all, 5, 9)).toBe(2);
    expect(rimClass(block, all, () => false, 5, 9)).toBe(0);
    expect(rimClass(block, all, all, 5, 8)).toBe(0); // e nada por dentro dela
  });

  it('a beira de escada, água ou cubo não é degrau: nem contorno nem beiço', () => {
    const stair = (i: number, j: number): boolean => !(i === -1 && j >= 2 && j <= 8);
    expect(rimClass(block, stair, all, 0, 5)).toBe(0);
    expect(rimClass(block, stair, all, 1, 5)).toBe(0);
  });

  it('o cume ganha a beirada sobre o planalto, e o planalto não a ganha contra o cume', () => {
    const peak = (i: number, j: number): number => (i >= 3 && i <= 6 && j >= 3 && j <= 6 ? 2 : block(i, j));
    expect(rimClass(peak, all, all, 3, 4)).toBe(1);
    expect(rimClass(peak, all, all, 2, 4)).toBe(0);
  });

  it('o tufo do beiço é de dois pixels, sempre o mesmo, e fica na proporção pedida', () => {
    let kept = 0;
    for (let z = 0; z < 60; z++) {
      for (let x = 0; x < 60; x += 2) {
        expect(lipTuft(x, z)).toBe(lipTuft(x + 1, z));
        expect(lipTuft(x, z)).toBe(lipTuft(x, z));
        if (lipTuft(x, z)) kept++;
      }
    }
    expect(kept / (60 * 30)).toBeGreaterThan(RIM_LIP_KEEP - 0.12);
    expect(kept / (60 * 30)).toBeLessThan(RIM_LIP_KEEP + 0.12);
  });

  it('o contorno escurece e o beiço clareia, os dois de leve', () => {
    expect(RIM_SHADE[0]).toBe(1);
    expect(RIM_SHADE[1]).toBeGreaterThan(0.5);
    expect(RIM_SHADE[1]).toBeLessThan(0.8);
    expect(RIM_SHADE[2]).toBeGreaterThan(1.05);
    expect(RIM_SHADE[2]).toBeLessThan(1.35); // mais que isso a fileira acesa vira régua (a lição da trepadeira)
  });
});

describe('a face de lado de costas para a câmera (stepFacesAway)', () => {
  it('a parede leste reta fica', () => {
    const east = (a: number): number => (a < 8 ? 1 : 0);
    expect(stepFacesAway(east, 1, 8, 0, 3, 4)).toBe(false);
  });

  it('o degrau de uma beira que olha para o norte sai', () => {
    // O planalto ao sul, a beira ao norte, com um degrau de uma linha (o ruído do beiço faz isso).
    const north = (a: number, b: number): number => (b >= (a < 6 ? 5 : 6) ? 1 : 0);
    expect(stepFacesAway(north, 1, 6, 5, 5, 4)).toBe(true);
  });

  it('a escada da diagonal nordeste sai, a da sudeste fica', () => {
    const ne = (a: number, b: number): number => (a <= b ? 1 : 0); // o chão baixo a nordeste
    expect(stepFacesAway(ne, 1, 11, 10, 10, 4)).toBe(true);
    const se = (a: number, b: number): number => (a + b <= 20 ? 1 : 0); // o chão baixo a sudeste
    expect(stepFacesAway(se, 1, 11, 10, 10, 4)).toBe(false);
  });

  it('o limiar fica entre o leste puro e a diagonal', () => {
    expect(FACE_AWAY).toBeGreaterThan(0.2);
    expect(FACE_AWAY).toBeLessThan(0.7);
  });
});

describe('o contorno do planalto montado', () => {
  // Um planalto de 12 × 12 tiles: a beira norte e a sul são retas no dado e ondulam pelo ruído do beiço.
  const level = (x: number, z: number): number => (x >= 0 && x <= 11 && z >= 0 && z <= 11 ? 1 : 0);
  const tiles: Array<{ x: number; z: number; frame: number; level: number; far: boolean }> = [];
  for (let z = -1; z <= 12; z++) {
    for (let x = -1; x <= 12; x++) tiles.push({ x, z, frame: 5, level: level(x, z), far: false });
  }
  const frameOf = new Map(tiles.map((t) => [tileKey(t.x, t.z), t.frame]));
  const blocked = (): boolean => false;
  const build = (rim: boolean) => buildReliefContourGeometry(tiles, frameOf, makeReliefField(level, blocked), level, new Set(), blocked, undefined, { rim });

  /** O centro e a normal de cada face de pedra (quatro vértices por face). */
  const faces = (geo: ReturnType<typeof build>['walls']) => {
    const pos = geo.getAttribute('position');
    const nrm = geo.getAttribute('normal');
    const out: Array<{ x: number; z: number; nx: number }> = [];
    for (let v = 0; v < pos.count; v += 4) {
      let x = 0;
      let z = 0;
      for (let k = 0; k < 4; k++) { x += pos.getX(v + k) / 4; z += pos.getZ(v + k) / 4; }
      out.push({ x, z, nx: nrm.getX(v) });
    }
    return out;
  };

  it('a beira de trás não tem dente: nenhuma face de lado nela, e a da frente continua com as dela', () => {
    const sides = faces(build(true).walls).filter((f) => f.nx !== 0 && f.x > 1 && f.x < 10);
    expect(sides.filter((f) => f.z < 0.5)).toEqual([]);
    expect(sides.filter((f) => f.z > 10.5).length).toBeGreaterThan(0); // o ruído faz degrau; na frente ele fica
  });

  it('as paredes leste e oeste continuam inteiras', () => {
    const sides = faces(build(true).walls).filter((f) => f.nx !== 0 && f.z > 2 && f.z < 9);
    expect(sides.some((f) => f.nx < 0 && f.x < 0)).toBe(true);
    expect(sides.some((f) => f.nx > 0 && f.x > 11)).toBe(true);
  });

  it('o topo ganha o contorno e o beiço só com a beirada ligada', () => {
    const shades = (geo: ReturnType<typeof build>['tops']): Set<number> => {
      const col = geo.getAttribute('color');
      const s = new Set<number>();
      for (let v = 0; v < col.count; v++) s.add(Math.round(col.getX(v) * 100) / 100);
      return s;
    };
    const on = shades(build(true).tops);
    expect(on.has(Math.round(RIM_SHADE[1] * 100) / 100)).toBe(true);
    expect(on.has(Math.round(RIM_SHADE[2] * 100) / 100)).toBe(true);
    expect([...shades(build(false).tops)]).toEqual([1]);
  });
});

describe('a sombra do planalto encosta no pé da parede', () => {
  it('nenhuma sub-célula da beira conta como alta com um pixel de chão baixo dentro dela (o fio de luz no pé)', () => {
    const level = (x: number, z: number): number => (x >= 0 && x <= 11 && z >= 0 && z <= 11 ? 1 : 0);
    const blocked = (): boolean => false;
    const field = makeReliefField(level, blocked);
    const tiles: Array<{ x: number; z: number }> = [];
    for (let z = -1; z <= 12; z++) for (let x = -1; x <= 12; x++) if (level(x, z) > 0) tiles.push({ x, z });
    const grid = buildMassHeightGrid(tiles, () => 0, level, field, () => false)!;
    const S = 8;
    let edges = 0;
    for (let gz = 1; gz < grid.h - 1; gz++) {
      for (let gx = 1; gx < grid.w - 1; gx++) {
        const k = gz * grid.w + gx;
        const v = grid.heights[k];
        if (v <= 0) continue;
        if (grid.heights[k - 1] >= v && grid.heights[k + 1] >= v && grid.heights[k - grid.w] >= v && grid.heights[k + grid.w] >= v) continue;
        edges++;
        const x0 = grid.minX - 0.5 + gx / S;
        const z0 = grid.minZ - 0.5 + gz / S;
        for (const [qx, qz] of [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]]) {
          expect(field(x0 + qx / S, z0 + qz / S)).toBeGreaterThanOrEqual(v);
        }
      }
    }
    expect(edges).toBeGreaterThan(100);
  });
});
