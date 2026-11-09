import * as Engine from '@/game/engine';

import { getSoundManager } from '@/game/audio/SoundManager';
import { SLEEP_TEXTURE_KEY } from '@/game/entities/NpcManager';
import type { Billboard3D } from '@/game/render3d/Billboard3D';
import { WHITE_SAFE_TINT } from '@/game/render3d/pixelForms';
import { BED_TEXTURE } from '@/game/render3d/skyTextures';
import { world3d } from '@/game/render3d/World3D';
import type { HeroView } from '@/game/runtime/HeroView';

/**
 * O COLCHÃO. O herói joga o colchão no chão do próprio tile, deita em cima e dorme. É cena, sem colisão:
 * levantar enrola tudo de volta e nada fica no mundo.
 */

export interface FireBedHost {
  scene: Engine.Scene;
  hero: HeroView;
  tile: { x: number; y: number };
  dirt: (x: number, y: number, count: number) => void;
  /**
   * O colchão já está no chão (o do acampamento, que fica lá): o herói só deita nele — sem jogar um colchão novo,
   * e sem enrolar nada ao levantar.
   */
  fixed?: boolean;
}

/** O tamanho e a altura do colchão no chão: o fixo do acampamento usa os mesmos. */
export const BED_SIZE = 2;
export const BED_Y = 0.016;
const THROW_HEIGHT = 0.9;
const THROW_MS = 280;
/** Deitado: a arte gira em torno dos pés, então o corpo sobe e anda até ficar em cima do colchão. */
const LIE_SPIN = -90;
const LIE_X = 0.5;
const LIE_Y = 0.25;
const LIE_LIFT = 0.45;
const LIE_MS = 360;
/** O "z" sobe e some, como o dos vizinhos dormindo. */
const SNORE_MS = 2400;

export class FireBed {
  private readonly bed?: Billboard3D;
  private readonly snore: Engine.GameObjects.Image;
  private asleep = false;

  public constructor(private readonly host: FireBedHost) {
    const { tile, scene } = host;
    this.snore = scene.add.image(0, 0, SLEEP_TEXTURE_KEY).setOrigin(0.5, 1).setVisible(false);
    if (host.fixed) return;
    this.bed = world3d()
      .addBillboard(BED_TEXTURE, 0, { flat: true, flatY: BED_Y })
      .setTint(WHITE_SAFE_TINT)
      .setDisplaySize(BED_SIZE * 0.5, BED_SIZE * 0.5)
      .setPosition(tile.x, tile.y)
      .setElevation(THROW_HEIGHT);
  }

  /** O corpo deita em cima do colchão. */
  private lie(delay: number): void {
    const { scene, hero } = this.host;
    scene.tweens.add({
      targets: hero,
      spin: LIE_SPIN,
      lungeX: LIE_X,
      lungeY: LIE_Y,
      lift: LIE_LIFT,
      duration: LIE_MS,
      delay,
      ease: 'Back.easeOut',
      onComplete: () => { this.asleep = true; },
    });
  }

  /** Joga o colchão, ele quica, e o corpo deita. */
  public layDown(): void {
    const { scene, tile, dirt } = this.host;
    if (!this.bed) {
      this.lie(120);
      return;
    }
    scene.tweens.add({
      targets: this.bed,
      elevation: 0,
      displayWidth: BED_SIZE,
      displayHeight: BED_SIZE,
      duration: THROW_MS,
      ease: 'Sine.easeIn',
      onComplete: () => {
        getSoundManager().playItemBonk();
        dirt(tile.x, tile.y, 5);
        scene.tweens.add({ targets: this.bed, displayHeight: BED_SIZE * 0.88, duration: 70, yoyo: true, ease: 'Sine.easeOut' });
        this.lie(180);
      },
    });
  }

  /** O "z" sobre quem dorme. `at` é a cabeça do herói na tela; `quiet` cala o "z" sem acordar ninguém. */
  public tick(timeMs: number, at: { x: number; y: number }, px: number, quiet = false): void {
    const show = this.asleep && !quiet;
    this.snore.setVisible(show);
    if (!show) return;
    const cycle = (timeMs / SNORE_MS) % 1;
    this.snore.setScale(px)
      .setPosition(Math.round(at.x + px * (2 + cycle * 4)), Math.round(at.y - cycle * px * 8))
      .setAlpha(Math.sin(cycle * Math.PI));
  }

  public quiet(): void {
    this.snore.setVisible(false);
  }

  /** Levantar: o corpo volta a ficar em pé e o colchão some enrolando. */
  public rise(): void {
    const { scene, hero } = this.host;
    scene.tweens.killTweensOf(hero);
    if (this.bed) scene.tweens.killTweensOf(this.bed);
    this.asleep = false;
    this.snore.destroy();
    scene.tweens.add({ targets: hero, spin: 0, lungeX: 0, lungeY: 0, lift: 0, duration: 260, ease: 'Sine.easeOut' });
    if (!this.bed) return;
    const bed = this.bed;
    scene.tweens.add({
      targets: this.bed,
      displayWidth: BED_SIZE * 0.4,
      displayHeight: BED_SIZE * 0.4,
      elevation: 0.3,
      duration: 240,
      ease: 'Back.easeIn',
      onComplete: () => bed.destroy(),
    });
    getSoundManager().playItemStash();
  }

  public destroy(): void {
    const { scene, hero } = this.host;
    scene.tweens.killTweensOf(hero);
    if (this.bed) scene.tweens.killTweensOf(this.bed);
    hero.spin = 0;
    hero.lungeX = 0;
    hero.lungeY = 0;
    hero.lift = 0;
    this.snore.destroy();
    this.bed?.destroy();
  }
}
