import { CHUNK_COLUMNS, CHUNK_ROWS } from '@/game/constants';
import type { ChunkData } from './Chunk';
import { generateChunk } from './WorldGenerator';

export class ChunkManager {
  // Lazily generated + cached. The world is infinite; chunks materialize as the player roams.
  private readonly cache = new Map<string, ChunkData>();

  private key(cx: number, cy: number): string {
    return `${cx},${cy}`;
  }

  public getChunk(cx: number, cy: number): ChunkData {
    const key = this.key(cx, cy);
    let chunk = this.cache.get(key);
    if (!chunk) {
      chunk = generateChunk(cx, cy);
      this.cache.set(key, chunk);
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

  // Every coordinate exists in the open world.
  public hasChunkCoordinate(_cx: number, _cy: number): boolean {
    return true;
  }

  public hasChunk(cx: number, cy: number): boolean {
    return this.hasChunkCoordinate(cx, cy);
  }

  public isCellBlocked(worldX: number, worldY: number): boolean {
    return this.getTile(worldX, worldY).collision;
  }
}
