import Phaser from 'phaser';

import { ASSET_KEYS, MOONFLOWER_FRAMES } from '@/game/constants';
import { getSoundManager } from '@/game/audio/SoundManager';
import { Billboard3D } from '@/game/render3d/Billboard3D';
import { FX_DOT_TEXTURE, world3d } from '@/game/render3d/World3D';
import type { WorldProp } from './WorldProp';

// A giant night-blooming flower over a chokepoint. Real moonflowers open in the dark and close in
// the light — so this one is a CLOSED BUD (it blocks) whenever a campfire burns near it, and BLOOMS
// OPEN into a walkable petal-bridge (faintly bioluminescent) once the area goes dark. Reversible:
// light a fire nearby and it folds shut again.
//
// ── ONE plant, one ladder of poses ───────────────────────────────────────────────────────────
// The bud and the bloom used to be two unrelated drawings (a green side-on teardrop and a pale
// top-down rosette): different palette, different petal count, nothing shared, so the pair read as
// two objects swapping places instead of one plant changing state. Now both come out of a single
// parametric drawing evaluated at nine openness values (spritefactory/sprites/moonflower.mjs), and
// this class does nothing but pick the pose for the openness it is currently at.
//
// The two states are still two BILLBOARDS, and that part is not cosmetic:
//   · the shut bud STANDS UP (upright, shadow-casting) so it reads as a solid thing blocking the
//     way — not a sheet of paper on the floor;
//   · the open bloom lies FLAT on the ground (a petal-bridge you walk over, `ground` depth layer).
// So the ladder is split at MOONFLOWER_FRAMES.handoff and the two quads CROSS-DISSOLVE there. The
// seam does not show because both sides draw the same flower at the same instant — the standing
// art is the truthful one while the petals are still in the air, the lying art from the moment
// they are on the ground.
//
// ── The opening is driven by a RATE, not by a tween ──────────────────────────────────────────
// `openness` moves toward its target at a speed that depends on where it already is, which is what
// makes a reversal free: light a fire halfway through the bloom and the petals fold back from
// exactly where they were. A tween per direction would have to be killed and re-aimed, and the
// flower would visibly jump to a pose belonging to the other animation.
//
// GameScene decides open/closed each frame from the lit campfires (setNearFire) and ticks this
// (update); the flower owns its look, its collision and its juice. The glow is an additive mesh,
// NOT a real light (nothing may add a point light at runtime — see World3D).

/** Tiles/second of openness. Opening is a flower's pace; closing RECOILS from the light. */
const OPEN_RATE = 0.85;
const CLOSE_RATE = 2.3;

/**
 * Openness at which the tile becomes walkable. Deliberately late: the petals have to be ON the
 * ground before the hero may step on them. The electronic gate's rule — "collision follows the
 * visible clearance" — with the same consequence in reverse, since closing crosses it immediately.
 */
const WALKABLE_AT = 0.78;

/** The cross-dissolve window around the handoff, in openness units. */
const DISSOLVE = 0.09;

const BLOOM_SIZE = 1.0; // the flat bloom fills the tile when open
const BUD_W = 1.0; // the standing bud — exactly its tile (nothing may overflow it)
const BUD_H = 1.0;
const GLOW_SIZE = 1.7; // the soft bioluminescent halo around the open bloom
const GLOW_ALPHA = 0.32;
const GLOW_FLASH = 0.62; // the overshoot at the instant the last petal lands
const GLOW_TINT = 0xbcd0ff; // pale moonlit blue
const PULSE_MS = 2200;

/**
 * How high the lying quad starts when it takes over from the standing one, in tiles. The standing
 * art still has real height at the handoff and the plan view has none, so the bloom fades in
 * slightly ELEVATED and settles to the ground — which both hides the residual offset and is the
 * thing actually happening: the petals are still falling.
 */
const LAND_ELEV = 0.16;

/**
 * The settle spring: petals do not stop dead, they wobble.
 *
 * It only ever SQUASHES, never stretches — nothing in this game may overflow its tile (the
 * project's oldest art rule), and a 1.09× stretch on a full-tile sprite hangs 1.4px over the edge.
 * A quick compression against the ground reads as the same landing anyway.
 */
