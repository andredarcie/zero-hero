import Phaser from 'phaser';

import { CHUNK_COLUMNS, CHUNK_ROWS, SCENE_DEPTHS } from '@/game/constants';
import type { ChunkManager } from '@/game/world/ChunkManager';
import {
  WORLD_CHUNK_COLUMNS,
  WORLD_CHUNK_ROWS,
  WORLD_MIN_CHUNK_X,
  WORLD_MIN_CHUNK_Y,
} from '@/game/world/WorldGenerator';

const BG_COLOR = 0x1f5f2f;
const GRID_COLOR = 0x0b1f0f;
const SCREEN_COLOR = 0x5fa35f;
const PLAYER_COLOR = 0x80d010;

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

    const cellW = width / WORLD_CHUNK_COLUMNS;
    const cellH = height / WORLD_CHUNK_ROWS;

    this.graphics.clear();
    this.graphics.fillStyle(BG_COLOR, 1);
    this.graphics.fillRect(x, y, width, height);

    for (let row = 0; row < WORLD_CHUNK_ROWS; row++) {
      for (let column = 0; column < WORLD_CHUNK_COLUMNS; column++) {
        const cx = WORLD_MIN_CHUNK_X + column;
        const cy = WORLD_MIN_CHUNK_Y + row;
        if (!chunkManager.hasChunkCoordinate(cx, cy)) continue;

        const cellX = x + column * cellW;
        const cellY = y + row * cellH;

        this.graphics.lineStyle(1, GRID_COLOR, 1);
        this.graphics.strokeRect(cellX, cellY, cellW, cellH);
        this.graphics.fillStyle(SCREEN_COLOR, 1);
        this.graphics.fillRect(cellX + 1, cellY + 1, Math.max(1, cellW - 2), Math.max(1, cellH - 2));

        if (cx === chunkX && cy === chunkY) {
          this.graphics.fillStyle(PLAYER_COLOR, 1);
          this.graphics.fillRect(cellX + Math.max(1, cellW * 0.25), cellY + Math.max(1, cellH * 0.25), Math.max(3, cellW * 0.5), Math.max(3, cellH * 0.5));
        }
      }
    }
  }
}
