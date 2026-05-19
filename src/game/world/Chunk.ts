import { CHUNK_COLUMNS, CHUNK_ROWS } from '@/game/constants';

export type ChunkData = {
  cx: number;
  cy: number;
  ground: number[][];
  upper: (number | null)[][];
  collisions: boolean[][];
};

export { CHUNK_COLUMNS, CHUNK_ROWS };