const SETTLE_MS = 420;
const SETTLE_OPEN = 0.085; // the petals spreading and settling
const SETTLE_SHUT = 0.12; // the snap shut is more violent than the bloom

/** Wind on a closed bud. A plant is alive; this is not a hint, it is breathing. */
const SWAY_DEG = 1.8;
const SWAY_MS = 2600;

/**
 * The bump tremble. The tilt pivots on the quad's FOOT, so the angle is what decides whether the
 * bud leaves its tile: at 5.5° the bud's own silhouette (~5px wide, 13px tall inside its frame)
 * swings to ~0.34 tile from the centre — inside. Widening the art means revisiting this number.
 */
const BUMP_MS = 220;
const BUMP_DEG = 5.5;

const POLLEN_COUNT = 7;

export class MoonflowerObject implements WorldProp {
  public readonly worldX: number;
  public readonly worldY: number;

  private readonly scene: Phaser.Scene;
  /** The upright bank (closed → half open): blocks, casts a shadow. */
  private readonly bud: Billboard3D;
  /** The lying bank (half open → open): the walkable petal-bridge. */
  private readonly bloom: Billboard3D;
  /** Flat additive halo — the bioluminescence, only once it is open. */
  private readonly glow: Billboard3D;
  private readonly pollen = new Set<Billboard3D>();

  /** 0 = shut bud, 1 = flat open bloom. The single source of truth for look AND collision. */
  private openness = 0;
  private target = 0;
  /** The first tick SNAPS: a level that boots in the dark starts open, it does not bloom on frame 1. */
  private primed = false;
  private aliveMs = 0;
  /** Damped spring left over from the last arrival, and how hard that arrival was. */
  private settleMs = 0;
  private settleAmp = SETTLE_OPEN;
  /** True while a tween owns the halo's alpha (the arrival flash, then the breathing pulse). */
  private glowOwned = false;
  private budFrame = -1;
  private bloomFrame = -1;
  private pulseTween?: Phaser.Tweens.Tween;
  private bumpMs = 0;

  public constructor(scene: Phaser.Scene, worldX: number, worldY: number) {
    this.scene = scene;
    this.worldX = worldX;
    this.worldY = worldY;
    // The shut bud STANDS UP and casts a real shadow + a contact blob, so it reads as a solid
    // obstacle. alphaTest is dropped near zero on both bodies because they CROSS-DISSOLVE: at the
    // lit default (0.5) a fading sprite pops out of existence the moment its opacity crosses the
    // threshold instead of fading (see Billboard3DOptions.alphaTest). The art is binary-alpha, so
    // nothing else changes.
    this.bud = world3d()
      .addBillboard(ASSET_KEYS.moonflower, MOONFLOWER_FRAMES.standing[0], {
        groundShadow: true, alphaTest: 0.02,
      })
      .setPosition(worldX, worldY)
      .setDisplaySize(BUD_W, BUD_H);
    // The open bloom lies flat like a lily pad — the walkable bridge. `ground` layer because the
    // hero stands ON it: two upright quads on one tile are coplanar and strobe (see DEPTH_LAYER).
    this.bloom = world3d()
      .addBillboard(ASSET_KEYS.moonflower, MOONFLOWER_FRAMES.lying[0], {
        flat: true, flatY: 0.02, depthLayer: 'ground', alphaTest: 0.02,
      })
      .setPosition(worldX, worldY)
      .setDisplaySize(BLOOM_SIZE, BLOOM_SIZE)
      .setVisible(false);
    // The bloom's glow: an additive halo (the bioluminescence). Hidden while shut.
    this.glow = world3d()
      .addBillboard(FX_DOT_TEXTURE, 0, {
        flat: true, flatY: 0.015, additive: true, fog: false, depthWrite: false,
      })
      .setPosition(worldX, worldY)
      .setDisplaySize(GLOW_SIZE, GLOW_SIZE)
      .setTint(GLOW_TINT)
      .setAlpha(0)
      .setVisible(false);
    this.render();
  }

