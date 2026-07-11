import Phaser from 'phaser';

import { ASSET_KEYS, SCENE_DEPTHS, ySortDepth } from '@/game/constants';
import type { ChunkManager } from '@/game/world/ChunkManager';
import type { WorldCamera } from './WorldCamera';

const LOW_GRASS_TILE = 0;
// How far obstacle tops (trees/walls) lift off the ground for the 2.5D "standing up" look.
const TREE_LIFT_FACTOR = 0.16;

type TileEntry = {
  ground: Phaser.GameObjects.Sprite;
  upper: Phaser.GameObjects.Sprite | null;
  shadow: Phaser.GameObjects.Ellipse | null;
  isObstacle: boolean;
};

// Streams the visible world tiles (ground + upper decor/obstacles + their ground shadows) as the
// camera moves. The HUD was removed entirely, so this is now purely the tile board.
export class GameBoardRenderer {
  private readonly tileSprites = new Map<string, TileEntry>();
  private readonly grassSprites = new Map<string, Phaser.GameObjects.Sprite>();

  public constructor(private readonly scene: Phaser.Scene) {}

  public updateWorld(camera: WorldCamera, chunkManager: ChunkManager, tileSize: number): void {
    const range = camera.getVisibleRange(tileSize);
    const nextKeys = new Set<string>();

    for (let ty = range.minY; ty <= range.maxY; ty++) {
      for (let tx = range.minX; tx <= range.maxX; tx++) {
        const key = `${tx},${ty}`;
        nextKeys.add(key);
        const screen = camera.tileToScreen(tx, ty, tileSize);
        const screenX = screen.x;
        const screenY = screen.y;

        let entry = this.tileSprites.get(key);
        if (!entry) {
          entry = this.createTileEntry(tx, ty, tileSize, chunkManager);
          this.tileSprites.set(key, entry);
        }

        entry.ground
          .setPosition(screenX, screenY)
          .setDisplaySize(tileSize, tileSize);

        if (entry.upper) {
          // Obstacles lift up off the ground; flat decor (grass) stays put.
          const lift = entry.isObstacle ? Math.round(tileSize * TREE_LIFT_FACTOR) : 0;
          entry.upper
            .setPosition(screenX, screenY - lift)
            .setDisplaySize(tileSize, tileSize);
        }

        if (entry.shadow) {
          entry.shadow
            .setPosition(screenX, screenY + Math.round(tileSize * 0.30))
            .setDisplaySize(tileSize * 0.72, tileSize * 0.30);
        }
      }
    }

    for (const [key, entry] of this.tileSprites) {
      if (!nextKeys.has(key)) {
        entry.ground.destroy();
        if (entry.upper) {
          entry.upper.destroy();
          this.grassSprites.delete(key);
        }
        entry.shadow?.destroy();
        this.tileSprites.delete(key);
      }
    }
  }

  public getGrassSprite(worldX: number, worldY: number): Phaser.GameObjects.Sprite | undefined {
    return this.grassSprites.get(`${worldX},${worldY}`);
  }

  private createTileEntry(
    worldX: number,
    worldY: number,
    tileSize: number,
    chunkManager: ChunkManager,
  ): TileEntry {
    const tile = chunkManager.getTile(worldX, worldY);

    const ground = this.scene.add
      .sprite(0, 0, ASSET_KEYS.forestTileset, tile.ground)
      .setOrigin(0.5)
      .setDisplaySize(tileSize, tileSize)
      .setDepth(SCENE_DEPTHS.ground);

    const isObstacle = tile.upper !== null && tile.collision;

    let upper: Phaser.GameObjects.Sprite | null = null;
    if (tile.upper !== null) {
      // Obstacles join the Y-sort band so the hero can pass in front of / behind them;
      // flat decor stays below the player.
      const depth = tile.collision ? ySortDepth(worldY) : SCENE_DEPTHS.decorBelowPlayer;
      upper = this.scene.add
        .sprite(0, 0, ASSET_KEYS.forestTileset, tile.upper)
        .setOrigin(0.5)
        .setDisplaySize(tileSize, tileSize)
        .setDepth(depth);

      if (tile.upper === LOW_GRASS_TILE) {
        this.grassSprites.set(`${worldX},${worldY}`, upper);
      }
    }

    // Ground shadow that anchors lifted obstacles so they read as standing up.
    const shadow = isObstacle
      ? this.scene.add
        .ellipse(0, 0, tileSize, tileSize, 0x000000, 0.26)
        .setDepth(SCENE_DEPTHS.ground + 1)
      : null;

    return { ground, upper, shadow, isObstacle };
  }
}
