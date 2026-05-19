import Phaser from 'phaser';

import { CHUNK_COLUMNS, CHUNK_ROWS, SCENE_DEPTHS } from '@/game/constants';
import type { ChunkManager } from '@/game/world/ChunkManager';
import {
  WORLD_CHUNK_COLUMNS,
  WORLD_CHUNK_ROWS,
  WORLD_MIN_CHUNK_X,
  WORLD_MIN_CHUNK_Y,
} from '@/game/world/WorldGenerator';

const BG_COLOR = 0x000000;
const EMPTY_COLOR = 0x111a11;
const VISITED_COLOR = 0x3a7a3a;
const PLAYER_COLOR = 0x80ff20;

export class MinimapRenderer {
  private readonly graphics: Phaser.GameObjects.Graphics;
  private bounds = { x: 0, y: 0, width: 0, height: 0 };
  private lastChunkX = NaN;
  private lastChunkY = NaN;

  public constructor(scene: Phaser.Scene) {
    this.graphics = scene.add.graphics().setDepth(SCENE_DEPTHS.uiOverlay);
  }

  public layout(bounds: { x: number; y: number; width: number; height: number }): void {
    this.bounds = { ...bounds };
    this.lastChunkX = NaN;
  }

  public update(playerWorldX: number, playerWorldY: number, chunkManager: ChunkManager): void {
    const chunkX = Math.floor(playerWorldX / CHUNK_COLUMNS);
    const chunkY = Math.floor(playerWorldY / CHUNK_ROWS);
    if (chunkX === this.lastChunkX && chunkY === this.lastChunkY) return;
    this.lastChunkX = chunkX;
    this.lastChunkY = chunkY;

    const { x, y, width, height } = this.bounds;
    if (!width || !height) return;

    const gap = 1;
    const cellW = Math.floor(width / WORLD_CHUNK_COLUMNS);
    const cellH = Math.floor(height / WORLD_CHUNK_ROWS);

    this.graphics.clear();

    this.graphics.fillStyle(BG_COLOR, 0.7);
    this.graphics.fillRect(x - 2, y - 2, width + 4, height + 4);

    for (let row = 0; row < WORLD_CHUNK_ROWS; row++) {
      for (let col = 0; col < WORLD_CHUNK_COLUMNS; col++) {
        const cx = WORLD_MIN_CHUNK_X + col;
        const cy = WORLD_MIN_CHUNK_Y + row;
        const visited = chunkManager.hasChunkCoordinate(cx, cy);
        const isPlayer = cx === chunkX && cy === chunkY;

        const bx = Math.round(x + col * cellW);
        const by = Math.round(y + row * cellH);
        const bw = cellW - gap;
        const bh = cellH - gap;

        this.graphics.fillStyle(isPlayer ? PLAYER_COLOR : visited ? VISITED_COLOR : EMPTY_COLOR, 1);
        this.graphics.fillRect(bx, by, bw, bh);
      }
    }
  }
}
