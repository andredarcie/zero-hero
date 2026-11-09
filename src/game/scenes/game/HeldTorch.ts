// O FOGO NA MÃO: o graveto que acende (na fogueira, na lava, num arbusto em chamas), o combustível que acaba, a chama
// que treme e solta faísca, e a lava que vira chão com uma pedra.

import * as Engine from '@/game/engine';
import { TORCH_BURN_MS } from '@/game/constants';
import { CampfireObject } from '@/game/objects/CampfireObject';
import { LavaObject } from '@/game/objects/LavaObject';
import { FX_DOT_TEXTURE, FX_PUFF_TEXTURE } from '@/game/render3d/World3D';
import { getSoundManager } from '@/game/audio/SoundManager';
import type { GameScene } from '../GameScene';
import { Billboard3D } from '@/game/render3d/Billboard3D';
import { FX_BILLBOARD, TORCH_FLAME_KEYS } from './sceneDefs';

// Below this fuel fraction the carried flame starts GUTTERING: its light jitters and closes
// in, the held torch flickers, and smoke wisps trail off the tip — the burnout announces
// itself instead of the flame dying without warning on a hidden clock.
const TORCH_GUTTER_FRAC = 0.4;
const TORCH_FLAME_FRAME_MS = 110;

/** O que HeldTorch usa de GameScene. */
export type HeldTorchHost = Pick<GameScene,
  'carry' | 'cutsceneActive' | 'debris' | 'heldItem' | 'hero' | 'playerWorld' | 'props' | 'swing' | 'time'
  | 'tweens' | 'world3d'
>;

export class HeldTorch {
  // Fire lives on the held item: only the wood club can be lit at a campfire (the sword can't).
  public heldOnFire = false;
  // Remaining life of the carried flame, in ms. Counts down while heldOnFire; re-igniting at
  // any living fire (lit campfire or lava) refills it. Zero snuffs the torch.
  public torchFuelMs = 0;
  // Guttering flicker for a dying carried flame — a random-walk like lightFlicker, but its
  // amplitude grows as the fuel runs out, so the torchlight jitters harder near the end.
  public readonly torchGutter = { level: 1.0, velocity: 0 };
  // Cadence for the smoke wisps / embers trailing off a guttering torch.
  public torchEmberTimer = 0;
  // Pixel-flame billboard pinned on the torch's tip; its size tracks the remaining fuel.
  public torchFlameBb?: Billboard3D;

  public constructor(private readonly host: HeldTorchHost) {}

  /** O X nesta fogueira é do item na mão? A tocha acende nela, o balde a apaga e a chama reacende a morta. */
  public heldActsOnFire(fire: CampfireObject): boolean {
    if (this.host.props.hearths.includes(fire)) return false;
    if (fire.isLit) return this.host.heldItem === 'bucketFull' || this.isFlammableHeld;
    return this.isFlammableHeld && this.heldOnFire;
  }

  /** The held item can catch fire at a campfire: only the wood club burns — the sword never does. */
  public get isFlammableHeld(): boolean {
    return this.host.heldItem === 'wood';
  }

  /** Hero is carrying a burning torch (the lit graveto): fire in hand, and light. */
  public get isTorchLit(): boolean {
    return this.host.heldItem === 'wood' && this.heldOnFire;
  }

  // Light the held item (the wood club — the only flammable item) at a fire source
  // (lit campfire or lava). The sword is not flammable, so it never reaches here.
  public igniteHeldItem(): void {
    if (!this.isFlammableHeld || this.heldOnFire) return;
    getSoundManager().nature.playIgnite();
    this.heldOnFire = true;
    this.refuelTorch();
    this.host.carry.updateBackItem(); // the plain graveto stays visible beneath the flame effect
    // Orange flash on the player as the fire transfers
    this.host.hero.tint = 0xff6600;
    this.host.time.delayedCall(250, () => { this.host.hero.tint = null; });
  }

  /** A pedra afunda na lava: fumaça, tranco, e o tile vira chão quando ela assenta. */
  public solidifyLava(lava: LavaObject, worldX: number, worldY: number): void {
    if (!lava.solidify()) return;
    this.host.debris.spawnSmokePuff(worldX, worldY);
    this.host.world3d?.cam.shake(90, 0.02);
  }

  /** Fill the carried flame back to full. */
  public refuelTorch(): void {
    this.torchFuelMs = TORCH_BURN_MS;
  }

  /** The carried flame burned out in the dark: fall back to an unlit item. */
  public extinguishTorch(): void {
    if (!this.heldOnFire) return;
    this.heldOnFire = false;
    this.torchFuelMs = 0;
    this.host.swing.swordSlash?.setOnFire(false);
    this.host.carry.updateBackItem(); // back to the plain graveto once the flame dies
    this.host.debris.spawnSmokePuff(this.host.playerWorld.worldX, this.host.playerWorld.worldY);
  }

  /** Remaining torch fuel as 0..1 (0 when unlit). */
  public get torchFuelFrac(): number {
    return this.isTorchLit ? Engine.Math.Clamp(this.torchFuelMs / TORCH_BURN_MS, 0, 1) : 0;
  }

