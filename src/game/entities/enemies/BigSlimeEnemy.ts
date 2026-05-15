import Phaser from 'phaser';

import { ASSET_KEYS, SCENE_DEPTHS } from '@/game/constants';
import { EnemyBase } from '@/game/entities/EnemyBase';

const MAX_HEALTH = 6;
const MOVE_INTERVAL = 1700;
const ATTACK_INTERVAL = 1800;
const DETECTION_RANGE = 6;

export class BigSlimeEnemy extends EnemyBase {
  protected override hurtTexture = undefined;

  private moveTimer: number;
  private attackTimer: number;
  private currentFrame = 0;
  private readonly onSpawnSlimes: (wx: number, wy: number) => void;

  public constructor(
    scene: Phaser.Scene,
    worldX: number,
    worldY: number,
    onSpawnSlimes: (wx: number, wy: number) => void,
  ) {
    const sprite = scene.add
      .sprite(0, 0, ASSET_KEYS.bigSlime, 0)
      .setOrigin(0.5)
      .setDepth(SCENE_DEPTHS.player);

    super(scene, worldX, worldY, MAX_HEALTH, sprite);

    this.onSpawnSlimes = onSpawnSlimes;
    this.moveTimer = Phaser.Math.Between(0, MOVE_INTERVAL);
    this.attackTimer = Phaser.Math.Between(0, ATTACK_INTERVAL);
  }

  protected override get normalTexture(): string {
    return ASSET_KEYS.bigSlime;
  }

  protected override get spriteScale(): number {
    return 1.3;
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

  protected override onDeath(): void {
    this.onSpawnSlimes(this.worldX, this.worldY);
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
