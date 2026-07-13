import Phaser from 'phaser';

import { Billboard3D } from '@/game/render3d/Billboard3D';
import { world3d, type FireLight3D } from '@/game/render3d/World3D';
import type { WorldCamera } from '@/game/runtime/WorldCamera';

const FRAME_DURATION = 140; // ms per animation frame
const FIRE_TEXTURES = ['campfire-0', 'campfire-1', 'campfire-2'] as const;

// Warm gold-amber cast, not a red-orange. A real campfire's light is yellowish (~1900K);
// the extra green channel here (vs a pure orange) is what reads as "yellow" in the glow.
const GLOW_TINT = 0xffbb33;
const GLOW_ALPHA = 0.34;

// An unlit campfire is cold, dead wood: the same fire sprite tinted dark ash-brown with no
// glow and no animation, so it reads as charred logs waiting for a flame.
const DEAD_TINT = 0x2a2016;
const DEAD_ALPHA = 0.85;

const SIZE = 0.88; // tiles
const GLOW_SCALE = 2.2;

// The campfire in the 3D world: an animated flipbook billboard plus the soft additive glow
// halo behind it, exactly like the 2D sprite pair — and a REAL warm point light: the flicker,
// the lit pool and the true cast shadows all come from the renderer (see render3d/World3D.ts).
export class CampfireObject {
  public readonly worldX: number;
  public readonly worldY: number;

  private readonly scene: Phaser.Scene;
  private readonly sprite: Billboard3D;
  private readonly glow: Billboard3D;
  private readonly fireLight: FireLight3D;
  private frameIndex = 0;
  private animTimer?: Phaser.Time.TimerEvent;
  private lit: boolean;

  public constructor(scene: Phaser.Scene, worldX: number, worldY: number, lit = true) {
    this.scene  = scene;
    this.worldX = worldX;
    this.worldY = worldY;
    this.lit    = lit;

    // Soft warm glow behind the fire (additive blend). Hidden while unlit.
    this.glow = world3d()
      .addBillboard(FIRE_TEXTURES[0], 0, { additive: true })
      .setPosition(worldX, worldY + 0.01)
      .setDisplaySize(SIZE * GLOW_SCALE, SIZE * GLOW_SCALE)
      .setTint(GLOW_TINT)
      .setAlpha(GLOW_ALPHA)
      .setVisible(lit);

    // Main animated fire sprite — full-bright and HDR so the flame itself glows and
    // blooms (a flame is its own light source), like the 2D game's glowing fire.
    this.sprite = world3d()
      .addBillboard(FIRE_TEXTURES[0], 0, { emissive: true, emissiveBoost: 4 })
      .setPosition(worldX, worldY)
      .setDisplaySize(SIZE, SIZE);
    this.fireLight = world3d().addFireLight(worldX, worldY, lit);

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
    this.fireLight.setLit(c > 0.02);
    this.fireLight.setIntensityScale(c);
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
    this.frameIndex = (this.frameIndex + 1) % FIRE_TEXTURES.length;
    const key = FIRE_TEXTURES[this.frameIndex];
    this.sprite.setTexture(key);
    this.glow.setTexture(key);
  }

  public render(_tileSize: number, _camera: WorldCamera): void {
    // Static in world space — the 3D camera does the moving now.
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
    this.fireLight.setLit(true);
    this.fireLight.setIntensityScale(1);

    // Glow blooms in from nothing to its resting alpha.
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
      displayWidth: SIZE * 1.9,
      displayHeight: SIZE * 1.9,
      duration: 140,
      yoyo: true,
      ease: 'Power2.easeOut',
    });

    return true;
  }

  /** Called when the player hits the campfire — brief flare-up */
  public onHit(): void {
    const flare = this.lit ? 2.0 : 1.4;
    this.scene.tweens.killTweensOf(this.sprite);
    this.scene.tweens.add({
      targets: this.sprite,
      displayWidth: SIZE * flare,
      displayHeight: SIZE * flare,
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
    this.scene.tweens.killTweensOf(this.sprite);
    this.scene.tweens.killTweensOf(this.glow);
    this.sprite.destroy();
    this.glow.destroy();
    this.fireLight.destroy();
  }
}
