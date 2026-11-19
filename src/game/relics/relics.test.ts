import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { beforeAll, describe, expect, it } from 'vitest';

import { CHUNK_COLUMNS, CHUNK_ROWS, SAND_TILE_FRAME } from '@/game/constants';
import { RELIC_ART } from '@/game/render3d/relicArt';
import { CELL_TOWER_OFFSET } from '@/game/render3d/towerArt';
import { inCampZone } from '@/game/runtime/homeGrid';
import { NOTEBOOK } from '@/game/runtime/notebook';
import { canStep, RELIEF_PEAK } from '@/game/world/relief';
import { AUTHORED_TRAILS, authoredTiles, valleyBlocked } from '@/game/world/trails';
import {
  getChunkTerrain, getHearths, getNpcTiles, getOccupiedTiles, getPlayerStart, getTileRelief, getWorldBounds, setWorldData,
} from '@/game/world/WorldData';
import { isRelicKind, RELIC_KINDS, RELIC_SPOTS, relicAt } from './relics';

// AS RELÍQUIAS NO MAPA DE VERDADE: nove trincas, uma por região do vale, em chão livre e nu, que se alcança a pé desde o
// começo, longe das casas, das trilhas, da estrada antiga e do acampamento; e a torre na ponta do cume.

const here = path.dirname(fileURLToPath(import.meta.url));
const locale = (lang: string): Record<string, unknown> =>
  JSON.parse(fs.readFileSync(path.resolve(here, `../i18n/locales/${lang}.json`), 'utf8')) as Record<string, unknown>;

