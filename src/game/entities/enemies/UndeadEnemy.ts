import Phaser from 'phaser';

import { ASSET_KEYS, SCENE_DEPTHS } from '@/game/constants';
import { EnemyBase } from '@/game/entities/EnemyBase';

const MAX_HEALTH = 3;
const MOVE_INTERVAL = 900;
const ATTACK_INTERVAL = 1200;
const DETECTION_RANGE = 10;

export class UndeadEnemy extends EnemyBase {
  protected override hurtTexture = ASSET_KEYS.undeadHurt;

  private moveTimer: number;
  private attackTimer: number;

  public constructor(scene: Phaser.Scene, worldX: number, worldY: number) {
    const sprite = scene.add
      .image(0, 0, ASSET_KEYS.undead)
      .setOrigin(0.5)
      .setDepth(SCENE_DEPTHS.player);

    super(scene, worldX, worldY, MAX_HEALTH, sprite);

    this.moveTimer = Phaser.Math.Between(0, MOVE_INTERVAL);
    this.attackTimer = Phaser.Math.Between(0, ATTACK_INTERVAL);
  }

  protected override get normalTexture(): string {
    return ASSET_KEYS.undead;
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
      if (dist > 1 && dist <= DETECTION_RANGE) {
        this.moveToward(playerWorldX, playerWorldY, isBlocked);
      } else if (dist > DETECTION_RANGE) {
        this.wander(isBlocked);
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
}
