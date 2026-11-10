import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { beforeAll, describe, expect, it } from 'vitest';

import { getNpcHome, setWorldData } from '@/game/world/WorldData';
import { AUTHORED_TRAILS, authoredTiles, valleyBlocked } from '@/game/world/trails';
import { crackTiles } from './PainterCracks';

// AS QUATRO COVAS DA SISI: o único chão que a pá cava. No mapa de verdade elas ficam em chão livre, longe da frente
// dela, fora da trilha — e, semeadas (os montes são sólidos), não fecham o caminho de quem chega pela trilha.

describe('as covas rachadas da Sisi', () => {
  beforeAll(() => {
    const here = path.dirname(fileURLToPath(import.meta.url));
    setWorldData(JSON.parse(fs.readFileSync(path.resolve(here, '../../../public/world.json'), 'utf8')));
  });

  it('duas, um vão, duas: o vão é a coluna dela (pedido do autor: "hoje está tudo coladinho")', () => {
    const sisi = getNpcHome('painter')!;
    const xs = crackTiles(sisi).map((t) => t.x).sort((a, b) => a - b);
    expect(xs).toEqual([sisi.worldX - 2, sisi.worldX - 1, sisi.worldX + 1, sisi.worldX + 2]);
  });

  it('são quatro, em chão livre, a pelo menos dois passos dela, fora da frente e fora da trilha', () => {
    const sisi = getNpcHome('painter')!;
    const tiles = crackTiles(sisi);
    const blocked = valleyBlocked();
    const trail = authoredTiles(AUTHORED_TRAILS.find((t) => t.id === 'trail-sisi')!.corners);
    expect(tiles).toHaveLength(4);
    for (const t of tiles) {
      expect(blocked(t.x, t.y), `${t.x},${t.y} livre`).toBe(false);
      expect(Math.abs(t.x - sisi.worldX) + Math.abs(t.y - sisi.worldY), `${t.x},${t.y} longe dela`).toBeGreaterThan(1);
      expect(t.x === sisi.worldX && t.y === sisi.worldY + 1, 'a frente dela fica livre').toBe(false);
      expect(trail.some((p) => p.x === t.x && p.y === t.y), `${t.x},${t.y} fora da trilha`).toBe(false);
    }
  });

  it('semeadas, não fecham o caminho: da ponta da trilha ainda se chega à frente dela', () => {
    const sisi = getNpcHome('painter')!;
    const mounds = new Set(crackTiles(sisi).map((t) => `${t.x},${t.y}`));
    const base = valleyBlocked();
    const blocked = (x: number, y: number): boolean => base(x, y) || mounds.has(`${x},${y}`);
    const trail = AUTHORED_TRAILS.find((t) => t.id === 'trail-sisi')!.corners;
    const [sx, sy] = trail[trail.length - 1];
    const goal = `${sisi.worldX},${sisi.worldY + 1}`;
    const seen = new Set([`${sx},${sy}`]);
    const queue = [[sx, sy]];
    while (queue.length) {
      const [x, y] = queue.shift()!;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const k = `${x + dx},${y + dy}`;
        if (seen.has(k) || (k !== goal && blocked(x + dx, y + dy))) continue;
        seen.add(k);
        queue.push([x + dx, y + dy]);
      }
    }
    expect(seen.has(goal)).toBe(true);
  });
});
