import Phaser from 'phaser';

import { CHUNK_COLUMNS, CHUNK_ROWS, SCENE_DEPTHS } from '@/game/constants';
import type { ChunkManager } from '@/game/world/ChunkManager';

const BG_COLOR = 0x000000;
const EMPTY_COLOR = 0x111a11;
const VISITED_COLOR = 0x3a7a3a;
const PLAYER_COLOR = 0x80ff20;

// Player-centered local radar: a small grid of nearby chunks scrolling under the player.
const RADAR_RADIUS = 2; // 5x5 chunks

export class MinimapRenderer {
  private readonly graphics: Phaser.GameObjects.Graphics;
  private bounds = { x: 0, y: 0, width: 0, height: 0 };
  private lastChunkX = NaN;
  private lastChunkY = NaN;
  private readonly visited = new Set<string>();

  public constructor(scene: Phaser.Scene) {
    this.graphics = scene.add.graphics().setDepth(SCENE_DEPTHS.uiOverlay);
  }

  public layout(bounds: { x: number; y: number; width: number; height: number }): void {
    this.bounds = { ...bounds };
    this.lastChunkX = NaN;
  }

  public update(playerWorldX: number, playerWorldY: number, _chunkManager: ChunkManager): void {
    const chunkX = Math.floor(playerWorldX / CHUNK_COLUMNS);
    const chunkY = Math.floor(playerWorldY / CHUNK_ROWS);
    this.visited.add(`${chunkX},${chunkY}`);
    if (chunkX === this.lastChunkX && chunkY === this.lastChunkY) return;
    this.lastChunkX = chunkX;
    this.lastChunkY = chunkY;

    const { x, y, width, height } = this.bounds;
    if (!width || !height) return;

    const span = RADAR_RADIUS * 2 + 1;
    const gap = 1;
    const cellW = Math.floor(width / span);
    const cellH = Math.floor(height / span);

    this.graphics.clear();
    this.graphics.fillStyle(BG_COLOR, 0.7);
    this.graphics.fillRect(x - 2, y - 2, width + 4, height + 4);

    for (let row = 0; row < span; row++) {
      for (let col = 0; col < span; col++) {
        const cx = chunkX + (col - RADAR_RADIUS);
        const cy = chunkY + (row - RADAR_RADIUS);
        const isPlayer = cx === chunkX && cy === chunkY;
        const seen = this.visited.has(`${cx},${cy}`);

        const bx = Math.round(x + col * cellW);
        const by = Math.round(y + row * cellH);

        this.graphics.fillStyle(isPlayer ? PLAYER_COLOR : seen ? VISITED_COLOR : EMPTY_COLOR, 1);
        this.graphics.fillRect(bx, by, cellW - gap, cellH - gap);
      }
    }
  }
}
