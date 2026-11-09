import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import type { WorldData } from './worldSchema';

// O MUNDO (public/world.json), lido como o jogo lê. O que vale sempre, por mais que o editor e os scripts mexam nele:
// a forma da grade, nada fora do mapa, e as regras do vale — cada espécie de cogumelo existe UMA vez, cada vizinho
// mora num lugar só, e o fim (a fogueira e o portão do jardim) é um só.

const here = path.dirname(fileURLToPath(import.meta.url));
const world = JSON.parse(readFileSync(path.resolve(here, '../../../public/world.json'), 'utf8')) as WorldData;
const { worldChunksX, worldChunksY, chunkColumns, chunkRows } = world.meta;
const W = worldChunksX * chunkColumns;
const H = worldChunksY * chunkRows;
const inside = (x: number, y: number): boolean => Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < W && y < H;

/** As seis espécies colhidas com a faca da Shui (fungi/fungi.ts, MUSHROOM_KINDS). */
const MUSHROOMS = ['porcini', 'morel', 'puffball', 'inkCap', 'chanterelle', 'flyAgaric'];

const count = <T>(items: T[], key: (item: T) => string): Record<string, number> =>
  items.reduce<Record<string, number>>((acc, item) => { acc[key(item)] = (acc[key(item)] ?? 0) + 1; return acc; }, {});

describe('world.json', () => {
  it('a grade tem um chunk por célula, cada um do tamanho certo', () => {
    expect(world.chunks).toHaveLength(worldChunksX * worldChunksY);
    const cells = new Set(world.chunks.map((c) => `${c.cx},${c.cy}`));
    expect(cells.size).toBe(worldChunksX * worldChunksY);
    for (const c of world.chunks) {
      const id = `chunk ${c.cx},${c.cy}`;
      for (const layer of [c.ground, c.upper, c.collisions, ...(c.relief ? [c.relief] : [])]) {
        expect(layer, id).toHaveLength(chunkRows);
        for (const row of layer) expect(row, id).toHaveLength(chunkColumns);
      }
    }
  });

  it('o herói nasce dentro do mapa', () => {
    expect(inside(world.meta.playerStart.worldX, world.meta.playerStart.worldY)).toBe(true);
  });

  it('nenhum prop, item ou NPC fora do mapa (nem fora do próprio chunk)', () => {
    const out = world.props.filter((p) => !inside(p.worldX, p.worldY)).map((p) => `${p.type}@${p.worldX},${p.worldY}`);
    for (const c of world.chunks) {
      for (const e of [...c.pickups, ...c.npcs]) {
        const ok = inside(e.worldX, e.worldY)
          && Math.floor(e.worldX / chunkColumns) === c.cx && Math.floor(e.worldY / chunkRows) === c.cy;
        if (!ok) out.push(`${e.type}@${e.worldX},${e.worldY} no chunk ${c.cx},${c.cy}`);
      }
    }
    expect(out).toEqual([]);
  });

  it('nenhum prop repetido no mesmo tile', () => {
    const dup = Object.entries(count(world.props, (p) => `${p.type}@${p.worldX},${p.worldY}`)).filter(([, n]) => n > 1);
    expect(dup).toEqual([]);
  });

  it('cada espécie de cogumelo existe uma vez', () => {
    const pickups = count(world.chunks.flatMap((c) => c.pickups), (p) => p.type);
    expect(Object.fromEntries(MUSHROOMS.map((m) => [m, pickups[m] ?? 0]))).toEqual(Object.fromEntries(MUSHROOMS.map((m) => [m, 1])));
  });

  it('cada vizinho mora num lugar só', () => {
    const npcs = world.chunks.flatMap((c) => c.npcs);
    expect(Object.values(count(npcs, (n) => n.type)).every((n) => n === 1)).toBe(true);
  });

  it('o fim é um só: uma fogueira do fim e um portão do jardim', () => {
    const props = count(world.props, (p) => p.type);
    expect(props.hearth).toBe(1);
    expect(props.gardenGate).toBe(1);
  });

  it('cada roteiro de NPC apontado no mapa existe', () => {
    const npcs = world.chunks.flatMap((c) => c.npcs);
    const missing = npcs.filter((n) => n.dialog && !world.dialogs[n.dialog]).map((n) => `${n.type} → ${n.dialog}`);
    expect(missing).toEqual([]);
  });
});