  /** A shut bud blocks the tile; petals ON the ground are a walkable bridge. */
  public get blocking(): boolean {
    return this.openness < WALKABLE_AT;
  }

  /** True once the petals are down — the same threshold collision uses, never a second opinion. */
  public get isOpen(): boolean {
    return this.openness >= WALKABLE_AT;
  }

  /** Exposed for the playtest: the animation's own progress, 0 shut → 1 open. */
  public get openAmount(): number {
    return this.openness;
  }

  /**
   * What the two bodies are ACTUALLY drawing, read back off the billboards rather than from a
   * mirrored field — so a playtest asserting "both states come from one sheet" is looking at the
   * renderer's own answer, which is the only place that claim can be true or false.
   */
  public get view(): {
    sheet: string;
    standingFrame: number;
    lyingFrame: number;
    standingAlpha: number;
    lyingAlpha: number;
  } {
    return {
      sheet: this.bud.texKey,
      standingFrame: this.bud.frame,
      lyingFrame: this.bloom.frame,
      standingAlpha: this.bud.visible ? this.bud.alpha : 0,
      lyingAlpha: this.bloom.visible ? this.bloom.alpha : 0,
    };
  }

  /**
   * GameScene calls this each frame: `nearFire` is true while a lit campfire is close enough to
   * keep the flower shut. Only the TARGET moves here; the travel happens in update().
   */
  public setNearFire(nearFire: boolean): void {
    this.target = nearFire ? 0 : 1;
  }

  /**
   * Advance the bloom/fold. `effectsVisible` is the water wheel's rule — audio and particles only
   * exist near the hero, so a flower opening across the map never chimes in anyone's ear.
   */
  public update(deltaMs: number, effectsVisible: boolean): void {
    this.aliveMs += deltaMs;
    if (this.bumpMs > 0) this.bumpMs = Math.max(0, this.bumpMs - deltaMs);
    if (this.settleMs > 0) this.settleMs = Math.max(0, this.settleMs - deltaMs);

    if (!this.primed) {
      // Snap on the first tick: a level authored in the dark must OPEN at boot, not bloom in the
      // player's face during the title card.
      this.primed = true;
      this.openness = this.target;
      if (this.openness >= 1) this.startGlowPulse();
      this.render();
      return;
    }

    const before = this.openness;
    if (this.openness !== this.target) {
      const opening = this.target > this.openness;
      const step = (deltaMs / 1000) * this.rate(opening);
      this.openness = opening
        ? Math.min(this.target, this.openness + step)
        : Math.max(this.target, this.openness - step);

      // Arrivals: each end of the ladder gets its own punctuation.
      if (opening && this.openness >= 1 && before < 1) this.arriveOpen(effectsVisible);
      if (!opening && this.openness <= 0 && before > 0) this.arriveShut(effectsVisible);
      // The exhale of pollen happens ON the way, at the moment the petals break apart — not at
      // the end, where it would read as an afterthought instead of as the flower opening.
      if (opening && before < 0.42 && this.openness >= 0.42 && effectsVisible) {
        this.spawnPollen();
        getSoundManager().playMoonflowerBloom();
      }
      if (!opening && before > 0.30 && this.openness <= 0.30 && effectsVisible) {
        getSoundManager().playMoonflowerClose();
      }
    }

    this.render();
  }

  /**
   * Speed of the openness travel. Not a constant: a flower does not open linearly, and the shape
   * of these two curves is most of what the animation "feels" like.
   *
   * Opening — slow to break the calyx, quick through the middle, easing into place: the classic
   * unfurl. Closing — a beat of HESITATION at full bloom, then it whips shut; that is the flower
   * flinching from the light, and it is what makes the two directions read as different events
   * instead of one animation played backwards.
   */
  private rate(opening: boolean): number {
    const o = this.openness;
    if (opening) return OPEN_RATE * (0.34 + Math.sin(Math.PI * o) * 0.9);
    return CLOSE_RATE * (0.16 + Math.pow(1 - o, 1.5) * 1.3);
  }

