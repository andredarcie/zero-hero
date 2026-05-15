import type Phaser from 'phaser';

import { CHUNK_SIZE, SCENE_DEPTHS } from '@/game/constants';
import type { EnemyManager } from '@/game/entities/EnemyManager';
import type { ChunkManager } from '@/game/world/ChunkManager';
import type { WorldCamera } from './WorldCamera';

const TILES_W = 120;
const TILES_H = 90;
const PX = 1;
const W = TILES_W * PX;
const H = TILES_H * PX;
const MARGIN = 8;

const COLOR_GROUND = 0x4a7c59;
const COLOR_DECOR = 0x3a6349;
const COLOR_OBSTACLE = 0x152b1e;
const COLOR_PLAYER = 0xffffff;

export class MinimapRenderer {
  private readonly bg: Phaser.GameObjects.Rectangle;
  private readonly graphics: Phaser.GameObjects.Graphics;
  private originX = 0;
  private originY = 0;
  private lastTileX = NaN;
  private lastTileY = NaN;

  public constructor(private readonly scene: Phaser.Scene) {
    this.bg = scene.add.rectangle(0, 0, W + 6, H + 6, 0x000000, 0.65)
      .setOrigin(0)
      .setDepth(SCENE_DEPTHS.ui);
    this.graphics = scene.add.graphics()
      .setDepth(SCENE_DEPTHS.uiOverlay);
  }

  public layout(canvasW: number, canvasH: number): void {
    this.originX = canvasW - MARGIN - W;
    this.originY = canvasH - MARGIN - H;
    this.bg.setPosition(this.originX - 3, this.originY - 3);
    this.lastTileX = NaN;
  }

  public update(camera: WorldCamera, chunkManager: ChunkManager, enemyManager?: EnemyManager): void {
    const tileX = Math.round(camera.worldX);
    const tileY = Math.round(camera.worldY);
    if (tileX === this.lastTileX && tileY === this.lastTileY) {
      return;
    }
    this.lastTileX = tileX;
    this.lastTileY = tileY;

    this.graphics.clear();

    const halfW = TILES_W / 2;
    const halfH = TILES_H / 2;
    const ground: Array<[number, number]> = [];
    const decor: Array<[number, number]> = [];
    const obstacles: Array<[number, number]> = [];

    for (let dy = 0; dy < TILES_H; dy++) {
      for (let dx = 0; dx < TILES_W; dx++) {
        const wx = tileX - halfW + dx;
        const wy = tileY - halfH + dy;
        const cx = Math.floor(wx / CHUNK_SIZE);
        const cy = Math.floor(wy / CHUNK_SIZE);

        if (!chunkManager.hasChunk(cx, cy)) {
          continue;
        }

        const tile = chunkManager.getTile(wx, wy);

        if (tile.collision) {
          obstacles.push([dx, dy]);
        } else if (tile.upper !== null) {
          decor.push([dx, dy]);
        } else {
          ground.push([dx, dy]);
        }
      }
    }

    this.graphics.fillStyle(COLOR_GROUND, 1);
    for (const [dx, dy] of ground) {
      this.graphics.fillRect(this.originX + dx * PX, this.originY + dy * PX, PX, PX);
    }

    this.graphics.fillStyle(COLOR_DECOR, 1);
    for (const [dx, dy] of decor) {
      this.graphics.fillRect(this.originX + dx * PX, this.originY + dy * PX, PX, PX);
    }

    this.graphics.fillStyle(COLOR_OBSTACLE, 1);
    for (const [dx, dy] of obstacles) {
      this.graphics.fillRect(this.originX + dx * PX, this.originY + dy * PX, PX, PX);
    }

    if (enemyManager) {
      this.graphics.fillStyle(0xff2222, 1);
      for (const enemy of enemyManager.getAliveEnemies()) {
        const edx = enemy.worldX - (tileX - halfW);
        const edy = enemy.worldY - (tileY - halfH);
        if (edx >= 0 && edx < TILES_W && edy >= 0 && edy < TILES_H) {
          this.graphics.fillRect(this.originX + edx * PX, this.originY + edy * PX, PX, PX);
        }
      }
    }

    const px = this.originX + (halfW - 0.5) * PX;
    const py = this.originY + (halfH - 0.5) * PX;
    this.graphics.fillStyle(COLOR_PLAYER, 1);
    this.graphics.fillRect(Math.round(px), Math.round(py), PX, PX);
  }
}
