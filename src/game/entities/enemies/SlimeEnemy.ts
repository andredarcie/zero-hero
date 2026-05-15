import Phaser from 'phaser';

import { ASSET_KEYS, SCENE_DEPTHS } from '@/game/constants';
import { EnemyBase } from '@/game/entities/EnemyBase';

const MAX_HEALTH = 3;
const MOVE_INTERVAL = 1300;
const ATTACK_INTERVAL = 1500;
const DETECTION_RANGE = 5;

export class SlimeEnemy extends EnemyBase {
  // No hurt texture for slime (sprite is a spritesheet, handled differently)
  protected override hurtTexture = undefined;

  private moveTimer: number;
  private attackTimer: number;
  private currentFrame = 0;
  private poolSprite: Phaser.GameObjects.Image | null = null;

  public constructor(scene: Phaser.Scene, worldX: number, worldY: number) {
    const sprite = scene.add
      .sprite(0, 0, ASSET_KEYS.slime, 0)
      .setOrigin(0.5)
      .setDepth(SCENE_DEPTHS.player);

    super(scene, worldX, worldY, MAX_HEALTH, sprite);

    this.moveTimer = Phaser.Math.Between(0, MOVE_INTERVAL);
    this.attackTimer = Phaser.Math.Between(0, ATTACK_INTERVAL);
  }

  protected override get normalTexture(): string {
    return ASSET_KEYS.slime;
  }

  protected override get spriteScale(): number {
    return 0.85;
  }

  public override update(
    delta: number,
    playerWorldX: number,
    playerWorldY: number,
    isBlocked: (wx: number, wy: number) => boolean,
  ): boolean {
    if (!this.isAlive) return false;

    const dx = playerWorldX - this.worldX;
    const dy = playerWorldY - this.worldY;
    const dist = Math.abs(dx) + Math.abs(dy);

    this.moveTimer += delta;
    if (this.moveTimer >= MOVE_INTERVAL) {
      this.moveTimer = 0;
      const moved = this.tryMove(playerWorldX, playerWorldY, dist, isBlocked);
      if (moved) {
        // Hop: toggle frame
        this.currentFrame = this.currentFrame === 0 ? 1 : 0;
        (this.sprite as Phaser.GameObjects.Sprite).setFrame(this.currentFrame);
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

  public override destroy(): void {
    if (this.poolSprite) {
      this.poolSprite.destroy();
      this.poolSprite = null;
    }
    super.destroy();
  }

  protected override onDeath(): void {
    this.poolSprite = this.scene.add
      .image(0, 0, ASSET_KEYS.slimePool)
      .setOrigin(0.5)
      .setDepth(SCENE_DEPTHS.decorBelowPlayer)
      .setAlpha(0.7);
    // Position is set in next render call; set approximate position now
    this.poolSprite.setVisible(true);
  }

  public override render(tileSize: number, camera: import('@/game/runtime/WorldCamera').WorldCamera): void {
    super.render(tileSize, camera);
    if (this.poolSprite) {
      const screen = camera.tileToScreen(this.worldX, this.worldY, tileSize);
      this.poolSprite.setPosition(screen.x, screen.y).setDisplaySize(tileSize, tileSize);
    }
  }

  private tryMove(
    playerWorldX: number,
    playerWorldY: number,
    dist: number,
    isBlocked: (wx: number, wy: number) => boolean,
  ): boolean {
    const prevX = this.worldX;
    const prevY = this.worldY;

    if (dist > 1 && dist <= DETECTION_RANGE) {
      this.moveToward(playerWorldX, playerWorldY, isBlocked);
    } else if (dist > DETECTION_RANGE) {
      this.wander(isBlocked);
    }

    return this.worldX !== prevX || this.worldY !== prevY;
  }
}