  // The carried flame visibly dies instead of running out on a hidden clock: a glow on the
  // flame tip shrinks with the fuel the whole burn, and once it dips into the gutter zone
  // the flame flickers erratically (sprite alpha + light jitter via torchGutter, which
  // updateLighting also reads) while smoke wisps and stray embers trail off the tip at an
  // accelerating pace. The final snuff (extinguishTorch) still puffs its smoke as before.
  public updateTorchFx(delta: number): void {
    const showing = this.isTorchLit && this.host.carry.backItemBb?.visible === true && !this.host.cutsceneActive;
    if (!showing) {
      this.torchFlameBb?.setVisible(false);
      this.torchGutter.level = 1.0;
      this.torchGutter.velocity = 0;
      this.torchEmberTimer = 0;
      // A dying-flame alpha flicker must never survive onto the relit (or swapped) item.
      if (this.host.carry.backItemBb && this.host.carry.backItemBb.alpha !== 1) this.host.carry.backItemBb.setAlpha(1);
      return;
    }

    const frac = this.torchFuelFrac;
    // 0 while healthy, ramping to 1 as the fuel crosses the gutter threshold toward empty.
    const dying = Engine.Math.Clamp(1 - frac / TORCH_GUTTER_FRAC, 0, 1);

    // Mean-reverting random flicker: the level jitters around a centre that SINKS as the
    // fuel runs out (a guttering flame sags more than it spikes). Pure random walk pins at
    // the clamp for long stretches and reads as steady — the pull keeps it oscillating.
    const gutterCentre = 1 - dying * 0.28;
    this.torchGutter.velocity +=
      (Math.random() - 0.5) * (0.03 + dying * 0.16) +
      (gutterCentre - this.torchGutter.level) * 0.015;
    this.torchGutter.velocity *= 0.8;
    this.torchGutter.level = Engine.Math.Clamp(
      this.torchGutter.level + this.torchGutter.velocity * (delta / 16),
      1 - (0.12 + dying * 0.45),
      1.06,
    );

    // The torch sprite itself only flickers once it's guttering — a healthy flame is steady.
    this.host.carry.backItemBb!.setAlpha(dying > 0 ? 0.7 + 0.3 * Engine.Math.Clamp(this.torchGutter.level, 0, 1) : 1);

    // Flame-tip fire: a real 3D emissive billboard (the same tiny-fire sprite that burns on a
    // lit bush), so the flame blooms in the post and sits IN the world — where it used to be a
    // flat 2D image pasted over the canvas, outside the bloom and the tone mapping. Its cycling
    // frames and a one-notch sideways nudge are the whole animation language: no smooth sway.
    const bb = this.host.carry.backItemBb!;
    if (!this.torchFlameBb) {
      this.torchFlameBb = this.host.world3d?.objects.addBillboard(
        TORCH_FLAME_KEYS[0], 0, { emissive: true, emissiveBoost: 4, reflected: true },
      );
      if (!this.torchFlameBb) return;
    }
    const lvl = this.torchGutter.level;
    const flickerStep = (Math.floor(this.host.time.now / 90) % 3) - 1;
    const flameW = 0.16 + 0.26 * frac; // tiles
    const flameH = flameW * (1.35 + 0.12 * lvl);
    const frameKey = TORCH_FLAME_KEYS[
      Math.floor(this.host.time.now / TORCH_FLAME_FRAME_MS) % TORCH_FLAME_KEYS.length
    ];
    // The stick stands 1 tile tall from elevation 0.18; the flame licks just past its tip.
    this.torchFlameBb
      .setTexture(frameKey)
      .setPosition(bb.x + flickerStep * 0.03, bb.y)
      .setElevation(0.94 - flameH * 0.1)
      .setDisplaySize(flameW, flameH)
      .setAlpha(dying > 0 ? 0.65 + 0.35 * lvl : 1)
      .setVisible(true);
    // A guttering flame reddens; a healthy one keeps its HDR boost (clearTint restores it).
    if (dying > 0) this.torchFlameBb.setTint(0xd8562a);
    else this.torchFlameBb.clearTint();

    // Smoke + embers off the tip while guttering, faster the closer to burnout.
    if (dying > 0) {
      this.torchEmberTimer += delta;
      if (this.torchEmberTimer >= 340 - dying * 210) {
        this.torchEmberTimer = 0;
        this.spawnTorchWisp(bb.x, bb.y, dying);
      }
    } else {
      this.torchEmberTimer = 0;
    }
  }

  // One wisp off a guttering torch: a tiny ember or a puff of smoke, rising off the flame's tip.
  // (wx, wy) is the torch's tile; the wisp starts just above its head.
  private spawnTorchWisp(wx: number, wy: number, dying: number): void {
    const w3 = this.host.world3d;
    if (!w3) return;
    const ember = Math.random() < 0.35;
    const size = ember ? 0.07 : 0.1 + dying * 0.05;
    // An ember glows (additive, HDR → it blooms); smoke only occludes.
    const wisp = w3
      .objects.addBillboard(ember ? FX_DOT_TEXTURE : FX_PUFF_TEXTURE, 0, ember
        ? { ...FX_BILLBOARD, additive: true, emissiveBoost: 2 }
        : { ...FX_BILLBOARD, emissive: true, alphaTest: 0.02 })
      .setTint(ember ? 0xffb060 : 0xcac5bd)
      .setPosition(wx + (Math.random() - 0.5) * 0.08, wy)
      .setElevation(1.06)
      .setDisplaySize(size, size)
      .setAlpha(ember ? 0.95 : 0.5);
    this.host.tweens.add({
      targets: wisp,
      x: wisp.x + (Math.random() - 0.5) * 0.24,
      elevation: 1.06 + (ember ? 0.35 : 0.6),
      alpha: 0,
      duration: ember ? 320 : 480 + Math.floor(dying * 160),
      ease: 'Linear',
      onComplete: () => wisp.destroy(),
    });
  }
}
