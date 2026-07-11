import Phaser from 'phaser';

import { ASSET_KEYS, SCENE_DEPTHS, ySortDepth } from '@/game/constants';
import type { WorldCamera } from '@/game/runtime/WorldCamera';

const FRAME_DURATION = 140; // ms per animation frame
const FRAME_KEYS = [
  ASSET_KEYS.campfireFrame0,
  ASSET_KEYS.campfireFrame1,
  ASSET_KEYS.campfireFrame2,
] as const;

// Warm gold-amber cast, not a red-orange. A real campfire's light is yellowish (~1900K);
// the extra green channel here (vs a pure orange) is what reads as "yellow" in the bloom.
const GLOW_TINT = 0xffbb33;
const GLOW_ALPHA = 0.34;

// An unlit campfire is cold, dead wood: the same fire sprite tinted dark ash-brown with no
// glow and no animation, so it reads as charred logs waiting for a flame.
const DEAD_TINT = 0x2a2016;
const DEAD_ALPHA = 0.85;

export class CampfireObject {
  public readonly worldX: number;
  public readonly worldY: number;

  private readonly scene: Phaser.Scene;
  private readonly sprite: Phaser.GameObjects.Image;
  private readonly glow: Phaser.GameObjects.Image;
  private frameIndex = 0;
  private animTimer?: Phaser.Time.TimerEvent;
  private lit: boolean;

  public constructor(scene: Phaser.Scene, worldX: number, worldY: number, lit = true) {
    this.scene  = scene;
    this.worldX = worldX;
    this.worldY = worldY;
    this.lit    = lit;

    // Soft warm glow behind the fire (additive blend for bloom feel). Hidden while unlit.
    this.glow = scene.add
      .image(0, 0, FRAME_KEYS[0])
      .setOrigin(0.5)
      .setDepth(SCENE_DEPTHS.object - 1)
      .setTint(GLOW_TINT)
      .setAlpha(GLOW_ALPHA)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setVisible(lit);

    // Main animated fire sprite
    this.sprite = scene.add
      .image(0, 0, FRAME_KEYS[0])
      .setOrigin(0.5)
      .setDepth(SCENE_DEPTHS.object);

    if (lit) {
      this.startAnim();
    } else {
      this.sprite.setTint(DEAD_TINT).setAlpha(DEAD_ALPHA);
    }
  }

  public get isLit(): boolean {
    return this.lit;
  }

  // Cut-scene build-up only: drive a partial ignition (0 = cold ash, 1 = about to fully light).
  // Starts the flames flickering, warms the cold tint toward full colour, and blooms the glow
  // in by `t`. Call light() afterwards to finish the ignition with its flare.
  public igniteProgress(t: number): void {
    if (this.lit) return;
    const c = Phaser.Math.Clamp(t, 0, 1);
    if (c > 0.02) this.startAnim();
    const warm = Phaser.Display.Color.Interpolate.ColorWithColor(
      Phaser.Display.Color.IntegerToColor(DEAD_TINT),
      Phaser.Display.Color.IntegerToColor(0xffffff),
      100,
      Math.round(c * 100),
    );
    this.sprite
      .setTint(Phaser.Display.Color.GetColor(warm.r, warm.g, warm.b))
      .setAlpha(DEAD_ALPHA + (1 - DEAD_ALPHA) * c);
    this.glow.setTint(GLOW_TINT).setVisible(c > 0.05).setAlpha(GLOW_ALPHA * c);
  }

  private startAnim(): void {
    if (this.animTimer) return;
    this.animTimer = this.scene.time.addEvent({
      delay: FRAME_DURATION,
      callback: this.nextFrame,
      callbackScope: this,
      loop: true,
    });
  }

  private nextFrame(): void {
    this.frameIndex = (this.frameIndex + 1) % FRAME_KEYS.length;
    const key = FRAME_KEYS[this.frameIndex];
    this.sprite.setTexture(key);
    this.glow.setTexture(key);
  }

  public render(tileSize: number, camera: WorldCamera): void {
    const screen = camera.tileToScreen(this.worldX, this.worldY, tileSize);
    const size    = Math.max(12, Math.floor(tileSize * 0.88));
    const glowSz  = Math.floor(size * 2.2);

    this.sprite.setPosition(screen.x, screen.y).setDisplaySize(size, size).setDepth(ySortDepth(this.worldY));
    this.glow.setPosition(screen.x, screen.y).setDisplaySize(glowSz, glowSz).setDepth(ySortDepth(this.worldY) - 0.05);
  }

  /**
   * Bring a dead campfire to life: start the flame, fade the glow in with a flare, drop the
   * cold tint. Returns true only on the transition (so the caller can play the fanfare once).
   */
  public light(): boolean {
    if (this.lit) return false;
    this.lit = true;

    this.sprite.clearTint().setAlpha(1);
    this.startAnim();

    // Glow blooms in from nothing to its resting alpha, with a brief over-bright flare.
    this.glow.setVisible(true).setAlpha(0);
    this.scene.tweens.killTweensOf(this.glow);
    this.scene.tweens.add({
      targets: this.glow,
      alpha: { from: 0, to: GLOW_ALPHA },
      duration: 420,
      ease: 'Cubic.easeOut',
    });

    // The logs kick as they catch — a quick scale flare on the fire sprite.
    this.scene.tweens.killTweensOf(this.sprite);
    this.scene.tweens.add({
      targets: this.sprite,
      scaleX: 1.9,
      scaleY: 1.9,
      duration: 140,
      yoyo: true,
      ease: 'Power2.easeOut',
    });

    return true;
  }

  /** Called when the player hits the campfire — brief flare-up */
  public onHit(): void {
    this.scene.tweens.killTweensOf(this.sprite);
    this.scene.tweens.add({
      targets: this.sprite,
      scaleX: this.lit ? 2.0 : 1.4,
      scaleY: this.lit ? 2.0 : 1.4,
      duration: 90,
      yoyo: true,
      ease: 'Power2.easeOut',
    });
    if (!this.lit) return;
    this.scene.tweens.killTweensOf(this.glow);
    this.scene.tweens.add({
      targets: this.glow,
      alpha: 0.65,
      duration: 90,
      yoyo: true,
    });
  }

  public destroy(): void {
    this.animTimer?.destroy();
    this.animTimer = undefined;
    this.sprite.destroy();
    this.glow.destroy();
  }
}
