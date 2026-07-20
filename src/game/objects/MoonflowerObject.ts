import Phaser from 'phaser';

import { Billboard3D } from '@/game/render3d/Billboard3D';
import { world3d } from '@/game/render3d/World3D';
import type { WorldProp } from './WorldProp';

// A giant night-blooming flower over a chokepoint. Real moonflowers open in the dark and close in
// the light — so this one is a CLOSED BUD (it blocks) whenever a campfire burns near it, and BLOOMS
// OPEN into a walkable petal-bridge (faintly bioluminescent) once the area goes dark. Reversible:
// light a fire nearby and it folds shut again.
//
// The two states are two different billboards, on purpose:
//   · the shut bud STANDS UP (an upright, shadow-casting billboard) so it reads as a solid thing
//     blocking the way — not a sheet of paper on the floor;
//   · the open bloom lies FLAT on the ground (a petal-bridge you walk over) with a soft additive
//     glow — the "only visible in the dark" bioluminescence.
//
// GameScene decides open/closed each frame from the lit campfires (setNearFire); the flower owns
// only its look and collision. The glow is an additive mesh, NOT a real light (nothing may add a
// point light at runtime).

const OPEN_MS = 520;
const BLOOM_SIZE = 1.0; // the flat bloom fills the tile when open
const BUD_W = 0.8; // the standing bud — within the tile (nothing may overflow it)
const BUD_H = 0.98;
const GLOW_SIZE = 1.7; // the soft bioluminescent halo around the open bloom
const GLOW_ALPHA = 0.32;
const GLOW_TINT = 0xbcd0ff; // pale moonlit blue
const PULSE_MS = 2200;

export class MoonflowerObject implements WorldProp {
  public readonly worldX: number;
  public readonly worldY: number;

  private readonly scene: Phaser.Scene;
  private readonly bud: Billboard3D; // upright, shown while shut (blocks)
  private readonly bloom: Billboard3D; // flat petal-bridge, shown while open
  private readonly glow: Billboard3D; // flat additive halo, only while open
  private open = false;
  private pulseTween?: Phaser.Tweens.Tween;

  public constructor(scene: Phaser.Scene, worldX: number, worldY: number) {
    this.scene = scene;
    this.worldX = worldX;
    this.worldY = worldY;
    // The shut bud STANDS UP (camera-facing) and casts a real shadow + a contact blob, so it reads
    // as a solid obstacle. Shown first (a level boots in the firelight, flower shut).
    this.bud = world3d()
      .addBillboard('moonflower-bud', 0, { groundShadow: true })
      .setPosition(worldX, worldY)
      .setDisplaySize(BUD_W, BUD_H);
    // The open bloom lies flat like a lily pad — the walkable bridge. Hidden until it blooms.
    this.bloom = world3d()
      .addBillboard('moonflower-bloom', 0, { flat: true, flatY: 0.02 })
      .setPosition(worldX, worldY)
      .setDisplaySize(BLOOM_SIZE, BLOOM_SIZE)
      .setVisible(false);
    // The bloom's glow: an additive halo (the bioluminescence). Hidden while shut.
    this.glow = world3d()
      .addBillboard('moonflower-bloom', 0, { flat: true, flatY: 0.015, additive: true, fog: false })
      .setPosition(worldX, worldY)
      .setDisplaySize(GLOW_SIZE, GLOW_SIZE)
      .setTint(GLOW_TINT)
      .setAlpha(0)
      .setVisible(false);
  }

  /** A shut bud blocks the tile; an open bloom is a walkable petal-bridge. */
  public get blocking(): boolean {
    return !this.open;
  }

  public get isOpen(): boolean {
    return this.open;
  }

  /**
   * GameScene calls this each frame: `nearFire` is true while a lit campfire is close enough to
   * keep the flower shut. Only acts on a change of state, so the bloom/close animation runs once.
   */
  public setNearFire(nearFire: boolean): void {
    const shouldOpen = !nearFire;
    if (shouldOpen === this.open) return;
    this.open = shouldOpen;
    if (this.open) this.openUp();
    else this.close();
  }

  private openUp(): void {
    // The standing bud folds down and a flat bloom opens in its place; the glow breathes in.
    this.scene.tweens.killTweensOf(this.bud);
    this.scene.tweens.add({
      targets: this.bud,
      displayWidth: 0.12,
      displayHeight: 0.12,
      duration: OPEN_MS * 0.5,
      ease: 'Quad.easeIn',
      onComplete: () => this.bud.setVisible(false),
    });
    this.scene.tweens.killTweensOf(this.bloom);
    this.bloom.setVisible(true).setDisplaySize(0.2, 0.2);
    this.scene.tweens.add({
      targets: this.bloom,
      displayWidth: BLOOM_SIZE,
      displayHeight: BLOOM_SIZE,
      duration: OPEN_MS,
      ease: 'Back.easeOut',
    });
    this.scene.tweens.killTweensOf(this.glow);
    this.glow.setVisible(true).setAlpha(0);
    this.scene.tweens.add({
      targets: this.glow,
      alpha: GLOW_ALPHA,
      duration: OPEN_MS,
      ease: 'Sine.easeOut',
      onComplete: () => this.startGlowPulse(),
    });
  }

  private close(): void {
    // The petals fold back up into a standing bud; bloom + glow fade away.
    this.pulseTween?.stop();
    this.pulseTween = undefined;
    this.scene.tweens.killTweensOf(this.glow);
    this.scene.tweens.add({
      targets: this.glow,
      alpha: 0,
      duration: OPEN_MS * 0.5,
      ease: 'Sine.easeIn',
      onComplete: () => this.glow.setVisible(false),
    });
    this.scene.tweens.killTweensOf(this.bloom);
    this.scene.tweens.add({
      targets: this.bloom,
      displayWidth: 0.2,
      displayHeight: 0.2,
      duration: OPEN_MS * 0.5,
      ease: 'Quad.easeIn',
      onComplete: () => this.bloom.setVisible(false),
    });
    this.scene.tweens.killTweensOf(this.bud);
    this.bud.setVisible(true).setDisplaySize(0.12, 0.12);
    this.scene.tweens.add({
      targets: this.bud,
      displayWidth: BUD_W,
      displayHeight: BUD_H,
      duration: OPEN_MS * 0.8,
      ease: 'Back.easeOut',
    });
  }

  private startGlowPulse(): void {
    this.pulseTween?.stop();
    this.pulseTween = this.scene.tweens.add({
      targets: this.glow,
      alpha: GLOW_ALPHA * 0.55,
      duration: PULSE_MS,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  /** Brief rustle for a bump against the shut bud, so it reads as solid. */
  public shake(): void {
    if (this.open) return;
    this.scene.tweens.killTweensOf(this.bud);
    this.scene.tweens.add({
      targets: this.bud,
      angle: { from: -4, to: 4 },
      duration: 55,
      yoyo: true,
      repeat: 1,
      ease: 'Sine.easeInOut',
      onComplete: () => this.bud.setAngle(0),
    });
  }

  public destroy(): void {
    this.pulseTween?.stop();
    this.pulseTween = undefined;
    this.scene.tweens.killTweensOf(this.bud);
    this.scene.tweens.killTweensOf(this.bloom);
    this.scene.tweens.killTweensOf(this.glow);
    this.bud.destroy();
    this.bloom.destroy();
    this.glow.destroy();
  }
}
