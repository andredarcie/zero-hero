import * as Engine from '@/game/engine';

import { profiler } from '@/game/debug/Profiler';
import { Billboard3D } from '@/game/render3d/Billboard3D';
import { world3d, type FireLight3D } from '@/game/render3d/World3D';
import type { WorldProp } from './WorldProp';

// A dry bush ("mato seco") blocks its tile until a flaming torch ignites it. It burns for
// BURN_MS — charring from brown to black while little flames flicker on top — then collapses
// into a low burnt stump you walk over. It drops nothing. Collision is owned here (see `blocking`) and resolved at runtime,
// exactly like CampfireObject, so nothing has to touch the baked collision grid.

const BURN_MS = 2200;
const FIRE_FRAME_MS = 110;
const FIRE_KEYS = ['tiny-fire-0', 'tiny-fire-1', 'tiny-fire-2'] as const;

// A burning bush IS a light source: the same warm firelight model as a campfire/torch
// (flicker, glow pool, cast shadows), just smaller — and only for as long as it burns.
// The intensity rides the char progress: flares up fast, holds, dies with the last flame.
const BUSH_LIGHT_SCALE = 0.55;
const bushLightCurve = (p: number): number =>
  (p < 12 ? p / 12 : p < 65 ? 1 : Math.max(0, (100 - p) / 35));

// tinyFire billboards offset over the bush (in tile fractions), each a little out of phase.
const FIRE_SPOTS = [
  { ox: -0.16, oy: 0.06, scale: 0.5, phase: 0 },
  { ox: 0.14, oy: 0.1, scale: 0.42, phase: 1 },
  { ox: 0.0, oy: 0.0, scale: 0.6, phase: 2 },
] as const;

const WHITE = new Engine.Display.Color(255, 255, 255);
const ASH = new Engine.Display.Color(88, 84, 80);
// O pé queimado: o que sobra do arbusto, preto e rente ao chão.
const STUMP_TINT = 0x2f2a25;
const STUMP_SCALE_X = 0.62;
const STUMP_SCALE_Y = 0.3;

type BushState = 'intact' | 'burning' | 'ash';

export class DryBushObject implements WorldProp {
  public readonly worldX: number;
  public readonly worldY: number;

  private readonly scene: Engine.Scene;
  private readonly sprite: Billboard3D;
  private state: BushState = 'intact';

  private fires: Billboard3D[] = [];
  private fireLight?: FireLight3D;
  private fireTimer?: Engine.Time.TimerEvent;
  private fireFrame = 0;

  public constructor(scene: Engine.Scene, worldX: number, worldY: number) {
    this.scene = scene;
    this.worldX = worldX;
    this.worldY = worldY;
    this.sprite = world3d()
      .addBillboard('dry-bush', 0, { groundShadow: true })
      .setPosition(worldX, worldY)
      .setDisplaySize(0.9, 0.9);
  }

  /** The tile is impassable while the bush stands or burns; ash lets the hero walk through. */
  public get blocking(): boolean {
    return this.state !== 'ash';
  }

  public get isAsh(): boolean {
    return this.state === 'ash';
  }

  /** Ardendo AGORA — enquanto durar, este tile e uma fonte de calor (ver GameScene.fireHeatAt). */
  public get isBurning(): boolean {
    return this.state === 'burning';
  }

  /** Set the bush alight; only an intact bush can catch. Returns true if it just ignited. */
  public ignite(): boolean {
    if (this.state !== 'intact') return false;
    this.state = 'burning';

    for (let i = 0; i < FIRE_SPOTS.length; i += 1) {
      const spot = FIRE_SPOTS[i];
      const fire = world3d()
        .addBillboard(FIRE_KEYS[i % FIRE_KEYS.length], 0, { emissive: true })
        .setPosition(this.worldX + spot.ox, this.worldY + spot.oy)
        .setDisplaySize(spot.scale, spot.scale * 1.3);
      this.fires.push(fire);
    }
    this.fireTimer = this.scene.time.addEvent({
      delay: FIRE_FRAME_MS,
      callback: this.advanceFire,
      callbackScope: this,
      loop: true,
    });

    // Real firelight while it burns (see BUSH_LIGHT_SCALE) — driven by the char tween below.
    this.fireLight = world3d().addFireLight(this.worldX, this.worldY, true);
    this.fireLight.setIntensityScale(0);

    // Char from natural brown (no tint) toward ash grey over the burn.
    this.scene.tweens.addCounter({
      from: 0,
      to: 100,
      duration: BURN_MS,
      onUpdate: (tween) => {
        const progress = tween.getValue() ?? 0;
        const c = Engine.Display.Color.Interpolate.ColorWithColor(WHITE, ASH, 100, progress);
        this.sprite.setTint(Engine.Display.Color.GetColor(c.r, c.g, c.b));
        this.fireLight?.setIntensityScale(BUSH_LIGHT_SCALE * bushLightCurve(progress));
      },
      onComplete: () => this.toAsh(),
    });

    return true;
  }

  /** Brief shake so bumping the bush (even without fire) reads as a solid obstacle. */
  public shake(): void {
    if (this.state !== 'intact') return;
    this.scene.tweens.killTweensOf(this.sprite);
    this.scene.tweens.add({
      targets: this.sprite,
      angle: { from: -6, to: 6 },
      duration: 60,
      yoyo: true,
      repeat: 1,
      ease: 'Sine.easeInOut',
      onComplete: () => this.sprite.setAngle(0),
    });
  }

  private advanceFire(): void {
    this.fireFrame += 1;
    this.fires.forEach((fire, i) => {
      fire.setTexture(FIRE_KEYS[(this.fireFrame + FIRE_SPOTS[i].phase) % FIRE_KEYS.length]);
    });
  }

  private toAsh(): void {
    this.state = 'ash';
    profiler.mark('bush.ash');
    this.fireTimer?.destroy();
    this.fireTimer = undefined;
    this.fires.forEach((fire) => fire.destroy());
    this.fires = [];
    // The curve already faded it to zero by now — just release the light.
    this.fireLight?.destroy();
    this.fireLight = undefined;
    // O arbusto desaba e fica só o pé queimado, baixinho, no chão onde o herói pisa.
    this.sprite.setTint(STUMP_TINT).setDepthLayer('ground');
    this.scene.tweens.add({
      targets: this.sprite,
      scaleX: this.sprite.scaleX * STUMP_SCALE_X,
      scaleY: this.sprite.scaleY * STUMP_SCALE_Y,
      duration: 260,
      ease: 'Power2.easeIn',
    });
  }

  public destroy(): void {
    this.fireTimer?.destroy();
    this.fires.forEach((fire) => fire.destroy());
    this.fires = [];
    this.fireLight?.destroy();
    this.fireLight = undefined;
    this.scene.tweens.killTweensOf(this.sprite);
    this.sprite.destroy();
  }
}
