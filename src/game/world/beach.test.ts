import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { beforeAll, describe, expect, it } from 'vitest';

import { SAND_TILE_FRAME, SEA_TILE_FRAME, SOLID_UPPER_FRAMES, groundFrameAt, SAND_TILE_FRAMES } from '@/game/constants';
import { inBeachTrail } from '@/game/objects/TrailGrass';
import { BEACH_CHAIR, BEACH_UMBRELLA } from '@/game/objects/beach/BeachSeat';
import { SAND_MOUND_TILES } from '@/game/objects/beach/SandMounds';
import { SPRING_DEPTH, SPRING_LANTERN, SPRING_MAPLE, SPRING_POOL, SPRING_SURFACE, isSpringPool } from './hotSpring';

import { canStep, reliefLevelAt, terrainHeightAt } from './relief';
import { getChunkTerrain, getTileGround, getTileRelief, getWorldBounds, isInsideWorld, isVoidSea, setWorldData } from './WorldData';
import type { WorldData } from './worldSchema';

// A PRAIA DO NORTE (scripts/praia-do-norte.mjs), lida como o jogo lê. O que vale sempre, por mais que o editor mexa
// nela: o mapa cresceu para o norte sem renumerar nada; a borda norte é mar, e o mar de fora continua; a trilha é
// LIVRE, sem ferramenta nenhuma (o autor, 2026-11-19); e toda a areia se alcança.

const here = path.dirname(fileURLToPath(import.meta.url));
const world = JSON.parse(readFileSync(path.resolve(here, '../../../public/world.json'), 'utf8')) as WorldData;
const W = world.meta.worldChunksX * world.meta.chunkColumns;
const TOP = (world.meta.originCy ?? 0) * world.meta.chunkRows;

const propAt = new Map(world.props.map((p) => [`${p.worldX},${p.worldY}`, p.type]));
const npcAt = new Set(world.chunks.flatMap((c) => c.npcs).map((n) => `${n.worldX},${n.worldY}`));
const tile = (x: number, y: number): { ground: number; upper: number | null; collision: boolean } | null => {
  const c = world.chunks.find((k) => k.cx === Math.floor(x / 12) && k.cy === Math.floor(y / 12));
  if (!c || x < 0 || x >= W) return null;
  return { ground: c.ground[y - c.cy * 12][x - c.cx * 12], upper: c.upper[y - c.cy * 12][x - c.cx * 12], collision: c.collisions[y - c.cy * 12][x - c.cx * 12] };
};
/** Por onde se anda a partir da fogueira da Thea (ou de `from`), com ou sem a foice (o mato alto é parede sem ela). */
const reach = (scythe: boolean, from: readonly [number, number] = [43, 5]): Set<string> => {
  const open = (x: number, y: number): boolean => {
    const t = tile(x, y);
    if (!t || t.collision || t.ground === SEA_TILE_FRAME || (t.upper !== null && SOLID_UPPER_FRAMES.has(t.upper))) return false;
    if (npcAt.has(`${x},${y}`)) return false;
    const p = propAt.get(`${x},${y}`);
    if (!p || p === 'plantSpot' || p === 'bridgeSpot') return true;
    return p === 'tallGrass' && scythe;
  };
  const seen = new Set([`${from[0]},${from[1]}`]);
  const queue: Array<[number, number]> = [[from[0], from[1]]];
  while (queue.length) {
    const [x, y] = queue.shift() as [number, number];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const k = `${x + dx},${y + dy}`;
      if (seen.has(k) || y + dy > 12 || !open(x + dx, y + dy) || !canStep(x, y, x + dx, y + dy)) continue;
      seen.add(k);
      queue.push([x + dx, y + dy]);
    }
  }
  return seen;
};

beforeAll(() => setWorldData(JSON.parse(JSON.stringify(world))));

