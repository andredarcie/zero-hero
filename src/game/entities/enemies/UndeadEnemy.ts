import Phaser from 'phaser';

import { ASSET_KEYS, SCENE_DEPTHS, UNDEAD_BORN_FRAME_KEYS } from '@/game/constants';
import { getSoundManager } from '@/game/audio/SoundManager';
import { EnemyBase } from '@/game/entities/EnemyBase';
import type { Billboard3D } from '@/game/render3d/Billboard3D';
import { FX_CRACK_TEXTURE, FX_PUFF_TEXTURE, world3d } from '@/game/render3d/World3D';
import type { WorldCamera } from '@/game/runtime/WorldCamera';

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
// Exported because the pressure-plate lure uses the SAME radius: "what a skull can see" has to
// be one number, or the creature would notice a plate at a distance it cannot notice a hero.
export const DETECTION_RANGE = 14;
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

// A blow from the hero SNAPS the skull out of a pressure-plate fixation and keeps it out for
// this long: whatever it wanted, the thing hitting it is the problem now. Without the window it
// would re-fixate on the very next frame and the player's only counter-play would do nothing.
const PLATE_BLIND_AFTER_HIT_MS = 6000;
// The march to a plate is greedy (moveToward has no pathfinder), so a wall between skull and
// plate is a real possibility. If it goes this long without getting any closer it gives up and
// goes plate-blind for the same window — a balloon over a creature grinding against a rock is
// a promise the world isn't keeping.
const PLATE_PATIENCE_MS = 5000;
// The balloon over the head: size in tiles, and the elevation its CENTRE is projected at. The
// skull's own billboard is 1 tile tall, so anything under ~1.3 buries the trailing bubbles in its
// skull and anything over ~1.6 cuts the balloon loose from the creature it belongs to.
const THOUGHT_SIZE_TILES = 1.05;
const THOUGHT_ELEVATION_TILES = 1.45;

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
  // The pressure-plate fixation. EnemyManager owns the assignment (one skull per plate); the
  // skull owns what it DOES about it: it stops hunting the hero entirely and marches there.
  private plate?: { x: number; y: number };
  private plateBlindMs = 0;
  private plateStallMs = 0;
  private plateBestDist = Infinity;
  private thought?: Phaser.GameObjects.Container;
  private thoughtTween?: Phaser.Tweens.Tween;

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

  /**
   * True while this skull is available to be pulled onto a pressure plate. EnemyManager owns
   * WHICH plate (one body per plate, or a second skull would stand beside a taken one wanting
   * forever); the skull owns what it does about it.
   */
  public get seeksPlates(): boolean {
    return this.isAlive && !this.spawning && this.plateBlindMs <= 0;
  }

  /** The plate this skull is marching to — the thing the balloon over its head is showing. */
  public get plateTarget(): { x: number; y: number } | undefined {
    return this.plate;
  }

  public setPlateTarget(target?: { x: number; y: number }): void {
    if (!this.plate && !target) return;
    if (this.plate && target && this.plate.x === target.x && this.plate.y === target.y) return;
    this.plate = target ? { x: target.x, y: target.y } : undefined;
    this.plateStallMs = 0;
    this.plateBestDist = target
      ? Math.abs(target.x - this.worldX) + Math.abs(target.y - this.worldY)
      : Infinity;
    if (target) this.showThought();
    else this.hideThought();
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
    // ...and it SNAPS any plate fixation: whatever the skull wanted, the thing hitting it is
    // the problem now. The blind window is what makes this real counter-play — without it the
    // manager would hand the plate straight back on the next frame and the blow would mean
    // nothing. Note this is the hero's ONLY lever on the lure: he cannot talk it out of it.
    this.plateBlindMs = PLATE_BLIND_AFTER_HIT_MS;
    this.setPlateTarget(undefined);
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

    if (this.plateBlindMs > 0) this.plateBlindMs = Math.max(0, this.plateBlindMs - delta);

    // Mid-wind-up: committed to the strike — no moving, no re-arming. When the countdown
    // ends the blow lands ONLY if the hero is still on the tile it locked onto: stepping
    // off is a dodge, and the skull snaps at empty air instead. A fixation that arrives
    // mid-wind-up does NOT cancel it: the skull already committed, and letting the blow
    // resolve costs 500ms and saves unwinding the held pose the tween left behind.
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

    // FIXATED ON A PLATE: for as long as this lasts the hero simply stops existing. The skull
    // does not chase him, does not back away from his torch and does not strike even from an
    // adjacent tile — it walks to the plate and stands on it. That is the whole trade the piece
    // offers: the plate wants a BODY, and a skull is a body that walks to it on its own, so a
    // plate near the dark is a switch the player throws by leading a monster to it. Only a blow
    // buys the skull's attention back (see takeDamage).
    if (this.plate) {
      const reached = this.worldX === this.plate.x && this.worldY === this.plate.y;
      if (reached) {
        // Arrived: it stands there. Not a pause before something else — the standing IS the
        // behaviour, and a skull that wandered off the plate would make the circuit strobe.
        this.plateStallMs = 0;
        return false;
      }
      this.moveTimer += delta;
      if (this.moveTimer >= MOVE_INTERVAL) {
        this.moveTimer = 0;
        this.moveToward(this.plate.x, this.plate.y, isBlocked);
      }
      // moveToward is greedy (there is no pathfinder in this game), so a rock or a river between
      // skull and plate is a dead march. Measure PROGRESS, not time: as long as it keeps getting
      // closer it can take as long as it likes; the moment it stops closing the gap the patience
      // clock runs, and when it expires the skull gives up and goes plate-blind for a while.
      const gap = Math.abs(this.plate.x - this.worldX) + Math.abs(this.plate.y - this.worldY);
      if (gap < this.plateBestDist) {
        this.plateBestDist = gap;
        this.plateStallMs = 0;
      } else {
        this.plateStallMs += delta;
        if (this.plateStallMs >= PLATE_PATIENCE_MS) {
          this.plateBlindMs = PLATE_BLIND_AFTER_HIT_MS;
          this.setPlateTarget(undefined);
        }
      }
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

  /**
   * The thought balloon: a bubble with a lit pressure plate in it, floating over the skull.
   *
   * This is NOT the need-item hint balloon that was torn out of the game — that one talked to
   * the PLAYER ("go fetch the pickaxe") and handed him the answer to a lock. This one belongs to
   * the creature: it is the same sentence as the attack wind-up's red flash, an intention shown
   * before it is acted on, so the player can read a skull walking past him and understand it is
   * not a bug. Different sentence, different art (thought bubbles, no speech tail), different key.
   */
  private showThought(): void {
    if (this.thought?.active) return;
    const bubble = this.scene.add.image(0, 0, ASSET_KEYS.thoughtPlate);
    // Off-screen until the first onRendered projects it — otherwise it pops at 0,0 for a frame.
    this.thought = this.scene.add.container(-9999, -9999, [bubble])
      .setDepth(SCENE_DEPTHS.player + 2)
      .setScale(0);
    this.scene.tweens.add({
      targets: this.thought,
      scale: 1,
      duration: 220,
      ease: 'Back.easeOut',
    });
    // A wish is a living thing (the bombSpot ghost's grammar): the bubble breathes on its own
    // string. Bobbing the CHILD, never the container, leaves onRendered free to own the anchor.
    this.thoughtTween = this.scene.tweens.add({
      targets: bubble,
      y: -3,
      duration: 900,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  private hideThought(): void {
    const thought = this.thought;
    if (!thought) return;
    this.thought = undefined;
    this.thoughtTween?.stop();
    this.thoughtTween = undefined;
    if (!thought.active || !this.scene.tweens) {
      thought.destroy();
      return;
    }
    this.scene.tweens.add({
      targets: thought,
      scale: 0,
      alpha: 0,
      duration: 160,
      ease: 'Power2.easeIn',
      onComplete: () => thought.destroy(),
    });
  }

  /**
   * Ride the head. Projected at its own ELEVATION rather than offset by a fixed number of
   * pixels: the perspective camera shrinks a tile with depth, so a pixel offset that sits on the
   * head up close floats away from it down the screen. The knockback/step offsets are left out
   * on purpose — the balloon hanging still while the body slides under it reads as a balloon.
   */
  protected override onRendered(camera: WorldCamera, tileSize: number): void {
    const thought = this.thought;
    if (!thought?.active) return;
    const anchor = camera.tileToScreen(this.worldX, this.worldY, tileSize, THOUGHT_ELEVATION_TILES);
    thought.setPosition(anchor.x, anchor.y);
    const size = tileSize * THOUGHT_SIZE_TILES;
    (thought.list[0] as Phaser.GameObjects.Image).setDisplaySize(size, size);
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
    this.hideThought();
    super.despawn();
  }

  // A skull that dies mid-march must not leave its wish floating over the empty tile.
  protected override onDeath(): void {
    this.hideThought();
  }

  public override destroy(): void {
    if (this.crack) {
      if (this.scene.tweens) this.scene.tweens.killTweensOf(this.crack);
      this.crack.destroy();
      this.crack = undefined;
    }
    this.thoughtTween?.stop();
    this.thoughtTween = undefined;
    this.thought?.destroy();
    this.thought = undefined;
    super.destroy();
  }
}
