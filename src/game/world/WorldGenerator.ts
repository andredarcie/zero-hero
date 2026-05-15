import { CHUNK_SIZE } from '@/game/constants';
import type { ChunkData } from './Chunk';

const GROUND_TILE = 5;
const DECOR_FRAMES = [0, 6, 7, 8, 11] as const;
const COLLISION_FRAMES = [4, 10, 15, 16, 17] as const;

const hash = (a: number, b: number, c: number, d: number): number => {
  let v = (((a * 73856093) ^ (b * 19349663) ^ (c * 83492791) ^ (d * 48397741)) >>> 0);
  v = (((v >> 16) ^ v) * 0x45d9f3b) >>> 0;
  v = (((v >> 16) ^ v) * 0x45d9f3b) >>> 0;
  return ((v >> 16) ^ v) >>> 0;
};

export const generateChunk = (cx: number, cy: number, seed: number): ChunkData => {
  const ground: number[][] = [];
  const upper: (number | null)[][] = [];
  const collisions: boolean[][] = [];

  for (let ly = 0; ly < CHUNK_SIZE; ly++) {
    ground[ly] = [];
    upper[ly] = [];
    collisions[ly] = [];

    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      ground[ly][lx] = GROUND_TILE;

      const worldX = cx * CHUNK_SIZE + lx;
      const worldY = cy * CHUNK_SIZE + ly;
      const spawnDist = Math.max(Math.abs(worldX), Math.abs(worldY));

      const roll = spawnDist <= 2 ? 100 : hash(cx ^ seed, cy ^ seed, lx, ly) % 100;

      if (roll < 5) {
        upper[ly][lx] = COLLISION_FRAMES[hash((cx + 1) ^ seed, (cy + 1) ^ seed, lx, ly) % COLLISION_FRAMES.length];
        collisions[ly][lx] = true;
      } else if (roll < 30) {
        upper[ly][lx] = DECOR_FRAMES[hash((cx + 2) ^ seed, (cy + 2) ^ seed, lx, ly) % DECOR_FRAMES.length];
        collisions[ly][lx] = false;
      } else {
        upper[ly][lx] = null;
        collisions[ly][lx] = false;
      }
    }
  }

  return { cx, cy, ground, upper, collisions };
};
