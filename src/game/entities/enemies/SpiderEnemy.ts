import Phaser from 'phaser';

import { ASSET_KEYS, SCENE_DEPTHS } from '@/game/constants';
import { EnemyBase } from '@/game/entities/EnemyBase';
import type { WorldCamera } from '@/game/runtime/WorldCamera';

const MAX_HEALTH = 2;
const MOVE_INTERVAL = 500;
const ATTACK_INTERVAL = 1000;
const DETECTION_RANGE = 8;
const WEB_EVERY_N_MOVES = 4;

interface WebTile {
  wx: number;
  wy: number;
  sprite: Phaser.GameObjects.Image;
}

export class SpiderEnemy extends EnemyBase {
  protected override hurtTexture = undefined;

  private moveTimer: number;
  private attackTimer: number;
  private moveCount = 0;
  private readonly webSprites: WebTile[] = [];

  public constructor(scene: Phaser.Scene, worldX: number, worldY: number) {
    const sprite = scene.add
      .image(0, 0, ASSET_KEYS.spider)
      .setOrigin(0.5)
      .setDepth(SCENE_DEPTHS.player);

    super(scene, worldX, worldY, MAX_HEALTH, sprite);

    this.moveTimer = Phaser.Math.Between(0, MOVE_INTERVAL);
    this.attackTimer = Phaser.Math.Between(0, ATTACK_INTERVAL);
  }

  protected override get normalTexture(): string {
    return ASSET_KEYS.spider;
  }

  public override update(
    delta: number,
    playerWorldX: number,
    playerWorldY: number,
    isBlocked: (wx: number, wy: number) => boolean,
  ): boolean {
    if (!this.isAlive) return false;

    // Check if player is on any web tile
    for (let i = this.webSprites.length - 1; i >= 0; i--) {
      const web = this.webSprites[i];
      if (playerWorldX === web.wx && playerWorldY === web.wy) {
        web.sprite.destroy();
        this.webSprites.splice(i, 1);
        return true;
      }
    }

    const dx = playerWorldX - this.worldX;
    const dy = playerWorldY - this.worldY;
    const dist = Math.abs(dx) + Math.abs(dy);

    this.moveTimer += delta;
    if (this.moveTimer >= MOVE_INTERVAL) {
      this.moveTimer = 0;

      const prevX = this.worldX;
      const prevY = this.worldY;

      if (dist > 1 && dist <= DETECTION_RANGE) {
        this.moveToward(playerWorldX, playerWorldY, isBlocked);
      } else if (dist > DETECTION_RANGE) {
        this.wander(isBlocked);
      }

      const moved = this.worldX !== prevX || this.worldY !== prevY;
      if (moved) {
        this.moveCount += 1;
        if (this.moveCount % WEB_EVERY_N_MOVES === 0) {
          // Leave web at the previous tile
          const webSprite = this.scene.add
            .image(0, 0, ASSET_KEYS.webSpider)
            .setOrigin(0.5)
            .setDepth(SCENE_DEPTHS.decorBelowPlayer)
            .setAlpha(0.65);
          this.webSprites.push({ wx: prevX, wy: prevY, sprite: webSprite });
        }
      }
    }

    this.attackTimer += delta;
    if (this.attackTimer >= ATTACK_INTERVAL) {
      this.attackTimer = 0;
      if (dist === 1) {
        return true;
      }
    }

    return false;
  }

  public override render(tileSize: number, camera: WorldCamera): void {
    super.render(tileSize, camera);
    for (const web of this.webSprites) {
      const screen = camera.tileToScreen(web.wx, web.wy, tileSize);
      // web_spider.png is 32x48; scale it to cover one tile
      web.sprite.setPosition(screen.x, screen.y).setDisplaySize(tileSize, tileSize);
    }
  }

  public override destroy(): void {
    for (const web of this.webSprites) {
      web.sprite.destroy();
    }
    this.webSprites.length = 0;
    super.destroy();
  }
}
