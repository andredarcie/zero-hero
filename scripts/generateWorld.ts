// One-shot seed generator: freezes today's procedural content into a finite 8x8-chunk
// world.json. Run with `npm run generate:world`. It re-runs the (now seed-only) terrain and
// content generators over an 8x8 window of the old infinite world and relabels it to a
// bounded 0..7 grid, so the initial authored world is identical to what the procedural game
// produced — just captured as editable data.
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ASSET_KEYS, CHUNK_COLUMNS, CHUNK_ROWS } from '@/game/constants';
import { DIALOG_VOICES, NPC_DIALOGS } from '@/game/dialogs/NpcDialogs';
import type { NpcKind } from '@/game/world/ScreenContent';
import type { ChunkData } from '@/game/world/Chunk';
import type {
  WorldChunk,
  WorldData,
  WorldDialog,
  WorldEnemySpawn,
  WorldNpcSpawn,
  WorldPickupSpawn,
} from '@/game/world/worldSchema';
import { WORLD_SCHEMA_VERSION } from '@/game/world/worldSchema';
import { computeChunkContent, type BlockSource } from './worldgen/contentGen';
import {
  START_SCREEN_PLAYER_X,
  START_SCREEN_PLAYER_Y,
  generateChunk,
} from './worldgen/terrainGen';

const WORLD_CHUNKS_X = 8;
const WORLD_CHUNKS_Y = 8;

// Map the old infinite window (old chunk (0,0) = start) onto the new bounded 0..7 grid by
// shifting +4 chunks (= +48 tiles) on both axes, which centers the start at (4,4) and keeps
// the entire curated-NPC region.
const OFFSET_CX = 4;
const OFFSET_CY = 4;
const OFFSET_X = OFFSET_CX * CHUNK_COLUMNS;
const OFFSET_Y = OFFSET_CY * CHUNK_ROWS;

// Generator-backed block source, replicating the pre-migration ChunkManager.getTile so
// computeChunkContent sees the exact same open/blocked tiles it did in the live game.
const genCache = new Map<string, ChunkData>();
const genChunk = (cx: number, cy: number): ChunkData => {
  const key = `${cx},${cy}`;
  let chunk = genCache.get(key);
  if (!chunk) {
    chunk = generateChunk(cx, cy);
    genCache.set(key, chunk);
  }
  return chunk;
};
const blockSource: BlockSource = {
  isCellBlocked(worldX: number, worldY: number): boolean {
    const cx = Math.floor(worldX / CHUNK_COLUMNS);
    const cy = Math.floor(worldY / CHUNK_ROWS);
    const lx = ((worldX % CHUNK_COLUMNS) + CHUNK_COLUMNS) % CHUNK_COLUMNS;
    const ly = ((worldY % CHUNK_ROWS) + CHUNK_ROWS) % CHUNK_ROWS;
    return genChunk(cx, cy).collisions[ly][lx];
  },
};

const shiftX = <T extends { worldX: number; worldY: number }>(spawn: T): T => ({
  ...spawn,
  worldX: spawn.worldX + OFFSET_X,
  worldY: spawn.worldY + OFFSET_Y,
});

const chunks: WorldChunk[] = [];
for (let ncy = 0; ncy < WORLD_CHUNKS_Y; ncy++) {
  for (let ncx = 0; ncx < WORLD_CHUNKS_X; ncx++) {
    const ocx = ncx - OFFSET_CX;
    const ocy = ncy - OFFSET_CY;
    const terrain = generateChunk(ocx, ocy);
    const content = computeChunkContent(ocx, ocy, blockSource);
    chunks.push({
      cx: ncx,
      cy: ncy,
      ground: terrain.ground,
      upper: terrain.upper,
      collisions: terrain.collisions,
      enemies: content.enemies.map(shiftX) as WorldEnemySpawn[],
      pickups: content.pickups.map(shiftX) as WorldPickupSpawn[],
      npcs: content.npcs.map(shiftX) as WorldNpcSpawn[],
    });
  }
}

const dialogs: Partial<Record<NpcKind, WorldDialog>> = {};
(Object.keys(NPC_DIALOGS) as NpcKind[]).forEach((kind) => {
  const script = NPC_DIALOGS[kind];
  dialogs[kind] = {
    npcName: script.npcName,
    npcColorHex: script.npcColorHex,
    npcAssetKey: script.npcAssetKey,
    npcFrame: script.npcFrame,
    voice: DIALOG_VOICES[kind],
    lines: script.lines.map((line) => ({ speaker: line.speaker, text: line.text })),
  };
});

const world: WorldData = {
  meta: {
    name: 'overworld',
    schemaVersion: WORLD_SCHEMA_VERSION,
    worldChunksX: WORLD_CHUNKS_X,
    worldChunksY: WORLD_CHUNKS_Y,
    chunkColumns: CHUNK_COLUMNS,
    chunkRows: CHUNK_ROWS,
    tileSize: 8,
    tilesetKey: ASSET_KEYS.forestTileset,
    playerStart: { worldX: START_SCREEN_PLAYER_X + OFFSET_X, worldY: START_SCREEN_PLAYER_Y + OFFSET_Y },
    exportedAt: new Date().toISOString(),
  },
  chunks,
  props: [
    { type: 'campfire', worldX: START_SCREEN_PLAYER_X + 2 + OFFSET_X, worldY: START_SCREEN_PLAYER_Y - 4 + OFFSET_Y },
  ],
  dialogs,
};

const outPath = fileURLToPath(new URL('../public/world.json', import.meta.url));
mkdirSync(path.dirname(outPath), { recursive: true });
writeFileSync(outPath, `${JSON.stringify(world, null, 2)}\n`, 'utf8');

const enemyCount = chunks.reduce((sum, c) => sum + c.enemies.length, 0);
const npcCount = chunks.reduce((sum, c) => sum + c.npcs.length, 0);
const pickupCount = chunks.reduce((sum, c) => sum + c.pickups.length, 0);
const namedNpcs = new Set(chunks.flatMap((c) => c.npcs.map((n) => n.type)));
// eslint-disable-next-line no-console
console.log(
  `world.json written: ${chunks.length} chunks, start (${world.meta.playerStart.worldX},${world.meta.playerStart.worldY}), ` +
  `${enemyCount} enemies, ${npcCount} npcs (${namedNpcs.size} kinds), ${pickupCount} pickups -> ${outPath}`,
);
