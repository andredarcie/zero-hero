// A CAVADA NO PÉ (pedido do autor, 2026-11-18): de pé em cima da trinca, o herói não golpeia para a frente como quem
// corta — ele finca a pá no chão debaixo de si. A pá sobe na frente do corpo, desce reta, morde a terra, faz alavanca e
// joga o torrão para o lado; o corpo dobra junto a cada pazada. Serve às duas trincas: as covas da Sisi
// (ItemUseGround.digUnderfoot) e as relíquias (RelicDig).

import { ASSET_KEYS } from '@/game/constants';
import { getSoundManager } from '@/game/audio/SoundManager';
import type { GameScene } from '../GameScene';

/** O que ShovelStab usa de GameScene. */
export type ShovelStabHost = Pick<GameScene, 'actions' | 'carry' | 'debris' | 'hero' | 'steps' | 'time' | 'tweens' | 'world3d'>;

/** Uma pazada: subir, descer, morder e fazer alavanca. */
const RAISE_MS = 120;
const DRIVE_MS = 90;
const LEVER_MS = 130;
const SETTLE_MS = 60;
export const STAB_STROKE_MS = RAISE_MS + DRIVE_MS + LEVER_MS + SETTLE_MS;
/** A pá fica um nada à frente do corpo (para a câmera), senão o herói a cobriria. */
const IN_FRONT = 0.16;
const SHOVEL_SIZE = 0.82;

export class ShovelStab {
  public constructor(private readonly host: ShovelStabHost) {}

  /**
   * `strokes` pazadas no tile (x, y). `onBite(i)` chama no instante em que a lâmina entra na terra (a primeira morde o
   * chão; quem chama decide o que acontece ali); `onDone` quando a pá volta às costas. Devolve a duração total.
   */
  public stab(x: number, y: number, strokes: number, onBite: (stroke: number) => void, onDone?: () => void): number {
    const total = strokes * STAB_STROKE_MS;
    const w3 = this.host.world3d;
    // A respiração parada mexe na mesma escala do corpo: ela sai enquanto ele cava.
    this.host.steps.stopBreathing();
    this.host.actions.useCooldownMs = Math.max(this.host.actions.useCooldownMs, total);
    this.host.carry.hideBackItemDuringSwing(total);
    const shovel = w3?.objects.addBillboard(ASSET_KEYS.shovelIcon, 0)
      .setPosition(x + 0.14, y + IN_FRONT)
      .setElevation(0.5)
      .setDisplaySize(SHOVEL_SIZE, SHOVEL_SIZE);
    const hero = this.host.hero;
    const sound = getSoundManager();
    const stroke = (i: number): void => {
      if (i >= strokes) {
        shovel?.destroy();
        this.host.tweens.add({ targets: hero, lungeY: 0, scaleY: 1, duration: 140, ease: 'Sine.easeOut' });
        onDone?.();
        return;
      }
      // sobe, inclinada para trás
      this.host.tweens.add({ targets: hero, lungeY: -0.04, scaleY: 1.03, duration: RAISE_MS, ease: 'Sine.easeOut' });
      this.tween(shovel, { elevation: 0.62, angle: -10 }, RAISE_MS, 'Sine.easeOut', () => {
        // desce reta: o corpo dobra junto
        this.host.tweens.add({ targets: hero, lungeY: 0.06, scaleY: 0.93, duration: DRIVE_MS, ease: 'Cubic.easeIn' });
        this.tween(shovel, { elevation: -0.16, angle: 0 }, DRIVE_MS, 'Cubic.easeIn', () => {
          sound.work.playGrassCut();
          this.host.debris.spawnDirtBurst(x, y, i === 0 ? 6 : 4);
          w3?.cam.shake(45, 0.005, 0, 1);
          onBite(i);
          // a alavanca: o cabo vem para trás e o torrão salta
          this.tween(shovel, { elevation: -0.04, angle: 22 }, LEVER_MS, 'Sine.easeOut', () => {
            this.host.debris.spawnDirtBurst(x, y, 3);
            sound.work.playFootstep();
            this.host.time.delayedCall(SETTLE_MS, () => stroke(i + 1));
          });
        });
      });
    };
    stroke(0);
    return total;
  }

  private tween(target: object | undefined, props: Record<string, number>, duration: number, ease: string, onComplete: () => void): void {
    if (!target) { this.host.time.delayedCall(duration, onComplete); return; }
    this.host.tweens.add({ targets: target, ...props, duration, ease, onComplete });
  }
}
