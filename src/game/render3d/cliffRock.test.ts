import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createCanvas, loadImage } from 'canvas';
import { describe, expect, it } from 'vitest';

import {
  CLIFF_FACE_FRAMES, CLIFF_FACE_MOSS, CLIFF_FOOT, cliffFaceFrame, facetShade, fringeDrop, ROCK_TOP_FRAMES, ROCK_TOP_LIFT,
} from './cliffRock';
import { STAIR_FRAMES } from './stairGeometry';
import { buildReliefContourGeometry, makeReliefField, shapeRock, tileKey } from './terrainGeometry';

const ATLAS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../public/assets/environment/tilesets/forest_tile_set.png');

/** O atlas, lido UMA vez: lido a cada quadro, a bateria em paralelo passava dos 5 s do teste. */
let atlas: ReturnType<typeof loadImage> | null = null;
/** Os pixels RGBA de um quadro do atlas (3 colunas de 16 px). */
const frameOf = async (frame: number): Promise<Uint8ClampedArray> => {
  atlas ??= loadImage(ATLAS);
  const img = await atlas;
  const c = createCanvas(16, 16);
  const g = c.getContext('2d');
  g.drawImage(img, (frame % 3) * 16, Math.floor(frame / 3) * 16, 16, 16, 0, 0, 16, 16);
  return g.getImageData(0, 0, 16, 16).data;
};

describe('a rocha da serra no atlas', () => {
  it('cada quadro da rocha e da escada está instalado e é terreno inteiro (opaco em todo pixel)', async () => {
    for (const f of new Set([...CLIFF_FACE_FRAMES, ...CLIFF_FACE_MOSS, ...ROCK_TOP_FRAMES, ...Object.values(STAIR_FRAMES)])) {
      const px = await frameOf(f);
      for (let i = 3; i < px.length; i += 4) expect(px[i]).toBe(255);
    }
  }, 20_000);

  it('não é o calçamento em pé (o quadro 39)', async () => {
    const rock = await frameOf(CLIFF_FACE_FRAMES[0]);
    const cobble = await frameOf(39);
    expect(Buffer.from(rock).equals(Buffer.from(cobble))).toBe(false);
  });

  it('a face é rocha de fenda em pé: a pedra troca muito mais de uma coluna para a outra que de uma linha para a outra', async () => {
    let across = 0;
    let down = 0;
    for (const f of CLIFF_FACE_FRAMES) {
      const px = await frameOf(f);
      const lum = (x: number, y: number): number => {
        const i = (y * 16 + x) * 4;
        return 0.3 * px[i] + 0.59 * px[i + 1] + 0.11 * px[i + 2];
      };
      for (let y = 0; y < 15; y++) {
        for (let x = 0; x < 15; x++) {
          across += Math.abs(lum(x + 1, y) - lum(x, y));
          down += Math.abs(lum(x, y + 1) - lum(x, y));
        }
      }
    }
    expect(across).toBeGreaterThan(down * 1.3);
  });
});

describe('a escolha da pintura e a luz da parede', () => {
  it('a face sai das listas da rocha, sempre a mesma no mesmo lugar, com musgo numa face de cada quatro', () => {
    let moss = 0;
    let n = 0;
    for (let z = 0; z < 40; z++) {
      for (let x = 0; x < 40; x++) {
        for (let y = 0; y < 2; y++) {
          const f = cliffFaceFrame(x, z, y);
          expect([...CLIFF_FACE_FRAMES, ...CLIFF_FACE_MOSS]).toContain(f);
          expect(cliffFaceFrame(x, z, y)).toBe(f);
          if (CLIFF_FACE_MOSS.includes(f)) moss++;
          n++;
        }
      }
    }
    expect(moss / n).toBeGreaterThan(0.15);
    expect(moss / n).toBeLessThan(0.35);
  });

  it('o alto da serra é laje de rocha, não o calçamento', () => {
    for (const f of ROCK_TOP_FRAMES) expect(f).toBeGreaterThanOrEqual(126);
  });

  it('o tom da pedra corre liso ao longo da parede, sem degrau na divisa dos tiles', () => {
    for (let x = -3; x < 30; x += 0.05) {
      const a = facetShade(x, 7.5, 1);
      expect(a).toBeGreaterThan(0.92);
      expect(a).toBeLessThan(1.08);
      expect(Math.abs(facetShade(x + 0.05, 7.5, 1) - a)).toBeLessThan(0.01);
    }
  });

  it('o pé escurece mais que o do cubo, e o alto fica um passo acima da parede', () => {
    expect(CLIFF_FOOT).toBeLessThan(0.78);
    expect(CLIFF_FOOT).toBeGreaterThan(0.5);
    expect(ROCK_TOP_LIFT).toBeGreaterThan(1);
    expect(ROCK_TOP_LIFT).toBeLessThan(1.2);
  });

  it('a franja cai de 0 a 3 pixels, quase sempre algum, e varia de coluna para coluna', () => {
    const drops: number[] = [];
    for (let g = 0; g < 2000; g++) drops.push(fringeDrop(g, 37));
    for (const d of drops) expect([0, 1, 2, 3]).toContain(d);
    const zero = drops.filter((d) => d === 0).length / drops.length;
    expect(zero).toBeGreaterThan(0.04);
    expect(zero).toBeLessThan(0.22);
    const mean = drops.reduce((a, b) => a + b, 0) / drops.length;
    expect(mean).toBeGreaterThan(1.2);
    expect(mean).toBeLessThan(2.1);
    expect(new Set(drops.slice(0, 16)).size).toBeGreaterThan(1);
  });
});

