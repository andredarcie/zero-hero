import { CHUNK_SIZE } from '@/game/constants';
import type { ChunkData } from './Chunk';
import { generateChunk } from './WorldGenerator';

export class ChunkManager {
  private readonly cache = new Map<string, ChunkData>();

  public constructor(private readonly seed: number) {}

  private key(cx: number, cy: number): string {
    return `${cx},${cy}`;
  }

  public getChunk(cx: number, cy: number): ChunkData {
    const key = this.key(cx, cy);
    let chunk = this.cache.get(key);
    if (!chunk) {
      chunk = generateChunk(cx, cy, this.seed);
      this.cache.set(key, chunk);
    }
    return chunk;
  }

  public getTile(worldX: number, worldY: number): { ground: number; upper: number | null; collision: boolean } {
    const cx = Math.floor(worldX / CHUNK_SIZE);
    const cy = Math.floor(worldY / CHUNK_SIZE);
    const lx = ((worldX % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const ly = ((worldY % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const chunk = this.getChunk(cx, cy);
    return {
      ground: chunk.ground[ly][lx],
      upper: chunk.upper[ly][lx],
      collision: chunk.collisions[ly][lx],
    };
  }

  public hasChunk(cx: number, cy: number): boolean {
    return this.cache.has(this.key(cx, cy));
  }

  public isCellBlocked(worldX: number, worldY: number): boolean {
    return this.getTile(worldX, worldY).collision;
  }
}
