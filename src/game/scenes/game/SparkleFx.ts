// OS BRILHOS: a faísca do fogo que pega, o reflexo, o grão de luz que sobe, o fantasma da espada, as faíscas do
// impacto, o brilho do que brota, os corações e o clarão suave da tela.

import * as Engine from '@/game/engine';
import { SCENE_DEPTHS } from '@/game/constants';
import { Billboard3D } from '@/game/render3d/Billboard3D';
import { FX_DOT_TEXTURE } from '@/game/render3d/World3D';
import { HEART_TEXTURE } from '@/game/render3d/cozyTextures';
import { isReducedMotion } from '@/game/runtime/accessibility';
import { getSoundManager } from '@/game/audio/SoundManager';
import type { GameScene } from '../GameScene';
import { BACK_ITEM_VISUAL_3D, FX_BILLBOARD, TORCH_FLAME_KEYS } from './sceneDefs';

// Chest height, in tiles: where the world's one-shot FX (flash, sparks, motes) hang. In 3D they
// live at the body's real height, so they are lit, occluded and blurred like anything else.
const FX_BODY_ELEV = 0.5;

/** O que SparkleFx usa de GameScene. */
export type SparkleFxHost = Pick<GameScene,
  'add' | 'scale' | 'time' | 'tweens' | 'world3d'
>;

export class SparkleFx {
  public constructor(private readonly host: SparkleFxHost) {}

  /**
   * O CLARAO MANSO: no lugar do `camera.flash` (um estalo de tela inteira, de luta), uma luz que
   * SOBE e ASSENTA — um terco do tempo para chegar, o resto para ir embora, sempre em seno.
   */
  public softWash(color: number, peak: number, durationMs: number): void {
    if (isReducedMotion()) return;
    const { width, height } = this.host.scale;
    const wash = this.host.add.rectangle(0, 0, width, height, color, 0)
      .setOrigin(0).setScrollFactor(0).setDepth(SCENE_DEPTHS.toast - 1)
      .setBlendMode(Engine.BlendModes.ADD);
    this.host.tweens.add({
      targets: wash, fillAlpha: peak, duration: durationMs / 3, ease: 'Sine.easeOut',
      onComplete: () => this.host.tweens.add({
        targets: wash, fillAlpha: 0, duration: (durationMs * 2) / 3, ease: 'Sine.easeInOut',
        onComplete: () => wash.destroy(),
      }),
    });
  }

  /** Coracoes subindo de um tile — o obrigado de quem foi ajudado. */
  public spawnHearts(wx: number, wy: number): void {
    const w3 = this.host.world3d;
    if (!w3) return;
    for (let i = 0; i < 3; i += 1) {
      this.host.time.delayedCall(i * 220, () => {
        const heart = w3.objects.addBillboard(HEART_TEXTURE, 0, { centered: true, fog: false, emissive: true })
          .setPosition(wx + (i - 1) * 0.22, wy + 0.05)
          .setElevation(1.05)
          .setDisplaySize(0.36, 0.32);
        this.host.tweens.add({ targets: heart, elevation: 1.75 + i * 0.1, duration: 1500, ease: 'Sine.easeOut' });
        this.host.tweens.add({ targets: heart, x: heart.x + (i - 1) * 0.12, duration: 1500, ease: 'Sine.easeInOut' });
        this.host.tweens.add({ targets: heart, alpha: 0, delay: 900, duration: 600, onComplete: () => heart.destroy() });
      });
    }
  }

  public spawnFireHitEffect(wx: number, wy: number): void {
    const w3 = this.host.world3d;
    if (!w3) return;
    getSoundManager().nature.playFireHit();

    for (let i = 0; i < 3; i++) {
      const f = w3
        .objects.addBillboard(TORCH_FLAME_KEYS[i % TORCH_FLAME_KEYS.length], 0, {
          ...FX_BILLBOARD, emissive: true, alphaTest: 0.05, emissiveBoost: 3,
        })
        .setPosition(wx + (Math.random() - 0.5) * 0.56, wy + (Math.random() - 0.5) * 0.3)
        .setElevation(FX_BODY_ELEV)
        .setDisplaySize(0.38, 0.38);

      this.host.tweens.add({
        targets: f,
        alpha: 0,
        elevation: FX_BODY_ELEV + 0.55,
        duration: 320 + i * 90,
        ease: 'Power2.easeOut',
        onComplete: () => { f.destroy(); },
      });
    }
  }

  /** Um brilho de estrela que acende e some num ponto — o fio da lamina pegando a luz. */
  public spawnGlint(wx: number, wy: number, elevation: number, size = 0.5): void {
    const w3 = this.host.world3d;
    if (!w3) return;
    const star = w3
      .objects.addBillboard(FX_DOT_TEXTURE, 0, { ...FX_BILLBOARD, additive: true, emissiveBoost: 3 })
      .setTint(0xfff6d8)
      .setPosition(wx, wy)
      .setElevation(elevation)
      .setDisplaySize(0.05, 0.05);
    this.host.tweens.add({
      targets: star, displayWidth: size, displayHeight: size * 0.35, duration: 140, yoyo: true,
      ease: 'Quad.easeOut', onComplete: () => star.destroy(),
    });
    const ray = w3
      .objects.addBillboard(FX_DOT_TEXTURE, 0, { ...FX_BILLBOARD, additive: true, emissiveBoost: 3 })
      .setTint(0xfff6d8)
      .setPosition(wx, wy)
      .setElevation(elevation)
      .setDisplaySize(0.05, 0.05);
    this.host.tweens.add({
      targets: ray, displayWidth: size * 0.25, displayHeight: size * 1.1, duration: 140, yoyo: true,
      ease: 'Quad.easeOut', onComplete: () => ray.destroy(),
    });
  }

