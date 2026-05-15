import Phaser from 'phaser';

import { ASSET_KEYS, SCENE_DEPTHS } from '@/game/constants';
import { EnemyBase } from '@/game/entities/EnemyBase';
import type { WorldCamera } from '@/game/runtime/WorldCamera';

const MAX_HEALTH = 4;
const MOVE_INTERVAL = 1400;
const DETECTION_RANGE = 7;
const SAFE_DISTANCE = 3;
const SHOOT_RANGE = 6;
const PROJECTILE_INTERVAL = 250; // ms per tile
const PROJECTILE_MAX_TILES = 8;

interface Projectile {
  sprite: Phaser.GameObjects.Image;
  wx: number;
  wy: number;
  dx: number;
  dy: number;
  tilesLeft: number;
  timer: number;
}

export class MageEnemy extends EnemyBase {
  protected override hurtTexture = ASSET_KEYS.mageHurt;

  private moveTimer: number;
  private readonly projectiles: Projectile[] = [];
  private lastIsBlocked: ((wx: number, wy: number) => boolean) | null = null;

  public constructor(scene: Phaser.Scene, worldX: number, worldY: number) {
    const sprite = scene.add
      .image(0, 0, ASSET_KEYS.mage)
      .setOrigin(0.5)
      .setDepth(SCENE_DEPTHS.player);

    super(scene, worldX, worldY, MAX_HEALTH, sprite);

    this.moveTimer = Phaser.Math.Between(0, MOVE_INTERVAL);
  }

  protected override get normalTexture(): string {
    return ASSET_KEYS.mage;
  }

  public override update(
    delta: number,
    playerWorldX: number,
    playerWorldY: number,
    isBlocked: (wx: number, wy: number) => boolean,
  ): boolean {
    if (!this.isAlive) return false;

    this.lastIsBlocked = isBlocked;

    const dx = playerWorldX - this.worldX;
    const dy = playerWorldY - this.worldY;
    const dist = Math.abs(dx) + Math.abs(dy);

    this.moveTimer += delta;
    if (this.moveTimer >= MOVE_INTERVAL) {
      this.moveTimer = 0;

      if (dist < SAFE_DISTANCE) {
        // Move away from player
        this.moveAway(playerWorldX, playerWorldY, isBlocked);
      } else if (dist <= DETECTION_RANGE) {
        // Check if in line of sight (same row or column) and in shoot range — shoot instead of move
        const inLine = playerWorldX === this.worldX || playerWorldY === this.worldY;
        const inShootRange = dist <= SHOOT_RANGE;

        if (inLine && inShootRange) {
          this.shootAt(playerWorldX, playerWorldY);
        } else {
          this.moveToward(playerWorldX, playerWorldY, isBlocked);
        }
      } else {
        this.wander(isBlocked);
      }
    }

    // Update projectiles
    return this.updateProjectiles(delta, playerWorldX, playerWorldY);
  }

  public override render(tileSize: number, camera: WorldCamera): void {
    super.render(tileSize, camera);

    // Render projectiles
    for (const proj of this.projectiles) {
      const screen = camera.tileToScreen(proj.wx, proj.wy, tileSize);
      proj.sprite.setPosition(screen.x, screen.y).setDisplaySize(tileSize * 0.5, tileSize * 0.5);
    }
  }

  public override destroy(): void {
    for (const proj of this.projectiles) {
      proj.sprite.destroy();
    }
    this.projectiles.length = 0;
    super.destroy();
  }

  private shootAt(playerWorldX: number, playerWorldY: number): void {
    const dx = playerWorldX - this.worldX;
    const dy = playerWorldY - this.worldY;
    const stepX = dx === 0 ? 0 : Math.sign(dx);
    const stepY = dy === 0 ? 0 : Math.sign(dy);

    const projSprite = this.scene.add
      .image(0, 0, ASSET_KEYS.magicBall)
      .setOrigin(0.5)
      .setDepth(SCENE_DEPTHS.player + 1);

    this.projectiles.push({
      sprite: projSprite,
      wx: this.worldX + stepX,
      wy: this.worldY + stepY,
      dx: stepX,
      dy: stepY,
      tilesLeft: PROJECTILE_MAX_TILES - 1,
      timer: 0,
    });
  }

  private updateProjectiles(
    delta: number,
    playerWorldX: number,
    playerWorldY: number,
  ): boolean {
    let hitPlayer = false;

    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const proj = this.projectiles[i];
      proj.timer += delta;

      if (proj.timer < PROJECTILE_INTERVAL) continue;
      proj.timer -= PROJECTILE_INTERVAL;

      // Check current position for player hit
      if (proj.wx === playerWorldX && proj.wy === playerWorldY) {
        hitPlayer = true;
        proj.sprite.destroy();
        this.projectiles.splice(i, 1);
        continue;
      }

      // Move to next tile
      const nextX = proj.wx + proj.dx;
      const nextY = proj.wy + proj.dy;
      proj.tilesLeft -= 1;

      const blocked = this.lastIsBlocked && this.lastIsBlocked(nextX, nextY);
      if (proj.tilesLeft <= 0 || blocked) {
        proj.sprite.destroy();
        this.projectiles.splice(i, 1);
        continue;
      }

      // Check if next position is player
      if (nextX === playerWorldX && nextY === playerWorldY) {
        hitPlayer = true;
        proj.sprite.destroy();
        this.projectiles.splice(i, 1);
        continue;
      }

      proj.wx = nextX;
      proj.wy = nextY;
    }

    return hitPlayer;
  }
}
