import Phaser from 'phaser';

import { ASSET_KEYS, SCENE_DEPTHS, UNDEAD_BORN_FRAME_KEYS } from '@/game/constants';
import { EnemyBase } from '@/game/entities/EnemyBase';

const MAX_HEALTH = 3;
const MOVE_INTERVAL = 850;
const ATTACK_INTERVAL = 1200;
// Skulls are summoned by the dark to hunt the hero, so they chase from farther than the
// old placed undead did (the spawn ring is 4-7 tiles out; see UndeadSpawnDirector).
const DETECTION_RANGE = 14;
const BORN_FRAME_MS = 110;
// Once the hero steps into a campfire's safety the pack crumbles back into the ground,
// staggered per skull so the horde doesn't vanish in a single frame.
const SUNSET_MIN_MS = 1800;
const SUNSET_MAX_MS = 4800;

export class UndeadEnemy extends EnemyBase {
  protected override hurtTexture = ASSET_KEYS.undeadHurt;

  private moveTimer: number;
  private attackTimer: number;
  // Born phase: the skull claws out of the ground (undead_born0..6). While spawning it
  // occupies its tile but cannot move, attack, or be hurt.
  private spawning = true;
  private bornFrame = 0;
  private bornTimer = 0;
  private sunsetTimer = 0;
  private readonly sunsetDelay: number;

  public constructor(scene: Phaser.Scene, worldX: number, worldY: number) {
    const sprite = scene.add
      .image(0, 0, UNDEAD_BORN_FRAME_KEYS[0])
      .setOrigin(0.5)
      .setDepth(SCENE_DEPTHS.player);

    super(scene, worldX, worldY, MAX_HEALTH, sprite);

    this.healthBarVisible = false;
    this.moveTimer = Phaser.Math.Between(0, MOVE_INTERVAL);
    this.attackTimer = Phaser.Math.Between(0, ATTACK_INTERVAL);
    this.sunsetDelay = Phaser.Math.Between(SUNSET_MIN_MS, SUNSET_MAX_MS);
  }

  protected override get normalTexture(): string {
    return ASSET_KEYS.undead;
  }

  public override get isSpawning(): boolean {
    return this.spawning;
  }

  // Invulnerable while clawing out of the ground.
  public override takeDamage(amount = 1): boolean {
    if (this.spawning) return false;
    return super.takeDamage(amount);
  }

  public override update(
    delta: number,
    playerWorldX: number,
    playerWorldY: number,
    playerSafe: boolean,
    playerHasTorch: boolean,
    isBlocked: (wx: number, wy: number) => boolean,
  ): boolean {
    if (!this.isAlive) return false;

    if (this.spawning) {
      this.bornTimer += delta;
      while (this.bornTimer >= BORN_FRAME_MS && this.spawning) {
        this.bornTimer -= BORN_FRAME_MS;
        this.bornFrame += 1;
        if (this.bornFrame >= UNDEAD_BORN_FRAME_KEYS.length) {
          this.spawning = false;
          this.healthBarVisible = true;
          this.sprite.setTexture(this.normalTexture);
        } else {
          this.sprite.setTexture(UNDEAD_BORN_FRAME_KEYS[this.bornFrame]);
        }
      }
      return false;
    }

    // The hero found a fire: this skull's time is up. It keeps fighting until its own
    // staggered timer runs out, then crumbles (despawn — no loot).
    if (playerSafe) {
      this.sunsetTimer += delta;
      if (this.sunsetTimer >= this.sunsetDelay) {
        this.despawn();
        return false;
      }
    } else {
      this.sunsetTimer = 0;
    }

    const dx = playerWorldX - this.worldX;
    const dy = playerWorldY - this.worldY;
    const dist = Math.abs(dx) + Math.abs(dy);

    this.moveTimer += delta;
    if (this.moveTimer >= MOVE_INTERVAL) {
      this.moveTimer = 0;
      if (playerHasTorch) {
        // A carried flame wards the undead completely: they back away from the bearer
        // instead of hunting him, and drift aimlessly once out of its reach.
        if (dist <= DETECTION_RANGE) {
          this.moveAway(playerWorldX, playerWorldY, isBlocked);
        } else {
          this.wander(isBlocked);
        }
      } else if (dist > 1 && dist <= DETECTION_RANGE) {
        this.moveToward(playerWorldX, playerWorldY, isBlocked);
      } else if (dist > DETECTION_RANGE) {
        this.wander(isBlocked);
      }
    }

    this.attackTimer += delta;
    if (this.attackTimer >= ATTACK_INTERVAL) {
      this.attackTimer = 0;
      // The torch keeps the hero untouchable: no undead dares strike its bearer.
      if (dist === 1 && !playerHasTorch) {
        return true;
      }
    }

    return false;
  }
}
