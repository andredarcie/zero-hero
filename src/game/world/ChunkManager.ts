import { CHUNK_COLUMNS, CHUNK_ROWS } from '@/game/constants';
import type { ChunkData } from './Chunk';
import {
  WORLD_MAX_CHUNK_X,
  WORLD_MAX_CHUNK_Y,
  WORLD_MIN_CHUNK_X,
  WORLD_MIN_CHUNK_Y,
  generateChunk,
  isInsideStaticWorld,
} from './WorldGenerator';

export class ChunkManager {
  private readonly cache = new Map<string, ChunkData>();

  public constructor() {
    for (let cy = WORLD_MIN_CHUNK_Y; cy <= WORLD_MAX_CHUNK_Y; cy++) {
      for (let cx = WORLD_MIN_CHUNK_X; cx <= WORLD_MAX_CHUNK_X; cx++) {
        const chunk = generateChunk(cx, cy);
        this.cache.set(this.key(cx, cy), chunk);
      }
    }
  }

  private key(cx: number, cy: number): string {
    return `${cx},${cy}`;
  }

  public getChunk(cx: number, cy: number): ChunkData {
    if (!isInsideStaticWorld(cx, cy)) {
      return generateChunk(cx, cy);
    }

    const key = this.key(cx, cy);
    const chunk = this.cache.get(key);
    if (!chunk) {
      throw new Error(`Chunk ausente no mapa fixo: ${key}`);
    }
    return chunk;
  }

  public getTile(worldX: number, worldY: number): { ground: number; upper: number | null; collision: boolean } {
    const cx = Math.floor(worldX / CHUNK_COLUMNS);
    const cy = Math.floor(worldY / CHUNK_ROWS);
    const lx = ((worldX % CHUNK_COLUMNS) + CHUNK_COLUMNS) % CHUNK_COLUMNS;
    const ly = ((worldY % CHUNK_ROWS) + CHUNK_ROWS) % CHUNK_ROWS;
    const chunk = this.getChunk(cx, cy);
    return {
      ground: chunk.ground[ly][lx],
      upper: chunk.upper[ly][lx],
      collision: chunk.collisions[ly][lx],
    };
  }

  public hasChunkCoordinate(cx: number, cy: number): boolean {
    return isInsideStaticWorld(cx, cy);
  }

  public hasChunk(cx: number, cy: number): boolean {
    return this.hasChunkCoordinate(cx, cy);
  }

  public isCellBlocked(worldX: number, worldY: number): boolean {
    const cx = Math.floor(worldX / CHUNK_COLUMNS);
    const cy = Math.floor(worldY / CHUNK_ROWS);
    if (!this.hasChunkCoordinate(cx, cy)) {
      return true;
    }
    return this.getTile(worldX, worldY).collision;
  }
}
