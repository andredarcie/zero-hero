// SEED-ONLY content generator. This is the generation half of the former
// src/game/world/ScreenContent.ts (enemy/NPC/pickup placement rules), relocated so it is
// imported ONLY by scripts/generateWorld.ts. The live game reads placed entities from
// world.json via WorldData.ts and no longer computes them.
import { CHUNK_COLUMNS, CHUNK_ROWS } from '@/game/constants';
import {
  type NpcKind,
  type NpcSpawn,
  type PickupSpawn,
  type ScreenContent,
} from '@/game/world/ScreenContent';
import {
  START_SCREEN_CHUNK_X,
  START_SCREEN_CHUNK_Y,
  WORLD_MAX_CHUNK_X,
  WORLD_MAX_CHUNK_Y,
  WORLD_MIN_CHUNK_X,
  WORLD_MIN_CHUNK_Y,
  hash,
  isInsideStaticWorld,
} from './terrainGen';

// Anything that can answer whether a tile blocks movement — the generator-backed chunk
// source in generateWorld.ts satisfies this without importing the runtime ChunkManager.
export type BlockSource = { isCellBlocked(worldX: number, worldY: number): boolean };

const screenKey = (cx: number, cy: number): string => `${cx},${cy}`;

const collectOpenTiles = (cx: number, cy: number, source: BlockSource): Array<{ worldX: number; worldY: number }> => {
  const tiles: Array<{ worldX: number; worldY: number }> = [];
  for (let ly = 1; ly < CHUNK_ROWS - 1; ly++) {
    for (let lx = 1; lx < CHUNK_COLUMNS - 1; lx++) {
      const worldX = (cx * CHUNK_COLUMNS) + lx;
      const worldY = (cy * CHUNK_ROWS) + ly;
      if (source.isCellBlocked(worldX, worldY)) continue;
      tiles.push({ worldX, worldY });
    }
  }
  return tiles;
};

const takeDeterministicTiles = (
  openTiles: Array<{ worldX: number; worldY: number }>,
  cx: number,
  cy: number,
  count: number,
  salt: number,
): Array<{ worldX: number; worldY: number }> => {
  const picked: Array<{ worldX: number; worldY: number }> = [];
  const used = new Set<number>();
  if (openTiles.length === 0) return picked;

  for (let i = 0; i < count; i++) {
    let index = hash(cx, cy, salt, i) % openTiles.length;
    let guard = 0;
    while (used.has(index) && guard < openTiles.length) {
      index = (index + 1) % openTiles.length;
      guard += 1;
    }
    if (used.has(index)) break;
    used.add(index);
    picked.push(openTiles[index]);
  }

  return picked;
};

const ALL_NPC_KINDS: readonly NpcKind[] = [
  'blackCat', 'mimic', 'astronaut', 'businessMan', 'radiationSuit', 'painter', 'salesman', 'poet', 'death',
];

// Curated assignment of the nine named NPCs to screens inside the original hand-authored
// region, so the intro area always has them. Beyond that region NPCs are procedural.
const buildNpcAssignment = (): Map<string, NpcKind> => {
  const screens: Array<{ cx: number; cy: number }> = [];
  for (let cy = WORLD_MIN_CHUNK_Y; cy <= WORLD_MAX_CHUNK_Y; cy++) {
    for (let cx = WORLD_MIN_CHUNK_X; cx <= WORLD_MAX_CHUNK_X; cx++) {
      if (cx === START_SCREEN_CHUNK_X && cy === START_SCREEN_CHUNK_Y) continue;
      screens.push({ cx, cy });
    }
  }

  for (let i = screens.length - 1; i > 0; i--) {
    const j = hash(i, 0, 809, 3) % (i + 1);
    const tmp = screens[i];
    screens[i] = screens[j];
    screens[j] = tmp;
  }

  const assignment = new Map<string, NpcKind>();
  for (let k = 0; k < ALL_NPC_KINDS.length; k++) {
    assignment.set(screenKey(screens[k].cx, screens[k].cy), ALL_NPC_KINDS[k]);
  }
  return assignment;
};

const NPC_ASSIGNMENT = buildNpcAssignment();

// Out in the open world, roughly one chunk in six hosts a wandering NPC.
const proceduralNpc = (cx: number, cy: number): NpcKind | null => {
  if (isInsideStaticWorld(cx, cy)) return null;
  if (hash(cx, cy, 909, 1) % 6 !== 0) return null;
  return ALL_NPC_KINDS[hash(cx, cy, 909, 2) % ALL_NPC_KINDS.length];
};

// Enemies are NEVER generated: the world ships with zero enemies. Skulls are summoned at
// runtime around the hero while they linger in the dark (see UndeadSpawnDirector).
export const computeChunkContent = (cx: number, cy: number, source: BlockSource): ScreenContent => {
  if (cx === START_SCREEN_CHUNK_X && cy === START_SCREEN_CHUNK_Y) {
    return { enemies: [], pickups: [], npcs: [] };
  }

  const key = screenKey(cx, cy);
  const openTiles = collectOpenTiles(cx, cy, source);
  const pickups: PickupSpawn[] = [];
  const npcs: NpcSpawn[] = [];

  const npcKind = NPC_ASSIGNMENT.get(key) ?? proceduralNpc(cx, cy);
  if (npcKind) {
    const npcTile = takeDeterministicTiles(openTiles, cx, cy, 1, 702)[0];
    if (npcTile) npcs.push({ type: npcKind, worldX: npcTile.worldX, worldY: npcTile.worldY });
  }

  // The sword waits one screen east of the start.
  if (cx === START_SCREEN_CHUNK_X + 1 && cy === START_SCREEN_CHUNK_Y) {
    const swordTile = takeDeterministicTiles(openTiles, cx, cy, 1, 303)[0];
    if (swordTile) pickups.push({ type: 'sword', worldX: swordTile.worldX, worldY: swordTile.worldY });
  }

  if ((hash(cx, cy, 401, 0) % 3) === 0) {
    const heartTile = takeDeterministicTiles(openTiles, cx, cy, 1, 402)[0];
    if (heartTile) pickups.push({ type: 'heart', worldX: heartTile.worldX, worldY: heartTile.worldY });
  }

  return { enemies: [], pickups, npcs };
};
