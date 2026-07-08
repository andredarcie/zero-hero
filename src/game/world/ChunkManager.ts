import { CHUNK_COLUMNS, CHUNK_ROWS, SOLID_UPPER_FRAMES } from '@/game/constants';
import type { ChunkData } from './Chunk';
import { getChunkTerrain, isInsideWorld } from './WorldData';

export class ChunkManager {
  // Chunks come from the authored world.json (via WorldData); out-of-bounds coordinates
  // resolve to solid void so the finite world has hard edges. Cached because getTile is
  // called per-visible-tile every frame.
  private readonly cache = new Map<string, ChunkData>();

  private key(cx: number, cy: number): string {
    return `${cx},${cy}`;
  }

  public getChunk(cx: number, cy: number): ChunkData {
    const key = this.key(cx, cy);
    let chunk = this.cache.get(key);
    if (!chunk) {
      chunk = getChunkTerrain(cx, cy);
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

  // The world is finite now: a coordinate "exists" only inside the authored bounds.
  public hasChunkCoordinate(cx: number, cy: number): boolean {
    return isInsideWorld(cx, cy);
  }

  public hasChunk(cx: number, cy: number): boolean {
    return this.hasChunkCoordinate(cx, cy);
  }

  public isCellBlocked(worldX: number, worldY: number): boolean {
    const tile = this.getTile(worldX, worldY);
    // Trees block by default: an upper tree tile is solid even where no collision was painted.
    return tile.collision || (tile.upper !== null && SOLID_UPPER_FRAMES.has(tile.upper));
  }
}