describe('a franja de capim na colina montada', () => {
  // Uma colina de 6 × 4 tiles de capim (quadro 5).
  const level = (x: number, z: number): number => (x >= 0 && x <= 5 && z >= 0 && z <= 3 ? 1 : 0);
  const blocked = (): boolean => false;
  const build = (frame: number, rim: boolean) => {
    const tiles: Array<{ x: number; z: number; frame: number; level: number; far: boolean }> = [];
    for (let z = -1; z <= 4; z++) for (let x = -1; x <= 6; x++) tiles.push({ x, z, frame, level: level(x, z), far: false });
    const frames = new Map(tiles.map((t) => [tileKey(t.x, t.z), t.frame]));
    return buildReliefContourGeometry(tiles, frames, makeReliefField(level, blocked), level, new Set(), blocked, undefined, { rim });
  };
  /** As peças do topo que não são deitadas: os fios da franja. */
  const hanging = (geo: ReturnType<typeof build>['tops']) => {
    const pos = geo.getAttribute('position');
    const out: Array<{ x: number; z: number; top: number; bottom: number }> = [];
    for (let v = 0; v < pos.count; v += 4) {
      const ys = [0, 1, 2, 3].map((k) => pos.getY(v + k));
      if (Math.max(...ys) - Math.min(...ys) < 1e-6) continue;
      out.push({ x: pos.getX(v), z: pos.getZ(v), top: Math.max(...ys), bottom: Math.min(...ys) });
    }
    return out;
  };

  it('o capim cai pela frente da pedra que a câmera vê, no máximo 3 pixels abaixo do topo, nunca no miolo', () => {
    const fringe = hanging(build(5, true).tops);
    expect(fringe.length).toBeGreaterThan(40);
    // Quase toda na beira sul; o resto nos degraus virados para o sul que a ondulação abre nas beiras de lado.
    expect(fringe.filter((f) => f.z > 3.5).length / fringe.length).toBeGreaterThan(0.7);
    for (const f of fringe) {
      const inside = f.x > 0.6 && f.x < 4.4 && f.z > 0.2 && f.z < 3.4;
      expect(inside).toBe(false);
      expect(f.top).toBeGreaterThanOrEqual(1);
      expect(f.top - f.bottom).toBeLessThanOrEqual(3 / 16 + 0.002);
    }
  });

  it('sem a beirada (a montanha de pedra) ou com o topo que não é capim, não há franja', () => {
    expect(hanging(build(5, false).tops)).toEqual([]);
    expect(hanging(build(23, true).tops)).toEqual([]);
  });
});

describe('a pintura de cada tile da serra', () => {
  it('cada tile de pedra veste a própria variante, não a do vizinho que o achou primeiro', () => {
    const tiles: Array<{ x: number; z: number; frame: number }> = [];
    for (let z = 0; z < 8; z++) for (let x = 0; x < 8; x++) tiles.push({ x, z, frame: 39 });
    const rock = shapeRock(tiles, () => false);
    for (const t of rock.near) {
      const own = rock.frameOf.get(tileKey(t.x, t.z));
      if (own !== undefined) expect(t.frame).toBe(own);
    }
    expect(new Set(rock.near.map((t) => t.frame)).size).toBeGreaterThan(2);
  });
});