  /** Uma faisca dourada subindo em volta de um ponto (a lamina juntando o ultimo peso). */
  public spawnRiseMote(wx: number, wy: number, elevation: number): void {
    const w3 = this.host.world3d;
    if (!w3) return;
    const mote = w3
      .objects.addBillboard(FX_DOT_TEXTURE, 0, { ...FX_BILLBOARD, additive: true, emissiveBoost: 2 })
      .setTint(Math.random() < 0.5 ? 0xffe9a8 : 0xfff6d8)
      .setPosition(wx + (Math.random() - 0.5) * 0.9, wy + (Math.random() - 0.5) * 0.4)
      .setElevation(elevation - 0.4 + Math.random() * 0.3)
      .setDisplaySize(0.08, 0.08)
      .setAlpha(0.9);
    this.host.tweens.add({
      targets: mote, elevation: elevation + 0.3 + Math.random() * 0.3, alpha: 0,
      duration: 500 + Math.random() * 300, ease: 'Sine.easeOut', onComplete: () => mote.destroy(),
    });
  }

  /** Um FANTASMA da lamina no rastro do mergulho: a mesma arte, palida, apagando. */
  public spawnSwordGhost(from: Billboard3D): void {
    const w3 = this.host.world3d;
    if (!w3) return;
    const visual = BACK_ITEM_VISUAL_3D.sword;
    const ghost = w3
      .objects.addBillboard(visual.texture, visual.frame, { centered: true, additive: true, fog: false, depthWrite: false })
      .setTint(0x9fc4ff)
      .setPosition(from.x, from.y)
      .setElevation(from.elevation)
      .setDisplaySize(1, 1)
      .setAngle(from.angle)
      .setAlpha(0.55);
    this.host.tweens.add({ targets: ghost, alpha: 0, duration: 260, ease: 'Quad.easeOut', onComplete: () => ghost.destroy() });
  }

  /** FAISCAS QUENTES: aco batendo em pedra enterrada — voam em arco e caem. */
  public spawnImpactSparks(wx: number, wy: number, count: number): void {
    const w3 = this.host.world3d;
    if (!w3) return;
    for (let i = 0; i < count; i += 1) {
      const a = (i / count) * Math.PI * 2 + Math.random() * 0.4;
      const reach = 0.7 + Math.random() * 1.1;
      const spark = w3
        .objects.addBillboard(FX_DOT_TEXTURE, 0, { ...FX_BILLBOARD, additive: true, emissiveBoost: 3 })
        .setTint(Math.random() < 0.5 ? 0xffc46b : 0xfff0c0)
        .setPosition(wx, wy)
        .setElevation(0.12)
        .setDisplaySize(0.07, 0.07);
      const peak = 0.4 + Math.random() * 0.6;
      const dur = 380 + Math.random() * 260;
      this.host.tweens.add({ targets: spark, x: wx + Math.cos(a) * reach, y: wy + Math.sin(a) * reach * 0.6, duration: dur, ease: 'Quad.easeOut' });
      this.host.tweens.add({
        targets: spark, elevation: peak, duration: dur * 0.4, ease: 'Quad.easeOut',
        onComplete: () => {
          this.host.tweens.add({
            targets: spark, elevation: 0.02, alpha: 0, duration: dur * 0.6, ease: 'Quad.easeIn',
            onComplete: () => spark.destroy(),
          });
        },
      });
    }
  }

  /** Um brilho verde subindo de um tile: o canteiro brotou, ou alguem ficou contente. */
  public spawnGrowSparkle(wx: number, wy: number): void {
    const w3 = this.host.world3d;
    if (!w3) return;
    for (let i = 0; i < 8; i += 1) {
      const mote = w3
        .objects.addBillboard(FX_DOT_TEXTURE, 0, { ...FX_BILLBOARD, additive: true, emissiveBoost: 2 })
        .setTint(i % 2 === 0 ? 0xc8ff9a : 0xfff0b0)
        .setPosition(wx + (Math.random() - 0.5) * 0.8, wy + (Math.random() - 0.5) * 0.5)
        .setElevation(0.1 + Math.random() * 0.2)
        .setDisplaySize(0.1, 0.1)
        .setAlpha(0.9);
      this.host.tweens.add({
        targets: mote,
        elevation: 0.9 + Math.random() * 0.5,
        alpha: 0,
        duration: 700 + Math.random() * 500,
        delay: i * 60,
        ease: 'Sine.easeOut',
        onComplete: () => mote.destroy(),
      });
    }
  }
}
