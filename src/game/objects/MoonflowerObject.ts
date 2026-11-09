import * as Engine from '@/game/engine';

import { ASSET_KEYS, MOONFLOWER_FRAMES } from '@/game/constants';
import { getSoundManager } from '@/game/audio/SoundManager';
import { Billboard3D } from '@/game/render3d/Billboard3D';
import { FX_DOT_TEXTURE, world3d } from '@/game/render3d/World3D';
import type { WorldProp } from './WorldProp';
import { MoonflowerLook, BLOOM_SIZE, BUD_W, BUD_H, GLOW_SIZE, GLOW_ALPHA, GLOW_TINT, SETTLE_MS, BUMP_MS } from './MoonflowerLook';

// A giant night-blooming flower over a chokepoint. Real moonflowers open in the dark and close in
// the light — so this one is a CLOSED BUD (it blocks) whenever a flame burns near it, and BLOOMS
// OPEN into a walkable petal-bridge (faintly bioluminescent) once the area goes dark. Reversible:
// bring fire back and it folds shut again.
//
// A chama que a fecha nao precisa estar plantada no mapa: a TOCHA na mao do heroi conta (ver
// GameScene.updateMoonflowers), e e a unica fonte movel do jogo. Consequencia de projeto, e nao
// efeito colateral: chegar na ponte de petalas com fogo na mao a fecha ANTES de pisar nela, entao
// atravessar custa deixar a luz pra tras — a flor deixou de responder so ao mapa e passou a
// responder ao jogador.
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
// GameScene decides open/closed each frame from the flames near it (setNearFire) and ticks this
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

const GLOW_FLASH = 0.62; // the overshoot at the instant the last petal lands

const SETTLE_OPEN = 0.085; // the petals spreading and settling
const SETTLE_SHUT = 0.12; // the snap shut is more violent than the bloom

export class MoonflowerObject implements WorldProp {
  public readonly worldX: number;
  public readonly worldY: number;

  public readonly scene: Engine.Scene;
  /** The upright bank (closed → half open): blocks, casts a shadow. */
  public readonly bud: Billboard3D;
  /** The lying bank (half open → open): the walkable petal-bridge. */
  public readonly bloom: Billboard3D;
  /** Flat additive halo — the bioluminescence, only once it is open. */
  public readonly glow: Billboard3D;
  public readonly pollen = new Set<Billboard3D>();

  /** 0 = shut bud, 1 = flat open bloom. The single source of truth for look AND collision. */
  public openness = 0;
  private target = 0;
  /** The first tick SNAPS: a level that boots in the dark starts open, it does not bloom on frame 1. */
  private primed = false;
  public aliveMs = 0;
  /** Damped spring left over from the last arrival, and how hard that arrival was. */
  public settleMs = 0;
  public settleAmp = SETTLE_OPEN;
  /** True while a tween owns the halo's alpha (the arrival flash, then the breathing pulse). */
  public glowOwned = false;
  public bumpMs = 0;
  /** O desenho, o brilho e o pólen. (ver MoonflowerLook) */
  private readonly look = new MoonflowerLook(this);

  public constructor(scene: Engine.Scene, worldX: number, worldY: number) {
    this.scene = scene;
    this.worldX = worldX;
    this.worldY = worldY;
    // The shut bud STANDS UP and casts a real shadow + a contact blob, so it reads as a solid
    // obstacle. alphaTest is dropped near zero on both bodies because they CROSS-DISSOLVE: at the
    // lit default (0.5) a fading sprite pops out of existence the moment its opacity crosses the
    // threshold instead of fading (see Billboard3DOptions.alphaTest). The art is binary-alpha, so
    // nothing else changes.
    this.bud = world3d()
      .objects.addBillboard(ASSET_KEYS.moonflower, MOONFLOWER_FRAMES.standing[0], {
        groundShadow: true, alphaTest: 0.02,
      })
      .setPosition(worldX, worldY)
      .setDisplaySize(BUD_W, BUD_H);
    // The open bloom lies flat like a lily pad — the walkable bridge. `ground` layer because the
    // hero stands ON it: two upright quads on one tile are coplanar and strobe (see DEPTH_LAYER).
    this.bloom = world3d()
      .objects.addBillboard(ASSET_KEYS.moonflower, MOONFLOWER_FRAMES.lying[0], {
        flat: true, flatY: 0.02, depthLayer: 'ground', alphaTest: 0.02,
      })
      .setPosition(worldX, worldY)
      .setDisplaySize(BLOOM_SIZE, BLOOM_SIZE)
      .setVisible(false);
    // The bloom's glow: an additive halo (the bioluminescence). Hidden while shut.
    this.glow = world3d()
      .objects.addBillboard(FX_DOT_TEXTURE, 0, {
        flat: true, flatY: 0.015, additive: true, fog: false, depthWrite: false,
      })
      .setPosition(worldX, worldY)
      .setDisplaySize(GLOW_SIZE, GLOW_SIZE)
      .setTint(GLOW_TINT)
      .setAlpha(0)
      .setVisible(false);
    this.look.render();
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
   * GameScene calls this each frame: `nearFire` is true while some flame — fogueira acesa, a tocha
   * do heroi, um graveto aceso no chao — esta perto o bastante pra manter a flor fechada. Only the
   * TARGET moves here; the travel happens in update().
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
      if (this.openness >= 1) this.look.startGlowPulse();
      this.look.render();
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
        this.look.spawnPollen();
        getSoundManager().nature.playMoonflowerBloom();
      }
      if (!opening && before > 0.30 && this.openness <= 0.30 && effectsVisible) {
        getSoundManager().nature.playMoonflowerClose();
      }
    }

    this.look.render();
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

  /** Fully open: the halo flashes over its resting brightness, the petals settle, the ground taps. */
  private arriveOpen(effectsVisible: boolean): void {
    this.settleMs = SETTLE_MS;
    this.settleAmp = SETTLE_OPEN;
    if (!effectsVisible) { this.look.startGlowPulse(); return; }
    this.look.releaseGlow();
    this.glow.setVisible(true);
    this.glowOwned = true;
    this.scene.tweens.add({
      targets: this.glow,
      alpha: { from: GLOW_FLASH, to: GLOW_ALPHA },
      duration: 520,
      ease: 'Quad.easeOut',
      onComplete: () => this.look.startGlowPulse(),
    });
    world3d().cam.shake(70, 0.0022);
  }

  /** Shut: the bud compresses against the ground and springs back — the snap of a leaf closing. */
  private arriveShut(effectsVisible: boolean): void {
    this.settleMs = SETTLE_MS;
    this.settleAmp = SETTLE_SHUT;
    if (effectsVisible) world3d().cam.shake(80, 0.004);
  }

  /** Brief rustle for a bump against the shut bud, so it reads as solid. */
  public shake(): void {
    if (!this.blocking) return;
    // A counter, not a tween: render() already owns the bud's angle every frame (the wind sway),
    // so a tween on the same property would be overwritten and the bump would never be seen.
    this.bumpMs = BUMP_MS;
  }

  public destroy(): void {
    this.look.releaseGlow();
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
