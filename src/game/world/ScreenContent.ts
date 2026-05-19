import { CHUNK_COLUMNS, CHUNK_ROWS } from '@/game/constants';
import type { ChunkManager } from './ChunkManager';
import {
  START_SCREEN_CHUNK_X,
  START_SCREEN_CHUNK_Y,
  WORLD_MAX_CHUNK_X,
  WORLD_MAX_CHUNK_Y,
  WORLD_MIN_CHUNK_X,
  WORLD_MIN_CHUNK_Y,
} from './WorldGenerator';

export type EnemyKind = 'bat' | 'slime' | 'undead' | 'spider' | 'mage' | 'bigSlime';
export type PickupKind = 'heart' | 'sword';

export type EnemySpawn = {
  type: EnemyKind;
  worldX: number;
  worldY: number;
};

export type PickupSpawn = {
  type: PickupKind;
  worldX: number;
  worldY: number;
};

export type ScreenContent = {
  enemies: EnemySpawn[];
  pickups: PickupSpawn[];
};

const hash = (a: number, b: number, c: number, d: number): number => {
  let v = (((a * 73856093) ^ (b * 19349663) ^ (c * 83492791) ^ (d * 48397741)) >>> 0);
  v = (((v >> 16) ^ v) * 0x45d9f3b) >>> 0;
  v = (((v >> 16) ^ v) * 0x45d9f3b) >>> 0;
  return ((v >> 16) ^ v) >>> 0;
};

const screenKey = (cx: number, cy: number): string => `${cx},${cy}`;

const collectOpenTiles = (cx: number, cy: number, chunkManager: ChunkManager): Array<{ worldX: number; worldY: number }> => {
  const tiles: Array<{ worldX: number; worldY: number }> = [];
  for (let ly = 1; ly < CHUNK_ROWS - 1; ly++) {
    for (let lx = 1; lx < CHUNK_COLUMNS - 1; lx++) {
      const worldX = (cx * CHUNK_COLUMNS) + lx;
      const worldY = (cy * CHUNK_ROWS) + ly;
      if (chunkManager.isCellBlocked(worldX, worldY)) continue;
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

const resolveEnemyRoster = (cx: number, cy: number): EnemyKind[] => {
  const dist = Math.abs(cx - START_SCREEN_CHUNK_X) + Math.abs(cy - START_SCREEN_CHUNK_Y);
  const count = dist <= 2 ? 2 : dist <= 5 ? 3 : 4;
  const pool: EnemyKind[] = dist <= 2
    ? ['bat', 'slime']
    : dist <= 5
    ? ['undead', 'spider']
    : ['mage', 'bigSlime'];

  return Array.from({ length: count }, (_, index) => pool[hash(cx, cy, 17, index) % pool.length]);
};

export const buildScreenContentMap = (chunkManager: ChunkManager): Map<string, ScreenContent> => {
  const content = new Map<string, ScreenContent>();

  for (let cy = WORLD_MIN_CHUNK_Y; cy <= WORLD_MAX_CHUNK_Y; cy++) {
    for (let cx = WORLD_MIN_CHUNK_X; cx <= WORLD_MAX_CHUNK_X; cx++) {
      const key = screenKey(cx, cy);
      const openTiles = collectOpenTiles(cx, cy, chunkManager);

      if (cx === START_SCREEN_CHUNK_X && cy === START_SCREEN_CHUNK_Y) {
        content.set(key, { enemies: [], pickups: [] });
        continue;
      }

      const enemies: EnemySpawn[] = [];
      const pickups: PickupSpawn[] = [];
      const roster = resolveEnemyRoster(cx, cy);
      const enemyTiles = takeDeterministicTiles(openTiles, cx, cy, roster.length, 101);

      roster.forEach((type, index) => {
        const tile = enemyTiles[index];
        if (!tile) return;
        enemies.push({ type, worldX: tile.worldX, worldY: tile.worldY });
      });

      if (cx === START_SCREEN_CHUNK_X + 1 && cy === START_SCREEN_CHUNK_Y) {
        const swordTile = takeDeterministicTiles(openTiles, cx, cy, 1, 303)[0];
        if (swordTile) {
          pickups.push({ type: 'sword', worldX: swordTile.worldX, worldY: swordTile.worldY });
        }
      }

      if ((hash(cx, cy, 401, 0) % 3) === 0) {
        const heartTile = takeDeterministicTiles(openTiles, cx, cy, 1, 402)[0];
        if (heartTile) {
          pickups.push({ type: 'heart', worldX: heartTile.worldX, worldY: heartTile.worldY });
        }
      }

      content.set(key, { enemies, pickups });
    }
  }

  return content;
};

export const toScreenKey = screenKey;