  private render(): void {
    const o = this.openness;
    const { handoff, standing, lying, openAt } = MOONFLOWER_FRAMES;

    // Which bank, and how much of each. Inside the dissolve window both are drawn; outside it
    // exactly one is, so a flower at rest costs one quad like any other prop.
    const mix = Phaser.Math.Clamp((o - (handoff - DISSOLVE)) / (DISSOLVE * 2), 0, 1);
    const budAlpha = 1 - mix;
    const bloomAlpha = mix;

    // The settle spring, shared by both banks. Squash only — see SETTLE_MS.
    const decay = this.settleMs / SETTLE_MS;
    const squash = this.settleMs > 0
      ? Math.abs(Math.sin(decay * Math.PI * 2.5)) * decay * this.settleAmp
      : 0;

    if (budAlpha > 0) {
      this.bud.setVisible(true).setAlpha(budAlpha);
      this.poseBud(this.nearest(openAt.standing, standing, o));
      // A closed bud sways in the wind; a bumped one trembles on top of that. Both die out as it
      // opens — a flower lying on the ground has nothing to sway.
      const still = 1 - Phaser.Math.Clamp(o / handoff, 0, 1);
      const bump = this.bumpMs > 0 ? Math.sin(this.bumpMs * 0.09) * (this.bumpMs / BUMP_MS) * BUMP_DEG : 0;
      this.bud.setAngle(
        bump + Math.sin((this.aliveMs * 2 * Math.PI) / SWAY_MS) * SWAY_DEG * still,
      );
      // Height squashes against the foot, width follows at half — a compression, not a wobble in
      // place, and the bud's own art is narrow enough that the tilt above never leaves the tile.
      this.bud.setDisplaySize(BUD_W * (1 - squash * 0.5), BUD_H * (1 - squash));
    } else if (this.bud.visible) {
      this.bud.setVisible(false);
    }

    if (bloomAlpha > 0) {
      this.bloom.setVisible(true).setAlpha(bloomAlpha);
      this.poseBloom(this.nearest(openAt.lying, lying, o));
      // Fades in ELEVATED and settles: the petals are still falling at the handoff (see LAND_ELEV).
      const drop = Phaser.Math.Clamp((o - handoff) / (1 - handoff), 0, 1);
      this.bloom.setElevation(LAND_ELEV * (1 - drop));
      const size = BLOOM_SIZE * (1 - squash);
      this.bloom.setDisplaySize(size, size);
    } else if (this.bloom.visible) {
      this.bloom.setVisible(false);
    }

    // The halo tracks openness and only exists once there is a bloom to glow — except at FULL
    // bloom, where a tween owns its alpha (the arrival flash, then the breathing). Two owners is
    // the bug this is written around: while the flash tween was running, render() overwrote the
    // alpha every frame and the flash simply did not exist.
    if (o <= handoff) {
      this.releaseGlow();
      if (this.glow.visible) this.glow.setVisible(false).setAlpha(0);
      return;
    }
    // The instant the flower leaves full bloom, take the alpha back: otherwise the halo keeps
    // breathing at full strength through the entire fold and then snaps off at the handoff.
    if (o < 1) this.releaseGlow();
    const k = (o - handoff) / (1 - handoff);
    const size = GLOW_SIZE * (0.5 + 0.5 * k);
    this.glow.setVisible(true).setDisplaySize(size, size);
    if (!this.glowOwned) this.glow.setAlpha(GLOW_ALPHA * k);
  }

  /** The pose whose authored openness is closest to where the flower actually is. */
  private nearest(
    at: readonly number[],
    frames: readonly number[],
    o: number,
  ): number {
    let best = 0;
    let bestGap = Infinity;
    for (let i = 0; i < at.length; i += 1) {
      const gap = Math.abs(at[i] - o);
      if (gap < bestGap) { bestGap = gap; best = i; }
    }
    return frames[best];
  }

