// SEED-ONLY terrain generator. This is the former src/game/world/WorldGenerator.ts,
// relocated here so it is imported ONLY by the offline world.json generator
// (scripts/generateWorld.ts) and never by the runtime bundle. The live game reads terrain
// exclusively from world.json via WorldData.ts.
import { CHUNK_COLUMNS, CHUNK_ROWS } from '@/game/constants';
import type { ChunkData } from '@/game/world/Chunk';

const GROUND_TILE = 5;
// Frames 10 (red flowers) and 11 (purple flowers) are walkable decor, not obstacles.
const DECOR_FRAMES = [0, 6, 7, 8, 10, 11] as const;
const OBSTACLE_FRAMES = [4, 15, 16, 17] as const;
const CENTER_X = Math.floor(CHUNK_COLUMNS / 2);
const CENTER_Y = Math.floor(CHUNK_ROWS / 2);

// The original hand-authored region used for curated NPC placement (see contentGen).
export const WORLD_CHUNK_COLUMNS = 8;
export const WORLD_CHUNK_ROWS = 4;
export const WORLD_MIN_CHUNK_X = -4;
export const WORLD_MAX_CHUNK_X = WORLD_MIN_CHUNK_X + WORLD_CHUNK_COLUMNS - 1;
export const WORLD_MIN_CHUNK_Y = -2;
export const WORLD_MAX_CHUNK_Y = WORLD_MIN_CHUNK_Y + WORLD_CHUNK_ROWS - 1;
export const START_SCREEN_CHUNK_X = 0;
export const START_SCREEN_CHUNK_Y = 0;
export const START_SCREEN_PLAYER_X = (START_SCREEN_CHUNK_X * CHUNK_COLUMNS) + CENTER_X;
export const START_SCREEN_PLAYER_Y = (START_SCREEN_CHUNK_Y * CHUNK_ROWS) + CENTER_Y;

export const hash = (a: number, b: number, c: number, d: number): number => {
  let v = (((a * 73856093) ^ (b * 19349663) ^ (c * 83492791) ^ (d * 48397741)) >>> 0);
  v = (((v >> 16) ^ v) * 0x45d9f3b) >>> 0;
  v = (((v >> 16) ^ v) * 0x45d9f3b) >>> 0;
  return ((v >> 16) ^ v) >>> 0;
};

export const isInsideStaticWorld = (cx: number, cy: number): boolean => (
  cx >= WORLD_MIN_CHUNK_X
  && cx <= WORLD_MAX_CHUNK_X
  && cy >= WORLD_MIN_CHUNK_Y
  && cy <= WORLD_MAX_CHUNK_Y
);

// A generous clearing around the spawn (and the campfire above it) so the player never
// starts boxed in.
const isStartClearing = (cx: number, cy: number, lx: number, ly: number): boolean => {
  if (cx !== START_SCREEN_CHUNK_X || cy !== START_SCREEN_CHUNK_Y) return false;
  return Math.abs(lx - CENTER_X) <= 4 && ly >= 1 && ly <= CENTER_Y + 4;
};

export const generateChunk = (cx: number, cy: number): ChunkData => {
  const ground: number[][] = [];
  const upper: (number | null)[][] = [];
  const collisions: boolean[][] = [];

  for (let ly = 0; ly < CHUNK_ROWS; ly++) {
    ground[ly] = [];
    upper[ly] = [];
    collisions[ly] = [];

    for (let lx = 0; lx < CHUNK_COLUMNS; lx++) {
      ground[ly][lx] = GROUND_TILE;
      upper[ly][lx] = null;
      collisions[ly][lx] = false;

      if (isStartClearing(cx, cy, lx, ly)) continue;

      const r = hash(cx, cy, lx + 1, ly + 1);
      const m = r % 100;
      if (m < 9) {
        upper[ly][lx] = OBSTACLE_FRAMES[r % OBSTACLE_FRAMES.length];
        collisions[ly][lx] = true;
      } else if (m < 23) {
        upper[ly][lx] = DECOR_FRAMES[(r >> 5) % DECOR_FRAMES.length];
      }
    }
  }

  return { cx, cy, ground, upper, collisions };
};
