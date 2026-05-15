import Phaser from 'phaser';

import { ASSET_KEYS, SCENE_DEPTHS } from '@/game/constants';
import { EnemyBase } from '@/game/entities/EnemyBase';

const MAX_HEALTH = 1;
const MOVE_INTERVAL = 300;
const ATTACK_INTERVAL = 700;
const DETECTION_RANGE = 8;

export class BatEnemy extends EnemyBase {
  protected override hurtTexture = ASSET_KEYS.batHurt;

  private moveTimer: number;
  private attackTimer: number;

  public constructor(scene: Phaser.Scene, worldX: number, worldY: number) {
    const sprite = scene.add
      .image(0, 0, ASSET_KEYS.bat)
      .setOrigin(0.5)
      .setDepth(SCENE_DEPTHS.player);

    super(scene, worldX, worldY, MAX_HEALTH, sprite);

    this.moveTimer = Phaser.Math.Between(0, MOVE_INTERVAL);
    this.attackTimer = Phaser.Math.Between(0, ATTACK_INTERVAL);
  }

  protected override get normalTexture(): string {
    return ASSET_KEYS.bat;
  }

  protected override get spriteScale(): number {
    return 0.7;
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

    // Bats ignore tile collision — use a passthrough blocker that only checks
    // other entities (but not walls), so we override with a free-move blocker.
    const flyBlocked = (_wx: number, _wy: number): boolean => false;

    this.moveTimer += delta;
    if (this.moveTimer >= MOVE_INTERVAL) {
      this.moveTimer = 0;
      if (dist > 1 && dist <= DETECTION_RANGE) {
        this.moveToward(playerWorldX, playerWorldY, flyBlocked);
      } else if (dist > DETECTION_RANGE) {
        this.wander(flyBlocked);
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
