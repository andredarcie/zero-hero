import Phaser from 'phaser';

import { ASSET_KEYS, UNDEAD_BORN_FRAME_KEYS } from '@/game/constants';
import { getSoundManager } from '@/game/audio/SoundManager';
import { EnemyBase } from '@/game/entities/EnemyBase';
import type { Billboard3D } from '@/game/render3d/Billboard3D';
import { FX_CRACK_TEXTURE, FX_PUFF_TEXTURE, world3d } from '@/game/render3d/World3D';

const MAX_HEALTH = 3;
const MOVE_INTERVAL = 850;
const ATTACK_INTERVAL = 1200;
// The attack is TELEGRAPHED: when the timer fires the skull doesn't hit — it locks onto the
// hero's CURRENT tile, flashes, rears back and holds for this long before striking. Long
// enough to read and step off the tile (a step takes ~230ms); the strike hits the locked
// tile, so moving = a dodge, and any damage taken mid-wind-up interrupts the attack.
const WINDUP_MS = 500;
const WINDUP_FLASH = 0xff4a3d; // hot warning red — distinct from hurt (texture) and immune (pale blue)
// Skulls are summoned by the dark to hunt the hero, so they chase from farther than the
// old placed undead did (the spawn ring is 4-7 tiles out; see UndeadSpawnDirector).
const DETECTION_RANGE = 14;
const BORN_FRAME_MS = 110;
// Before the skull even exists on screen, the ground TELEGRAPHS it: cold fissures spread
// across the tile and dust kicks up. Deliberately LONG — the whole point is giving the
// player time to see the cracking ground and get away from it (user: "dar um tempo pro
// heroi ver e fugir daquilo"), not a flash followed instantly by a skull. Only after the
// telegraph does the born animation (clawing out of the ground) start.
const TELEGRAPH_MS = 3000;
// The fissure widens in discrete SNAPS (pixel-art: stages, never a smooth scale tween).
const CRACK_STAGE_SIZES = [0.45, 0.7, 0.95] as const;
const CRACK_TINT = 0x8fa8ff; // the cold pale blue of everything undead (deflect ring, wisps)
const DUST_INTERVAL_MS = 240;
const DUST_TINT = 0x9a9284; // dry earth being pushed up from below
// Once the hero steps into a campfire's safety the pack crumbles back into the ground,
// staggered per skull so the horde doesn't vanish in a single frame.
const SUNSET_MIN_MS = 1800;
const SUNSET_MAX_MS = 4800;

export class UndeadEnemy extends EnemyBase {
  protected override hurtTexture = ASSET_KEYS.undeadHurt;

  private moveTimer: number;
  private attackTimer: number;
  // Spawn runs in two phases, both under `spawning` (tile occupied, invulnerable, inert):
  // 1. telegraph — the skull is INVISIBLE; a fissure cracks open and dust kicks up (the warning);
  // 2. born — the claw-out animation (undead_born0..6).
  private spawning = true;
  private telegraphTimer = 0;
  private crackStage = -1;
  private crack?: Billboard3D;
  private dustTimer = 0;
  private bornFrame = 0;
  private bornTimer = 0;
  private sunsetTimer = 0;
  private readonly sunsetDelay: number;
  // Attack wind-up: >0 = committed to a strike on (windupTargetX/Y), counting down.
  private windupMs = 0;
  private windupTargetX = 0;
  private windupTargetY = 0;

  public constructor(scene: Phaser.Scene, worldX: number, worldY: number) {
    const sprite = world3d()
      .addBillboard(UNDEAD_BORN_FRAME_KEYS[0], 0, { groundShadow: { rx: 0.36, rz: 0.34, alpha: 0.32 } })
      .setPosition(worldX, worldY)
      .setDisplaySize(1, 1);

    super(scene, worldX, worldY, MAX_HEALTH, sprite);

    // Through the telegraph the cracking ground is the only actor — the skull stays hidden.
    this.sprite.setVisible(false);
    this.crack = world3d()
      .addBillboard(FX_CRACK_TEXTURE, 0, { flat: true, flatY: 0.03, additive: true, fog: false, depthWrite: false })
      .setTint(CRACK_TINT)
      .setPosition(worldX, worldY)
      .setFlipX(Math.random() < 0.5);
    this.applyCrackStage(0);

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
    // A blow landed during the wind-up INTERRUPTS the attack — the reward for reading the
    // telegraph and striking into it. The attack must be wound up all over again.
    if (this.windupMs > 0) {
      this.windupMs = 0;
      this.attackTimer = 0;
    }
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
      // Phase 1 — the telegraph: fissures + dust only; the skull itself doesn't exist yet.
      if (this.telegraphTimer < TELEGRAPH_MS) {
        this.telegraphTimer += delta;
        this.applyCrackStage(Math.min(
          CRACK_STAGE_SIZES.length - 1,
          Math.floor((this.telegraphTimer / TELEGRAPH_MS) * CRACK_STAGE_SIZES.length),
        ));
        this.dustTimer += delta;
        if (this.dustTimer >= DUST_INTERVAL_MS) {
          this.dustTimer = 0;
          this.spawnDustPuff();
        }
        if (this.telegraphTimer < TELEGRAPH_MS) return false;
        // Phase 2 — the ground gives way: the skull appears and starts clawing out.
        this.sprite.setVisible(true);
        getSoundManager().playUndeadSpawn();
        this.fadeOutCrack();
      }

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

    // Mid-wind-up: committed to the strike — no moving, no re-arming. When the countdown
    // ends the blow lands ONLY if the hero is still on the tile it locked onto: stepping
    // off is a dodge, and the skull snaps at empty air instead.
    if (this.windupMs > 0) {
      this.windupMs -= delta;
      if (this.windupMs > 0) return false;
      const struck =
        playerWorldX === this.windupTargetX &&
        playerWorldY === this.windupTargetY &&
        !playerHasTorch;
      if (struck) return true; // GameScene resolves the hit (damage, lunge, shake)
      this.whiff();
      return false;
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
        this.startWindup(playerWorldX, playerWorldY);
      }
    }

