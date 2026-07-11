import Phaser from 'phaser';

import { ASSET_KEYS, SCENE_DEPTHS, SOLID_UPPER_FRAMES, ySortDepth } from '@/game/constants';
import type { ChunkManager } from '@/game/world/ChunkManager';
import { projectCastShadow, type FireLightCtx } from './CastShadow';
import type { WorldCamera } from './WorldCamera';

const LOW_GRASS_TILE = 0;
// How far obstacle tops (trees/walls) lift off the ground for the 2.5D "standing up" look.
const TREE_LIFT_FACTOR = 0.16;

type TileEntry = {
  ground: Phaser.GameObjects.Sprite;
  upper: Phaser.GameObjects.Sprite | null;
  shadow: Phaser.GameObjects.Ellipse | null;
  // Dynamic firelight cast shadow — a black silhouette of the obstacle laid away from the flame,
  // only for obstacle tiles (trees/walls). Null for flat decor and open ground.
  castShadow: Phaser.GameObjects.Sprite | null;
  isObstacle: boolean;
};

// Streams the visible world tiles (ground + upper decor/obstacles + their ground shadows) as the
// camera moves. The HUD was removed entirely, so this is now purely the tile board.
export class GameBoardRenderer {
  private readonly tileSprites = new Map<string, TileEntry>();
  private readonly grassSprites = new Map<string, Phaser.GameObjects.Sprite>();

  public constructor(private readonly scene: Phaser.Scene) {}

  public updateWorld(
    camera: WorldCamera,
    chunkManager: ChunkManager,
    tileSize: number,
    shadowCtx?: FireLightCtx,
  ): void {
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

        // Firelight cast shadow: an obstacle standing in a flame's glow throws a silhouette away
        // from it, anchored at the tile's ground point. Hidden when no lit flame is near.
        if (entry.castShadow && entry.upper) {
          if (shadowCtx) {
            projectCastShadow(
              entry.castShadow,
              entry.upper,
              screenX,
              screenY + Math.round(tileSize * 0.3),
              shadowCtx,
              tx,
              ty,
            );
          } else {
            entry.castShadow.setVisible(false);
          }
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
        entry.castShadow?.destroy();
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

    // "Obstacle" mirrors ChunkManager.isCellBlocked: a tile with painted collision OR a tree that
    // is solid by default (SOLID_UPPER_FRAMES). Both lift, Y-sort and cast a firelight shadow —
    // otherwise the many solid-by-default trees near a fire would stand there shadowless.
    const isObstacle = tile.upper !== null && (tile.collision || SOLID_UPPER_FRAMES.has(tile.upper));

    let upper: Phaser.GameObjects.Sprite | null = null;
    if (tile.upper !== null) {
      // Obstacles join the Y-sort band (above the cast-shadow depth) so the hero can pass in front
      // of / behind them AND their own shadow stays under them; flat decor stays below the player.
      // Must key off isObstacle, not tile.collision — else a solid-by-default tree lands at
      // decorBelowPlayer (below castShadow) and its shadow draws over its own trunk.
      const depth = isObstacle ? ySortDepth(worldY) : SCENE_DEPTHS.decorBelowPlayer;
      upper = this.scene.add
        .sprite(0, 0, ASSET_KEYS.forestTileset, tile.upper)
        .setOrigin(0.5)
        .setDisplaySize(tileSize, tileSize)
        .setDepth(depth);

      if (tile.upper === LOW_GRASS_TILE) {
        this.grassSprites.set(`${worldX},${worldY}`, upper);
      }
    }

    // Ground shadow that anchors lifted obstacles so they read as standing up (ambient, always on).
    const shadow = isObstacle
      ? this.scene.add
        .ellipse(0, 0, tileSize, tileSize, 0x000000, 0.26)
        .setDepth(SCENE_DEPTHS.ground + 1)
      : null;

    // Dynamic firelight cast shadow — a black silhouette of this obstacle's own art, reconfigured
    // each frame by updateWorld. Starts hidden; only shows when a lit flame reaches the tile.
    const castShadow = isObstacle && tile.upper !== null
      ? this.scene.add
        .sprite(0, 0, ASSET_KEYS.forestTileset, tile.upper)
        .setTintFill(0x000000)
        .setVisible(false)
        .setDepth(SCENE_DEPTHS.castShadow)
      : null;

    return { ground, upper, shadow, castShadow, isObstacle };
  }
}