  private poseBud(frame: number): void {
    if (this.budFrame === frame) return;
    this.budFrame = frame;
    this.bud.setTexture(ASSET_KEYS.moonflower, frame);
  }

  private poseBloom(frame: number): void {
    if (this.bloomFrame === frame) return;
    this.bloomFrame = frame;
    this.bloom.setTexture(ASSET_KEYS.moonflower, frame);
  }

  /** Fully open: the halo flashes over its resting brightness, the petals settle, the ground taps. */
  private arriveOpen(effectsVisible: boolean): void {
    this.settleMs = SETTLE_MS;
    this.settleAmp = SETTLE_OPEN;
    if (!effectsVisible) { this.startGlowPulse(); return; }
    this.releaseGlow();
    this.glow.setVisible(true);
    this.glowOwned = true;
    this.scene.tweens.add({
      targets: this.glow,
      alpha: { from: GLOW_FLASH, to: GLOW_ALPHA },
      duration: 520,
      ease: 'Quad.easeOut',
      onComplete: () => this.startGlowPulse(),
    });
    world3d().shake(70, 0.0022);
  }

  /** Shut: the bud compresses against the ground and springs back — the snap of a leaf closing. */
  private arriveShut(effectsVisible: boolean): void {
    this.settleMs = SETTLE_MS;
    this.settleAmp = SETTLE_SHUT;
    if (effectsVisible) world3d().shake(80, 0.004);
  }

  private startGlowPulse(): void {
    this.releaseGlow();
    this.glow.setVisible(true);
    this.glowOwned = true;
    this.pulseTween = this.scene.tweens.add({
      targets: this.glow,
      alpha: { from: GLOW_ALPHA, to: GLOW_ALPHA * 0.55 },
      duration: PULSE_MS,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  /** Hand the halo's alpha back to render(): stops the flash and the breathing pulse alike. */
  private releaseGlow(): void {
    this.pulseTween = undefined;
    if (!this.glowOwned) return;
    this.scene.tweens.killTweensOf(this.glow);
    this.glowOwned = false;
  }

  /**
   * The pollen the flower exhales as the petals break apart. Additive motes, like the toolbox's
   * sparks: effect tickets, never parts of the plant — so they are free to leave the tile the art
   * may not.
   */
  private spawnPollen(): void {
    for (let i = 0; i < POLLEN_COUNT; i += 1) {
      const mote = world3d()
        .addBillboard(FX_DOT_TEXTURE, 0, {
          centered: true, additive: true, emissive: true, fog: false, depthWrite: false,
        })
        .setTint(i % 3 === 0 ? 0xf8e394 : GLOW_TINT)
        .setPosition(this.worldX + (Math.random() - 0.5) * 0.4, this.worldY)
        .setElevation(0.2 + Math.random() * 0.12)
        .setDisplaySize(0.055, 0.055);
      this.pollen.add(mote);
      this.scene.tweens.add({
        targets: mote,
        x: mote.x + (Math.random() - 0.5) * 0.7,
        elevation: mote.elevation + 0.45 + Math.random() * 0.35,
        alpha: 0,
        duration: 720 + i * 90,
        ease: 'Sine.easeOut',
        onComplete: () => this.retireMote(mote),
      });
    }
  }

  private retireMote(mote: Billboard3D): void {
    this.pollen.delete(mote);
    mote.destroy();
  }

  /** Brief rustle for a bump against the shut bud, so it reads as solid. */
  public shake(): void {
    if (!this.blocking) return;
    // A counter, not a tween: render() already owns the bud's angle every frame (the wind sway),
    // so a tween on the same property would be overwritten and the bump would never be seen.
    this.bumpMs = BUMP_MS;
  }

  public destroy(): void {
    this.releaseGlow();
    this.scene.tweens.killTweensOf(this.glow);
    this.bud.destroy();
    this.bloom.destroy();
    this.glow.destroy();
    for (const mote of this.pollen) {
      this.scene.tweens.killTweensOf(mote);
      mote.destroy();
    }
    this.pollen.clear();
  }
}