    return false;
  }

  // Lock onto the hero's tile and telegraph the strike: warning flash + a held rear-back
  // pose + a rising hiss. The strike itself fires WINDUP_MS later, in update().
  private startWindup(targetX: number, targetY: number): void {
    this.windupMs = WINDUP_MS;
    this.windupTargetX = targetX;
    this.windupTargetY = targetY;
    getSoundManager().playUndeadWindup();
    this.sprite.setTintFill(WINDUP_FLASH);
    this.scene.time.delayedCall(90, () => {
      if (this.isAlive && this.sprite.active) this.sprite.clearTint();
    });
    this.poseWindup(Math.sign(this.worldX - targetX), Math.sign(this.worldY - targetY), WINDUP_MS * 0.85);
  }

  // The hero dodged (or raised the torch) during the wind-up: the skull still commits,
  // lunging at the tile it locked onto and biting nothing.
  private whiff(): void {
    const dx = Math.sign(this.windupTargetX - this.worldX);
    const dy = Math.sign(this.windupTargetY - this.worldY);
    this.triggerKnockback(dx, dy); // the lunge-and-settle doubles as the miss animation
    getSoundManager().playUndeadWhiff();
  }

  // Each widening step SNAPS the fissure to its next size/brightness — a discrete pop, so the
  // crack visibly jumps wider instead of quietly scaling — and coughs up an extra pair of puffs.
  private applyCrackStage(stage: number): void {
    if (!this.crack || stage === this.crackStage) return;
    const first = this.crackStage < 0;
    this.crackStage = stage;
    const size = CRACK_STAGE_SIZES[Math.min(stage, CRACK_STAGE_SIZES.length - 1)];
    this.crack.setDisplaySize(size, size).setAlpha(0.4 + 0.25 * stage);
    if (!first) {
      this.spawnDustPuff();
      this.spawnDustPuff();
    }
  }

  // Dry earth kicked up along the fissure: grey-brown motes popping off the ground.
  private spawnDustPuff(): void {
    const puff = world3d()
      .addBillboard(FX_PUFF_TEXTURE, 0, { centered: true, fog: false, depthWrite: false, emissive: true, alphaTest: 0.02 })
      .setTint(DUST_TINT)
      .setPosition(this.worldX + (Math.random() - 0.5) * 0.7, this.worldY + (Math.random() - 0.5) * 0.55)
      .setElevation(0.06)
      .setDisplaySize(0.2, 0.2)
      .setAlpha(0.5);
    this.scene.tweens.add({
      targets: puff,
      elevation: 0.45 + Math.random() * 0.35,
      alpha: 0,
      scaleX: 0.42,
      scaleY: 0.42,
      duration: 420 + Math.random() * 220,
      ease: 'Power2.easeOut',
      onComplete: () => puff.destroy(),
    });
  }

  // The fissure never pops off — the skull rises THROUGH it and it fades under the body
  // (or the ground quietly closes again, when a telegraphing skull is despawned).
  private fadeOutCrack(): void {
    const crack = this.crack;
    if (!crack) return;
    this.crack = undefined;
    this.scene.tweens.add({
      targets: crack,
      alpha: 0,
      duration: UNDEAD_BORN_FRAME_KEYS.length * BORN_FRAME_MS,
      ease: 'Power1.easeIn',
      onComplete: () => crack.destroy(),
    });
  }

  public override despawn(): void {
    this.fadeOutCrack();
    super.despawn();
  }

  public override destroy(): void {
    if (this.crack) {
      if (this.scene.tweens) this.scene.tweens.killTweensOf(this.crack);
      this.crack.destroy();
      this.crack = undefined;
    }
    super.destroy();
  }
}