describe('as relíquias enterradas', () => {
  beforeAll(() => {
    setWorldData(JSON.parse(fs.readFileSync(path.resolve(here, '../../../public/world.json'), 'utf8')));
  });

  it('são onze, cada uma num tile só dela, espalhadas: oito regiões do vale (3×3), o cartão de 2024 na praia, nenhuma perto de outra', () => {
    expect(RELIC_KINDS).toHaveLength(11);
    const tiles = new Set(RELIC_KINDS.map((k) => `${RELIC_SPOTS[k].x},${RELIC_SPOTS[k].y}`));
    expect(tiles.size).toBe(RELIC_KINDS.length);
    // o cartão de 2024 mora na areia da praia do norte (pedido do autor, 2026-11-19), acima da linha 0
    expect(RELIC_SPOTS.nomadPostcard.y).toBeLessThan(0);
    expect(getChunkTerrain(Math.floor(RELIC_SPOTS.nomadPostcard.x / CHUNK_COLUMNS), Math.floor(RELIC_SPOTS.nomadPostcard.y / CHUNK_ROWS))
      .ground[((RELIC_SPOTS.nomadPostcard.y % CHUNK_ROWS) + CHUNK_ROWS) % CHUNK_ROWS][RELIC_SPOTS.nomadPostcard.x % CHUNK_COLUMNS]).toBe(SAND_TILE_FRAME);
    const valley = RELIC_KINDS.filter((k) => RELIC_SPOTS[k].y >= 0);
    const regions = new Set(valley.map((k) => `${Math.floor(RELIC_SPOTS[k].x / 20)},${Math.floor(RELIC_SPOTS[k].y / 20)}`));
    expect(regions.size).toBe(8);
    for (const a of RELIC_KINDS) {
      for (const b of RELIC_KINDS) {
        if (a === b) continue;
        const d = Math.abs(RELIC_SPOTS[a].x - RELIC_SPOTS[b].x) + Math.abs(RELIC_SPOTS[a].y - RELIC_SPOTS[b].y);
        expect(d, `${a} e ${b} longe uma da outra`).toBeGreaterThanOrEqual(8);
      }
    }
    for (const kind of RELIC_KINDS) expect(relicAt(RELIC_SPOTS[kind].x, RELIC_SPOTS[kind].y)).toBe(kind);
    expect(isRelicKind('shovel')).toBe(false);
  });

  it('cada trinca é chão livre e nu, fora do acampamento, das trilhas e da estrada antiga, longe das casas', () => {
    const blocked = valleyBlocked();
    const trails = AUTHORED_TRAILS.flatMap((t) => authoredTiles(t.corners));
    const npcs = getNpcTiles();
    const start = getPlayerStart();
    for (const kind of RELIC_KINDS) {
      const { x, y } = RELIC_SPOTS[kind];
      const at = `${kind} (${x},${y})`;
      expect(blocked(x, y), `${at} livre`).toBe(false);
      const chunk = getChunkTerrain(Math.floor(x / CHUNK_COLUMNS), Math.floor(y / CHUNK_ROWS));
      const row = ((y % CHUNK_ROWS) + CHUNK_ROWS) % CHUNK_ROWS;
      expect(chunk.upper[row][x % CHUNK_COLUMNS], `${at} sem mato em cima (a trinca aparece)`).toBeNull();
      expect(getTileRelief(x, y), `${at} no chão de baixo`).toBe(0);
      expect(inCampZone(x, y), `${at} fora do acampamento`).toBe(false);
      expect(trails.some((p) => Math.abs(p.x - x) + Math.abs(p.y - y) <= 1), `${at} fora das trilhas`).toBe(false);
      expect(Math.abs(x - start.worldX) <= 2 && y >= 34, `${at} fora da estrada antiga`).toBe(false);
      for (const n of npcs) expect(Math.abs(n.worldX - x) + Math.abs(n.worldY - y), `${at} longe de ${n.kind}`).toBeGreaterThan(4);
    }
  });

  it('todas se alcançam a pé desde o começo, sem ferramenta nenhuma', () => {
    // a pé de verdade: subindo a serra pelas escadas (a do cartão de 2024 fica na praia, do outro lado dela)
    const occupied = getOccupiedTiles();
    const b = getWorldBounds();
    const blocked = (x: number, y: number): boolean => {
      const cx = Math.floor(x / CHUNK_COLUMNS);
      const cy = Math.floor(y / CHUNK_ROWS);
      if (cx < b.minCx || cx > b.maxCx || cy < b.minCy || cy > b.maxCy) return true;
      return Boolean(getChunkTerrain(cx, cy).collisions[y - cy * CHUNK_ROWS]?.[x - cx * CHUNK_COLUMNS]) || occupied.has(`${x},${y}`);
    };
    const start = getPlayerStart();
    const seen = new Set([`${start.worldX},${start.worldY}`]);
    const queue = [[start.worldX, start.worldY]];
    while (queue.length) {
      const [x, y] = queue.shift()!;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const k = `${x + dx},${y + dy}`;
        if (seen.has(k) || blocked(x + dx, y + dy) || !canStep(x, y, x + dx, y + dy)) continue;
        seen.add(k);
        queue.push([x + dx, y + dy]);
      }
    }
    for (const kind of RELIC_KINDS) expect(seen.has(`${RELIC_SPOTS[kind].x},${RELIC_SPOTS[kind].y}`), kind).toBe(true);
  });

  it('cada uma tem desenho, a página no caderno e o texto nos dois idiomas', () => {
    expect(NOTEBOOK.find((s) => s.section === 'relics')?.kinds).toEqual(RELIC_KINDS);
    for (const lang of ['pt-br', 'en']) {
      const relics = locale(lang).relics as Record<string, Record<string, string>> & { get: string };
      expect(relics.get).toContain('{name}');
      for (const kind of RELIC_KINDS) {
        expect(typeof RELIC_ART[kind]).toBe('function');
        for (const field of ['name', 'what', 'text']) expect(relics[kind]?.[field], `${lang} relics.${kind}.${field}`).toBeTruthy();
        // Nenhuma frase atribuída ao autor (pedido dele, 2026-11-18: "tire as frases de André").
        expect(JSON.stringify(relics[kind]), `${lang} relics.${kind}`).not.toMatch(/André/u);
      }
      expect((locale(lang).notebook as { sections: Record<string, string> }).sections.relics).toBeTruthy();
    }
  });

  it('a torre fica na quina de trás do cume, longe dos lugares em volta do fogo', () => {
    const hearth = getHearths()[0];
    const x = hearth.worldX + CELL_TOWER_OFFSET.dx;
    const y = hearth.worldY + CELL_TOWER_OFFSET.dy;
    expect(getTileRelief(x, y)).toBe(RELIEF_PEAK);
    // a fileira de trás do cume (onde a nave pousa, no meio) e a ponta de um lado
    expect(getTileRelief(x, y - 1)).not.toBe(RELIEF_PEAK);
    expect(getTileRelief(x + 1, y)).not.toBe(RELIEF_PEAK);
    // nenhum dos lugares onde os amigos sentam (HearthReunion: até um passo atrás do fogo)
    expect(hearth.worldY - y).toBeGreaterThan(1);
  });
});
