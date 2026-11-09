import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { LIFE_HOMES } from './biomeLife';
import { BIOME_IDS, BIOMES, biomeAt, biomeEarthCutAt, biomeTintAt, biomeWeightsAt, decorFrameAt, type BiomeId } from './biomes';
import type { WorldData } from './worldSchema';

// OS BIOMAS (world/biomes.ts) são decididos pela coordenada, na hora de desenhar. O que o jogo promete sobre eles:
// todo o mapa tem bioma, os sete aparecem, a decoração só troca por coisa do mesmo tipo (a colisão não muda) e
// graveto desenhado não existe (graveto é item).

const here = path.dirname(fileURLToPath(import.meta.url));
const world = JSON.parse(readFileSync(path.resolve(here, '../../../public/world.json'), 'utf8')) as WorldData;
const W = world.meta.worldChunksX * world.meta.chunkColumns;
const H = world.meta.worldChunksY * world.meta.chunkRows;
const tiles = (): Array<[number, number]> => {
  const out: Array<[number, number]> = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) out.push([x, y]);
  return out;
};

const STICKS = [2, 9];
const SMALL = new Set([0, 7, 8, 10, 11, 13]);
const TALL = new Set([19, 20]);
const PINES = new Set([4, 14, 15, 16, 17, 18]);
/** As árvores que o bioma pode vestir: sempre SÓLIDAS (constants.SOLID_UPPER_FRAMES). */
const SOLID_TREES = new Set([3, 4, 14, 15, 16, 17, 18, 21]);

describe('biomas', () => {
  it('os pesos de cada ponto somam 1 e nenhum é negativo', () => {
    for (const [x, y] of tiles()) {
      const w = biomeWeightsAt(x, y);
      const sum = w.reduce((a, b) => a + b, 0);
      expect(Math.abs(sum - 1)).toBeLessThan(1e-5);
      expect(Math.min(...w)).toBeGreaterThanOrEqual(0);
    }
  });

  it('os sete biomas aparecem no mapa', () => {
    const seen = new Set(tiles().map(([x, y]) => biomeAt(x, y)));
    expect([...seen].sort()).toEqual([...BIOME_IDS].sort());
  });

  it('é determinístico: o mesmo tile dá sempre a mesma resposta', () => {
    for (const [x, y] of [[0, 0], [30, 31], [8, 4], [59, 59], [17.5, 18.5]] as const) {
      expect(biomeAt(x, y)).toBe(biomeAt(x, y));
      expect(biomeTintAt(x, y)).toEqual(biomeTintAt(x, y));
      expect(biomeEarthCutAt(x, y)).toBe(biomeEarthCutAt(x, y));
    }
  });

  it('nenhum bioma desenha graveto', () => {
    for (const id of BIOME_IDS) {
      const b = BIOMES[id];
      for (const list of [b.small, b.tall ?? [], b.trees ?? []]) for (const f of STICKS) expect(list, id).not.toContain(f);
    }
  });

  it('a decoração só troca por coisa do mesmo tipo, e o resto fica como está', () => {
    for (const [x, y] of tiles()) {
      for (const frame of SMALL) expect(STICKS).not.toContain(decorFrameAt(frame, x, y));
      for (const frame of PINES) expect(SOLID_TREES.has(decorFrameAt(frame, x, y)), `pinheiro ${frame} em ${x},${y}`).toBe(true);
      for (const frame of [1, 3, 12, 21, 22, 33, 40]) expect(decorFrameAt(frame, x, y)).toBe(frame);
    }
  });

  it('o mato alto vira mato ou rasteiro do próprio bioma', () => {
    for (const [x, y] of tiles()) {
      for (const frame of TALL) {
        const out = decorFrameAt(frame, x, y);
        const allowed = new Set<number>([frame, ...BIOME_IDS.flatMap((id: BiomeId) => BIOMES[id].tall ?? [])]);
        expect(allowed.has(out), `mato ${frame} em ${x},${y} virou ${out}`).toBe(true);
      }
    }
  });
});

describe('a vida de cada bioma', () => {
  it('cada bicho, planta e luz mora em um ou dois biomas, e as cinzas ficam em silêncio', () => {
    for (const [kind, homes] of Object.entries(LIFE_HOMES)) {
      expect(homes.length, kind).toBeGreaterThanOrEqual(1);
      expect(homes.length, kind).toBeLessThanOrEqual(2);
      expect(homes, kind).not.toContain('ash');
    }
  });
});