describe('o mapa cresceu para o norte', () => {
  it('duas linhas de chunk acima da linha 0, e as coordenadas de sempre continuam valendo', () => {
    expect(world.meta.originCy).toBe(-2);
    expect(world.meta.worldChunksY).toBe(7);
    const b = getWorldBounds();
    expect([b.minCy, b.maxCy, b.minTileY, b.maxTileY]).toEqual([-2, 4, -24, 59]);
    expect(isInsideWorld(0, -2)).toBe(true);
    expect(isInsideWorld(0, -3)).toBe(false);
    // o começo da aventura e a casa da Thea estão onde sempre estiveram, e nada do vale foi parar numa linha negativa
    expect(world.meta.playerStart).toEqual({ worldX: 30, worldY: 57 });
    expect(world.chunks.flatMap((c) => c.npcs).find((n) => n.type === 'astronaut')).toMatchObject({ worldX: 41, worldY: 5 });
    const north = world.props.filter((p) => p.worldY < 0).map((p) => p.type);
    expect([...new Set(north)].sort()).toEqual(['coconutPalm', 'tallGrass']);
    expect(world.chunks.filter((c) => c.cy < 0).every((c) => c.npcs.length === 0 && c.pickups.length === 0)).toBe(true);
  });

  it('a serra lê as linhas novas: as escadas da trilha e o cume estão no relevo', () => {
    expect([getTileRelief(42, -1), getTileRelief(42, -2), getTileRelief(41, -4), getTileRelief(41, -5)]).toEqual([2, 1, 9, 8]);
    expect([getTileRelief(45, -6), getTileRelief(45, -7), getTileRelief(45, -8), getTileRelief(45, -9)]).toEqual([11, 1, 4, 0]);
    expect(terrainHeightAt(42, -2)).toBe(1);
    expect(terrainHeightAt(43, -5)).toBe(2);
    expect(terrainHeightAt(30, -14)).toBe(0);
    // fora do mapa, ao norte, o relevo é zero (lá é mar)
    expect(getTileRelief(30, -25)).toBe(0);
  });

  it('a borda norte é mar de ponta a ponta, e o mar de fora continua até o horizonte', () => {
    for (let x = 0; x < W; x += 1) expect(getTileGround(x, TOP), `x=${x}`).toBe(SEA_TILE_FRAME);
    expect(isVoidSea(30, -25)).toBe(true);
    expect(isVoidSea(30, -200)).toBe(true);
    expect(isVoidSea(-9, -24)).toBe(true); // dobra a ponta da enseada
    expect(isVoidSea(-9, -40)).toBe(true);
    // onde a borda é terra, o fora é a mata de sempre
    expect(isVoidSea(-1, 30)).toBe(false);
    expect(isVoidSea(30, 60)).toBe(false);
    expect(isVoidSea(-1, -10)).toBe(false);
    expect(isVoidSea(30, -10)).toBe(false); // dentro do mapa nunca é "mar de fora"
    const north = getChunkTerrain(2, -3);
    expect(north.ground.flat().every((f) => f === SEA_TILE_FRAME)).toBe(true);
    expect(north.upper.flat().every((u) => u === null)).toBe(true);
    expect(north.collisions.flat().every((c) => c)).toBe(true);
    // e morro nenhum nasce do mar de fora
    for (const [x, y] of [[30, -26], [10, -30], [50, -36], [-6, -30]] as const) expect(reliefLevelAt(x, y), `${x},${y}`).toBe(0);
  });
});

