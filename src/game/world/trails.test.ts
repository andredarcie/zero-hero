import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { beforeAll, describe, expect, it } from 'vitest';

import { CHUNK_COLUMNS, CHUNK_ROWS, SOLID_UPPER_FRAMES } from '@/game/constants';
import { trailLift, trailPresence } from '@/game/objects/Trails';
import { terrainHeightAt } from '@/game/world/relief';
import { getChunkTerrain, setWorldData } from '@/game/world/WorldData';
import { AUTHORED_TRAILS, authoredTiles, trailPath, valleyBlocked, valleyTrails, type Blocked, type TilePoint } from './trails';

// AS TRILHAS FALHAS: o caminho é o que o autor desenhou no /editor (a cabeça na estaca de marcador). A estrada passa
// por cada tile dele, só por chão livre, com as quinas arredondadas onde cabe — e com trechos sem estrada no meio.

/** Um mapinha: `#` barra, `.` é chão. */
const grid = (rows: string[]): Blocked => (x, y) => rows[y]?.[x] !== '.';
/** Os tiles que a linha quebrada pisa, amostrada a cada quarto de tile, que barram. */
const blockedOnLine = (points: TilePoint[], blocked: Blocked): string[] => {
  const bad: string[] = [];
  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i];
    const b = points[i + 1];
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) * 4));
    for (let k = 0; k <= n; k += 1) {
      const x = Math.round(a.x + ((b.x - a.x) * k) / n);
      const y = Math.round(a.y + ((b.y - a.y) * k) / n);
      if (blocked(x, y)) bad.push(`${x},${y}`);
    }
  }
  return bad;
};
/** A distância de um ponto à linha quebrada. */
const distanceTo = (p: TilePoint, points: TilePoint[]): number => {
  let best = Infinity;
  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i];
    const b = points[i + 1];
    const vx = b.x - a.x; const vy = b.y - a.y;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.y - a.y) * vy) / (vx * vx + vy * vy || 1)));
    best = Math.min(best, Math.hypot(p.x - (a.x + vx * t), p.y - (a.y + vy * t)));
  }
  return best;
};

describe('o traçado de uma trilha desenhada', () => {
  it('as quinas viram a fila de tiles do desenho, tile a tile', () => {
    expect(authoredTiles([[0, 0], [2, 0], [2, 1]])).toEqual([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 1 }]);
  });

  it('o canto se arredonda onde há chão, e fica reto onde o arredondado cortaria o que barra', () => {
    const corners = [[0, 0], [3, 0], [3, 3]] as const;
    const open = trailPath(corners, grid(['....', '....', '....', '....']));
    expect(open.length).toBeGreaterThan(corners.length);
    expect(open[0]).toEqual({ x: 0, y: 0 });
    expect(open.at(-1)).toEqual({ x: 3, y: 3 });
    // O tile do lado de dentro da quina barra: a curva passaria por ele, então a quina fica como o autor desenhou.
    const tight = grid(['....', '..#.', '....', '....']);
    const kept = trailPath(corners, tight);
    expect(blockedOnLine(kept, tight)).toEqual([]);
  });
});

describe('as trilhas do vale', () => {
  beforeAll(() => {
    const here = path.dirname(fileURLToPath(import.meta.url));
    setWorldData(JSON.parse(fs.readFileSync(path.resolve(here, '../../../public/world.json'), 'utf8')));
  });

  it('duas, saindo da estrada antiga: uma até a Shui, outra até a Sisi, começando e acabando onde o autor desenhou', () => {
    const trails = valleyTrails();
    expect(trails.map((t) => t.id)).toEqual(['trail-shui', 'trail-sisi']);
    for (const [i, trail] of trails.entries()) {
      const [sx, sy] = AUTHORED_TRAILS[i].corners[0];
      const [ex, ey] = AUTHORED_TRAILS[i].corners.at(-1)!;
      expect(trail.points[0]).toEqual({ x: sx, y: sy });
      expect(trail.points.at(-1)).toEqual({ x: ex, y: ey });
    }
  });

  it('a estrada passa por cada tile do desenho', () => {
    for (const [i, trail] of valleyTrails().entries()) {
      const far = authoredTiles(AUTHORED_TRAILS[i].corners).filter((tile) => distanceTo(tile, trail.points) > 0.5);
      expect(far, trail.id).toEqual([]);
    }
  });

  it('só por onde se anda: nenhuma árvore, água, serra ou peça, e nada sólido em cima do caminho (os marcadores saíram)', () => {
    const blocked = valleyBlocked();
    for (const [i, trail] of valleyTrails().entries()) {
      expect(blockedOnLine(trail.points, blocked), trail.id).toEqual([]);
      const solid = authoredTiles(AUTHORED_TRAILS[i].corners).filter(({ x, y }) => {
        const cx = Math.floor(x / CHUNK_COLUMNS);
        const cy = Math.floor(y / CHUNK_ROWS);
        const frame = getChunkTerrain(cx, cy).upper[y - cy * CHUNK_ROWS]?.[x - cx * CHUNK_COLUMNS];
        return frame != null && SOLID_UPPER_FRAMES.has(frame);
      });
      expect(solid, trail.id).toEqual([]);
    }
  });

  it('a película fica no chão da trilha, não no do centro da caixa (a da Sisi flutuava: o centro cai no planalto)', () => {
    for (const trail of valleyTrails()) {
      const ground = terrainHeightAt(trail.points[0].x, trail.points[0].y);
      // Um andar só: uma película plana cabe nele inteiro.
      expect(trail.points.filter((p) => terrainHeightAt(p.x, p.y) !== ground), trail.id).toEqual([]);
      const xs = trail.points.map((p) => p.x);
      const ys = trail.points.map((p) => p.y);
      const cx = (Math.floor(Math.min(...xs)) + Math.ceil(Math.max(...xs))) / 2;
      const cy = (Math.floor(Math.min(...ys)) + Math.ceil(Math.max(...ys))) / 2;
      expect(terrainHeightAt(cx, cy) + trailLift(trail.points, cx, cy), trail.id).toBeCloseTo(ground, 6);
    }
  });

  it('falham pouco: há trechos sem estrada, curtos (até um tile e meio), a estrada é quase toda inteira, e as pontas nunca falham', () => {
    for (const trail of valleyTrails()) {
      let length = 0;
      for (let i = 1; i < trail.points.length; i += 1) {
        length += Math.hypot(trail.points[i].x - trail.points[i - 1].x, trail.points[i].y - trail.points[i - 1].y);
      }
      expect(trailPresence(0, length, trail.seed), trail.id).toBe(1);
      expect(trailPresence(length, length, trail.seed), trail.id).toBe(1);
      const along = Array.from({ length: Math.floor(length * 4) }, (_, i) => trailPresence(i / 4, length, trail.seed));
      expect(along.some((p) => p === 0), `${trail.id}: algum trecho sem estrada`).toBe(true);
      expect(along.filter((p) => p > 0).length / along.length, `${trail.id}: quase toda é estrada`).toBeGreaterThan(0.85);
      let gap = 0;
      let longest = 0;
      for (const p of along) { gap = p === 0 ? gap + 0.25 : 0; longest = Math.max(longest, gap); }
      expect(longest, `${trail.id}: o maior trecho sem estrada, em tiles`).toBeLessThanOrEqual(1.5);
    }
  });
});
