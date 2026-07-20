import Phaser from 'phaser';

import { Billboard3D } from '@/game/render3d/Billboard3D';
import { FX_DOT_TEXTURE, world3d, type FireLight3D } from '@/game/render3d/World3D';
import type { WorldProp } from './WorldProp';

const FRAME_DURATION = 140; // ms per animation frame
const FIRE_TEXTURES = ['campfire-0', 'campfire-1', 'campfire-2'] as const;

// Warm gold-amber cast, not a red-orange. A real campfire's light is yellowish (~1900K);
// the extra green channel here (vs a pure orange) is what reads as "yellow" in the glow.
const GLOW_TINT = 0xffbb33;
const GLOW_ALPHA = 0.34;

// An unlit campfire is cold, dead wood: the same fire sprite tinted dark ash-brown with no
// flame and no animation, so it reads as charred logs waiting for a flame. Lifted from
// #2a2016 — at that value the pile was a black smudge on the night ground, and the object
// the whole loop is about FINDING had no visual presence at all.
const DEAD_TINT = 0x3b2c1f;
const DEAD_ALPHA = 0.9;

// …and the logs are not entirely dead: a stubborn ember pulses deep in the pile — the same
// additive glow mesh the lit fire uses, retextured to a soft dot and dimmed way down. It is
// a beacon, not a light: it never touches the light pool, so the rule that nothing may add
// a light at runtime stays intact, and it gives the player something to walk toward in the
// dark. The pulse is slow — a heartbeat, not a flicker — so it cannot be confused with a
// fire that is actually burning.
const EMBER_TINT = 0xd44a1e;
// Bright enough to read from across a dark clearing even at the pulse's LOW point —
// at 0.05..0.13 the beacon only existed for half of each beat, which on a still frame
// (or a quick glance) is the same as not existing.
const EMBER_ALPHA_LOW = 0.11;
const EMBER_ALPHA_HIGH = 0.24;
const EMBER_PULSE_MS = 1400;
const EMBER_SCALE = 1.4; // of SIZE — a small mound of warmth, far under the lit glow's 2.2

const SIZE = 0.88; // tiles
const GLOW_SCALE = 2.2;

// The campfire in the 3D world: an animated flipbook billboard plus the soft additive glow
// halo behind it, exactly like the 2D sprite pair — and a REAL warm point light: the flicker,
// the lit pool and the true cast shadows all come from the renderer (see render3d/World3D.ts).
export class CampfireObject implements WorldProp {
  public readonly worldX: number;
  public readonly worldY: number;
  // Acesa ou morta, a fogueira é um corpo — o bump nela é a interação (loja/acender), nunca o passo.
  public readonly blocking = true;

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
      this.startEmber();
    }
  }

  /** The dead pile's pulsing ember (see EMBER_TINT above). Reuses the glow mesh. */
  private startEmber(): void {
    this.glow
      .setTexture(FX_DOT_TEXTURE)
      .setTint(EMBER_TINT)
      .setDisplaySize(SIZE * EMBER_SCALE, SIZE * EMBER_SCALE)
      .setAlpha(EMBER_ALPHA_LOW)
      .setVisible(true);
    this.scene.tweens.add({
      targets: this.glow,
      alpha: EMBER_ALPHA_HIGH,
      duration: EMBER_PULSE_MS,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  /** Back from ember duty to the lit fire's warm halo (texture, tint, size). */
  private restoreGlow(): void {
    this.scene.tweens.killTweensOf(this.glow);
    this.glow
      .setTexture(FIRE_TEXTURES[this.frameIndex])
      .setTint(GLOW_TINT)
      .setDisplaySize(SIZE * GLOW_SCALE, SIZE * GLOW_SCALE);
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
    this.restoreGlow(); // the ember hands over to the warming halo
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

    // Glow blooms in from nothing to its resting alpha (ember duty ends here).
    this.restoreGlow();
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

  /**
   * Douse a lit campfire back to cold, dead logs (a thrown bucket of water). The inverse of
   * light(): stop the flame, drop the heat-light, restore the dead tint, and hand the glow mesh
   * back to its stubborn ember. Returns true only on the transition, so the caller plays the hiss
   * once. The `litFires` game count reads `isLit` live, so it drops on its own.
   */
  public extinguish(): boolean {
    if (!this.lit) return false;
    this.lit = false;

    this.animTimer?.destroy();
    this.animTimer = undefined;
    this.frameIndex = 0;
    this.scene.tweens.killTweensOf(this.sprite);
    this.scene.tweens.killTweensOf(this.glow);
    this.sprite.setTexture(FIRE_TEXTURES[0]).setTint(DEAD_TINT).setAlpha(DEAD_ALPHA);
    this.fireLight.setLit(false);
    this.fireLight.setIntensityScale(0);
    this.startEmber(); // cold logs, with the dead pile's pulsing ember

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