describe('a praia', () => {
  it('a areia vai de fora a fora, entre os dois pontais', () => {
    for (let x = 6; x <= 53; x += 1) {
      let sand = 0;
      for (let y = TOP; y < 0; y += 1) if (tile(x, y)?.ground === SAND_TILE_FRAME) sand += 1;
      expect(sand, `coluna ${x}`).toBeGreaterThanOrEqual(5);
    }
  });

  it('a areia guarda um frame só, e o jogo veste as quatro pinturas pelo lugar', () => {
    const worn = new Set<number>();
    for (let y = TOP; y < 0; y += 1) {
      for (let x = 0; x < W; x += 1) {
        if (tile(x, y)?.ground !== SAND_TILE_FRAME) continue;
        const frame = groundFrameAt(SAND_TILE_FRAME, x, y);
        expect(SAND_TILE_FRAMES.has(frame)).toBe(true);
        expect(groundFrameAt(SAND_TILE_FRAME, x, y)).toBe(frame);
        worn.add(frame);
      }
    }
    expect([...worn].sort()).toEqual([141, 142, 143, 144]);
  });

  it('os coqueiros nascem em chão firme, longe da onda, e nunca dois no mesmo tile', () => {
    const palms = world.props.filter((p) => p.type === 'coconutPalm');
    expect(palms.length).toBeGreaterThanOrEqual(40);
    expect(new Set(palms.map((p) => `${p.worldX},${p.worldY}`)).size).toBe(palms.length);
    for (const p of palms) {
      const t = tile(p.worldX, p.worldY);
      expect(t && t.ground !== SEA_TILE_FRAME && t.upper === null && !t.collision, `${p.worldX},${p.worldY}`).toBe(true);
      // a três tiles do mar, ao menos: a faixa que a onda lava fica livre
      for (let d = 1; d <= 3; d += 1) expect(tile(p.worldX, p.worldY - d)?.ground, `${p.worldX},${p.worldY}`).not.toBe(SEA_TILE_FRAME);
    }
  });

  it('os montinhos de areia e o guarda-sol ficam na areia seca, livres, e se alcançam', () => {
    const open = reach(false);
    const dry = (x: number, y: number): boolean => {
      const t = tile(x, y);
      return Boolean(t && t.ground === SAND_TILE_FRAME && t.upper === null && !t.collision && !propAt.has(`${x},${y}`)
        && [1, 2, 3].every((d) => tile(x, y - d)?.ground !== SEA_TILE_FRAME));
    };
    for (const m of SAND_MOUND_TILES) {
      expect(dry(m.x, m.y), `montinho ${m.x},${m.y}`).toBe(true);
      // com o montinho em pé (sólido), algum vizinho de areia continua alcançável para o balde
      expect([[0, 1], [0, -1], [1, 0], [-1, 0]].some(([dx, dy]) => open.has(`${m.x + dx},${m.y + dy}`)), `${m.x},${m.y}`).toBe(true);
    }
    expect(dry(BEACH_CHAIR.x, BEACH_CHAIR.y) && dry(BEACH_UMBRELLA.x, BEACH_UMBRELLA.y)).toBe(true);
    // senta-se pelo sul, olhando o mar
    expect(open.has(`${BEACH_CHAIR.x},${BEACH_CHAIR.y + 1}`)).toBe(true);
  });
});

describe('a trilha', () => {
  /** Os tiles que a primeira versão fechava com mato alto (oito cortes de foice): hoje, chão livre. */
  const TRAIL: ReadonlyArray<readonly [number, number]> = [[42, 3], [42, 2], [42, 1], [41, -3], [43, -5], [44, -5], [45, -7], [45, -9]];

  it('o caminho para a praia não tem mato nenhum (o mato que sobrou no terraço é de enfeite, fora dele)', () => {
    for (const [x, y] of TRAIL) expect(propAt.get(`${x},${y}`), `${x},${y}`).toBeUndefined();
    // o mato que sobrou lá em cima é verde (só a foice), e o do resto do vale não é da trilha (pega fogo e volta)
    expect(inBeachTrail(40, -2)).toBe(true);
    expect(inBeachTrail(42, 4)).toBe(false);
    expect(inBeachTrail(30, 40)).toBe(false);
  });

  it('sem ferramenta nenhuma, sobe-se a serra e chega-se à areia, a qualquer hora do jogo', () => {
    const open = reach(false);
    for (const k of ['42,3', '42,1', '42,-1', '42,-2', '41,-4', '41,-5', '45,-6', '45,-7', '45,-8', '45,-9', '45,-10', '30,-14']) expect(open.has(k), k).toBe(true);
  });

  it('toda a areia e toda a duna se alcançam', () => {
    const open = reach(false);
    const stranded: string[] = [];
    for (let y = TOP; y <= -9; y += 1) {
      for (let x = 0; x < W; x += 1) {
        const t = tile(x, y);
        if (!t || t.collision || t.ground === SEA_TILE_FRAME || getTileRelief(x, y) !== 0) continue;
        if (t.upper !== null && SOLID_UPPER_FRAMES.has(t.upper)) continue;
        if (propAt.get(`${x},${y}`) === 'coconutPalm') continue;
        if (!open.has(`${x},${y}`)) stranded.push(`${x},${y}`);
      }
    }
    expect(stranded).toEqual([]);
  });
});

