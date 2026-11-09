// A FLOR DA LUA, VISTA: o botão e a flor aberta posados pela abertura, o brilho que pulsa quando ela abre, e o pólen.
// Quando ela abre e fecha é do MoonflowerObject.

import * as Engine from '@/game/engine';
import { ASSET_KEYS, MOONFLOWER_FRAMES } from '@/game/constants';
import { Billboard3D } from '@/game/render3d/Billboard3D';
import { FX_DOT_TEXTURE, world3d } from '@/game/render3d/World3D';
import type { MoonflowerObject } from './MoonflowerObject';

/** The cross-dissolve window around the handoff, in openness units. */
const DISSOLVE = 0.09;
export const BLOOM_SIZE = 1.0; // the flat bloom fills the tile when open
export const BUD_W = 1.0; // the standing bud — exactly its tile (nothing may overflow it)
export const BUD_H = 1.0;
export const GLOW_SIZE = 1.7; // the soft bioluminescent halo around the open bloom
export const GLOW_ALPHA = 0.32;
export const GLOW_TINT = 0xbcd0ff; // pale moonlit blue
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
export const SETTLE_MS = 420;
/** Wind on a closed bud. A plant is alive; this is not a hint, it is breathing. */
const SWAY_DEG = 1.8;
const SWAY_MS = 2600;
/**
 * The bump tremble. The tilt pivots on the quad's FOOT, so the angle is what decides whether the
 * bud leaves its tile: at 5.5° the bud's own silhouette (~5px wide, 13px tall inside its frame)
 * swings to ~0.34 tile from the centre — inside. Widening the art means revisiting this number.
 */
export const BUMP_MS = 220;
const BUMP_DEG = 5.5;
const POLLEN_COUNT = 7;

/** O que MoonflowerLook usa de MoonflowerObject. */
export type MoonflowerLookHost = Pick<MoonflowerObject,
  'aliveMs' | 'bloom' | 'bud' | 'bumpMs' | 'glow' | 'glowOwned' | 'openness' | 'pollen' | 'scene' | 'settleAmp'
  | 'settleMs' | 'worldX' | 'worldY'
>;

export class MoonflowerLook {
  private budFrame = -1;
  private bloomFrame = -1;

  public constructor(private readonly host: MoonflowerLookHost) {}

  public render(): void {
    const o = this.host.openness;
    const { handoff, standing, lying, openAt } = MOONFLOWER_FRAMES;

    // Which bank, and how much of each. Inside the dissolve window both are drawn; outside it
    // exactly one is, so a flower at rest costs one quad like any other prop.
    const mix = Engine.Math.Clamp((o - (handoff - DISSOLVE)) / (DISSOLVE * 2), 0, 1);
    const budAlpha = 1 - mix;
    const bloomAlpha = mix;

    // The settle spring, shared by both banks. Squash only — see SETTLE_MS.
    const decay = this.host.settleMs / SETTLE_MS;
    const squash = this.host.settleMs > 0
      ? Math.abs(Math.sin(decay * Math.PI * 2.5)) * decay * this.host.settleAmp
      : 0;

    if (budAlpha > 0) {
      this.host.bud.setVisible(true).setAlpha(budAlpha);
      this.poseBud(this.nearest(openAt.standing, standing, o));
      // A closed bud sways in the wind; a bumped one trembles on top of that. Both die out as it
      // opens — a flower lying on the ground has nothing to sway.
      const still = 1 - Engine.Math.Clamp(o / handoff, 0, 1);
      const bump = this.host.bumpMs > 0 ? Math.sin(this.host.bumpMs * 0.09) * (this.host.bumpMs / BUMP_MS) * BUMP_DEG : 0;
      this.host.bud.setAngle(
        bump + Math.sin((this.host.aliveMs * 2 * Math.PI) / SWAY_MS) * SWAY_DEG * still,
      );
      // Height squashes against the foot, width follows at half — a compression, not a wobble in
      // place, and the bud's own art is narrow enough that the tilt above never leaves the tile.
      this.host.bud.setDisplaySize(BUD_W * (1 - squash * 0.5), BUD_H * (1 - squash));
    } else if (this.host.bud.visible) {
      this.host.bud.setVisible(false);
    }

    if (bloomAlpha > 0) {
      this.host.bloom.setVisible(true).setAlpha(bloomAlpha);
      this.poseBloom(this.nearest(openAt.lying, lying, o));
      // Fades in ELEVATED and settles: the petals are still falling at the handoff (see LAND_ELEV).
      const drop = Engine.Math.Clamp((o - handoff) / (1 - handoff), 0, 1);
      this.host.bloom.setElevation(LAND_ELEV * (1 - drop));
      const size = BLOOM_SIZE * (1 - squash);
      this.host.bloom.setDisplaySize(size, size);
    } else if (this.host.bloom.visible) {
      this.host.bloom.setVisible(false);
    }

    // The halo tracks openness and only exists once there is a bloom to glow — except at FULL
    // bloom, where a tween owns its alpha (the arrival flash, then the breathing). Two owners is
    // the bug this is written around: while the flash tween was running, render() overwrote the
    // alpha every frame and the flash simply did not exist.
    if (o <= handoff) {
      this.releaseGlow();
      if (this.host.glow.visible) this.host.glow.setVisible(false).setAlpha(0);
      return;
    }
    // The instant the flower leaves full bloom, take the alpha back: otherwise the halo keeps
    // breathing at full strength through the entire fold and then snaps off at the handoff.
    if (o < 1) this.releaseGlow();
    const k = (o - handoff) / (1 - handoff);
    const size = GLOW_SIZE * (0.5 + 0.5 * k);
    this.host.glow.setVisible(true).setDisplaySize(size, size);
    if (!this.host.glowOwned) this.host.glow.setAlpha(GLOW_ALPHA * k);
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
    this.host.bud.setTexture(ASSET_KEYS.moonflower, frame);
  }

  private poseBloom(frame: number): void {
    if (this.bloomFrame === frame) return;
    this.bloomFrame = frame;
    this.host.bloom.setTexture(ASSET_KEYS.moonflower, frame);
  }

  public startGlowPulse(): void {
    this.releaseGlow();
    this.host.glow.setVisible(true);
    this.host.glowOwned = true;
    this.host.scene.tweens.add({
      targets: this.host.glow,
      alpha: { from: GLOW_ALPHA, to: GLOW_ALPHA * 0.55 },
      duration: PULSE_MS,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  /** Hand the halo's alpha back to render(): stops the flash and the breathing pulse alike. */
  public releaseGlow(): void {
    if (!this.host.glowOwned) return;
    this.host.scene.tweens.killTweensOf(this.host.glow);
    this.host.glowOwned = false;
  }

  /**
   * The pollen the flower exhales as the petals break apart. Additive motes, like the toolbox's
   * sparks: effect tickets, never parts of the plant — so they are free to leave the tile the art
   * may not.
   */
  public spawnPollen(): void {
    for (let i = 0; i < POLLEN_COUNT; i += 1) {
      const mote = world3d()
        .objects.addBillboard(FX_DOT_TEXTURE, 0, {
          centered: true, additive: true, emissive: true, fog: false, depthWrite: false,
        })
        .setTint(i % 3 === 0 ? 0xf8e394 : GLOW_TINT)
        .setPosition(this.host.worldX + (Math.random() - 0.5) * 0.4, this.host.worldY)
        .setElevation(0.2 + Math.random() * 0.12)
        .setDisplaySize(0.055, 0.055);
      this.host.pollen.add(mote);
      this.host.scene.tweens.add({
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
    this.host.pollen.delete(mote);
    mote.destroy();
  }
}
