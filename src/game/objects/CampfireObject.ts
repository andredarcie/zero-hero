import * as Engine from '@/game/engine';

import { Billboard3D } from '@/game/render3d/Billboard3D';
import { world3d, type FireLight3D } from '@/game/render3d/World3D';
import { LOG_PILE_TEXTURE } from '@/game/render3d/woodTextures';
import type { WorldProp } from './WorldProp';

const FRAME_DURATION = 140; // ms per animation frame
const FIRE_TEXTURES = ['campfire-0', 'campfire-1', 'campfire-2'] as const;

// Warm gold-amber cast, not a red-orange. A real campfire's light is yellowish (~1900K);
// the extra green channel here (vs a pure orange) is what reads as "yellow" in the glow.
const GLOW_TINT = 0xffbb33;
const GLOW_ALPHA = 0.34;

// A chama cresce em degraus de um pixel de arte: pixel art não incha aos poucos.
const FLAME_STEPS = 12;
/** O menor fogo que se lê como fogo, e o fôlego dele enquanto pega. */
const FLAME_MIN = 0.25;

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
  private heldCold = false;

  private readonly scene: Engine.Scene;
  /** Os galhos, sempre lá: a chama nasce no meio deles. */
  private readonly logs: Billboard3D;
  private readonly sprite: Billboard3D;
  private readonly glow: Billboard3D;
  private readonly fireLight: FireLight3D;
  private frameIndex = 0;
  private animTimer?: Engine.Time.TimerEvent;
  private lit: boolean;
  private kindleTween?: Engine.Tweens.Tween;

  public constructor(scene: Engine.Scene, worldX: number, worldY: number, lit = true) {
    this.scene  = scene;
    this.worldX = worldX;
    this.worldY = worldY;
    this.lit    = lit;

    this.logs = world3d()
      .addBillboard(LOG_PILE_TEXTURE, 0)
      .setPosition(worldX, worldY + 0.03) // na frente da chama: o fogo sai de dentro dos galhos
      .setDisplaySize(SIZE, SIZE);

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
      .setDisplaySize(SIZE, SIZE)
      .setVisible(lit);
    this.fireLight = world3d().addFireLight(worldX, worldY, lit);

    if (lit) this.startAnim();
  }

  /** Quanto fogo há: 0 é só a lenha, 1 é a fogueira inteira. A chama, o halo e a luz sobem juntos. */
  private setFlame(t: number): void {
    const c = Engine.Math.Clamp(t, 0, 1);
    const step = Math.ceil(c * FLAME_STEPS) / FLAME_STEPS;
    const size = SIZE * (FLAME_MIN + (1 - FLAME_MIN) * step);
    this.sprite.setVisible(c > 0).setDisplaySize(size, size);
    this.glow.setVisible(c > 0).setAlpha(GLOW_ALPHA * c).setDisplaySize(SIZE * GLOW_SCALE * step, SIZE * GLOW_SCALE * step);
    this.fireLight.setLit(c > 0);
    this.fireLight.setIntensityScale(c);
  }

  public get isLit(): boolean {
    return this.lit;
  }

  /** Acesa e já inteira: o fogo que o vizinho acendeu terminou de pegar. */
  public get isFullyLit(): boolean {
    return this.lit && !this.kindleTween;
  }

  // Cut-scene build-up only: drive a partial ignition (0 = só a lenha, 1 = about to fully light).
  // Call light() afterwards to finish the ignition with its flare.
  public igniteProgress(t: number): void {
    if (this.lit) return;
    if (t > 0.02) this.startAnim();
    this.setFlame(t);
  }

  /**
   * O FOGO PEGANDO AOS POUCOS: quem acende é o NPC (GameScene.fireKeeperLights). A fogueira já conta como acesa desde
   * a primeira chama: é uma fogueira pequena, não uma apagada.
   */
  public kindle(durationMs: number): boolean {
    if (this.lit || this.heldCold) return false;
    this.lit = true;
    this.startAnim();
    this.setFlame(0.01);
    const grow = { t: 0.01 };
    this.kindleTween = this.scene.tweens.add({
      targets: grow,
      t: 1,
      duration: durationMs,
      ease: 'Sine.easeIn',
      onUpdate: () => this.setFlame(grow.t),
      onComplete: () => { this.kindleTween = undefined; this.setFlame(1); },
    });
    return true;
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
    if (this.lit || this.heldCold) return false;
    this.lit = true;

    this.startAnim();
    this.setFlame(1);
    this.glow.setAlpha(0);
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
   * Douse a lit campfire back to bare logs (a thrown bucket of water, or the morning). The inverse of
   * light(). Returns true only on the transition, so the caller plays the hiss once. The `litFires` game count reads `isLit` live, so it drops on its own.
   */
  public extinguish(): boolean {
    if (!this.lit) return false;
    this.lit = false;

    this.animTimer?.destroy();
    this.animTimer = undefined;
    this.frameIndex = 0;
    this.kindleTween?.remove();
    this.kindleTween = undefined;
    this.scene.tweens.killTweensOf(this.sprite);
    this.scene.tweens.killTweensOf(this.glow);
    this.sprite.setTexture(FIRE_TEXTURES[0]);
    this.setFlame(0);

    return true;
  }

  /**
   * APAGADA ATÉ SEGUNDA ORDEM: a fogueira do Marco, antes da lenha dele. Nem o relógio, nem uma tocha,
   * nem o fogo do vizinho a acendem: acender esta é o pedido inteiro (ver quests/LumberQuest).
   */
  public get isHeldCold(): boolean {
    return this.heldCold;
  }

  public setHeldCold(cold: boolean): void {
    this.heldCold = cold;
    if (cold) this.extinguish();
  }

  /** The world clock owns ambient campfires: flame at night, bare logs during daylight. */
  public setClockLit(lit: boolean): void {
    if (lit) this.light();
    else this.extinguish();
  }

  /** Called when the player hits the campfire — brief flare-up */
  public onHit(): void {
    const flare = this.lit ? 2.0 : 1.15;
    const body = this.lit ? this.sprite : this.logs;
    this.scene.tweens.killTweensOf(body);
    this.scene.tweens.add({
      targets: body,
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
    this.kindleTween?.remove();
    this.scene.tweens.killTweensOf(this.sprite);
    this.scene.tweens.killTweensOf(this.glow);
    this.scene.tweens.killTweensOf(this.logs);
    this.logs.destroy();
    this.sprite.destroy();
    this.glow.destroy();
    this.fireLight.destroy();
  }
}