describe('o mapa é sempre um retângulo (regra do autor, 2026-11-19)', () => {
  it('cada chunk do retângulo existe uma vez só, e nenhum fica de fora dele', () => {
    const { worldChunksX, worldChunksY, originCy = 0 } = world.meta;
    const keys = world.chunks.map((c) => `${c.cx},${c.cy}`);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys.length).toBe(worldChunksX * worldChunksY);
    for (const c of world.chunks) {
      expect(c.cx >= 0 && c.cx < worldChunksX && c.cy >= originCy && c.cy < originCy + worldChunksY, `${c.cx},${c.cy}`).toBe(true);
    }
  });
});

describe('a fonte termal, na gruta atrás do lago de lava', () => {
  const POOL: Array<[number, number]> = [];
  for (let y = SPRING_POOL.y0; y <= SPRING_POOL.y1; y += 1) for (let x = SPRING_POOL.x0; x <= SPRING_POOL.x1; x += 1) POOL.push([x, y]);

  it('a água é pedra com colisão no chão de baixo, do tamanho que o objeto desenha; a lanterna também barra', () => {
    for (const [x, y] of POOL) {
      const t = tile(x, y);
      expect(t?.collision && t.ground === 23 && getTileRelief(x, y) === 0, `${x},${y}`).toBe(true);
      expect(isSpringPool(x, y)).toBe(true);
    }
    expect(tile(SPRING_LANTERN.x, SPRING_LANTERN.y)?.collision).toBe(true);
    // o pé do bordo também, e sem pinheiro em cima (a árvore é da fonte: objects/spring/SpringMaple)
    expect(tile(SPRING_MAPLE.x, SPRING_MAPLE.y)).toMatchObject({ collision: true, upper: null });
  });

  it('a bacia é funda, e a água fica abaixo da borda e acima do leito', () => {
    expect(SPRING_DEPTH).toBeGreaterThan(0.3);
    expect(SPRING_SURFACE).toBeLessThan(0);
    expect(-SPRING_DEPTH).toBeLessThan(SPRING_SURFACE - 0.2);
  });

  it('ZERO PRAIA À VISTA: entre a gruta e a duna, e a leste dela, o paredão é mata alta de dois andares', () => {
    // três fileiras ao norte da gruta, de ponta a ponta dela; e a mata alta desce até a duna no leste
    for (const y of [-4, -5, -6]) for (let x = 0; x <= 13; x += 1) expect(getTileRelief(x, y), `${x},${y}`).toBe(7);
    for (const y of [-2, -3, -4, -5]) for (let x = 11; x <= 17; x += 1) expect(getTileRelief(x, y), `${x},${y}`).toBe(7);
  });

  it('do corredor das minas (já do outro lado da lava) se entra na gruta e se chega à beira da água', () => {
    const open = reach(false, [5, 1]);
    for (const k of ['5,0', '5,-1', '1,-1', '2,-2', '2,-3', '7,-3', '9,-3', '10,-2']) expect(open.has(k), k).toBe(true);
    for (let x = SPRING_POOL.x0; x <= SPRING_POOL.x1; x += 1) expect(open.has(`${x},${SPRING_POOL.y1 + 1}`), `${x}`).toBe(true);
    for (const [x, y] of POOL) expect(open.has(`${x},${y}`), `${x},${y}`).toBe(false);
  });

  it('do lado de cá da lava, não: a gruta só se alcança atravessando o lago', () => {
    const open = reach(true);
    for (const k of ['5,-1', '2,-3', '5,0']) expect(open.has(k), k).toBe(false);
  });
});
