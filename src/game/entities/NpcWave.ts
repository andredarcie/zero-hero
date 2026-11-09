import type * as Engine from '@/game/engine';

import type { Billboard3D } from '@/game/render3d/Billboard3D';

/**
 * O TCHAU DA SHUI (pedido do autor): quem sobe a serra e aparece na borda olhando para ela lá embaixo
 * ganha um aceno. O aceno é uma ANIMAÇÃO DO PRÓPRIO SPRITE dela, nunca uma peça por cima (um braço avulso
 * colado no corpo foi tentado e lia como outro boneco): `shui_wave.png` são dois quadros feitos do quadro
 * original, mudando SÓ os pixels do braço — os três do braço caído saem, e o mesmo braço sobe, aberto num
 * quadro e reto no outro. Alternar os dois é o aceno; no fim o corpo volta ao quadro de sempre.
 */

const WAVE_TEXTURE = 'shui-wave';
/** Quantas trocas de quadro (aberto ↔ reto) e quanto dura cada uma. */
const SWINGS = 7;
const SWING_MS = 170;

export class NpcWave {
  private readonly restKey: string;
  private readonly restFrame: number;
  private readonly timers: Engine.Time.TimerEvent[] = [];
  private done = false;

  public constructor(
    scene: Engine.Scene,
    private readonly body: Billboard3D,
    private readonly onDone: () => void,
  ) {
    this.restKey = body.texKey;
    this.restFrame = body.frame;
    for (let i = 0; i < SWINGS; i += 1) {
      this.timers.push(scene.time.delayedCall(i * SWING_MS, () => body.setTexture(WAVE_TEXTURE, i % 2)));
    }
    this.timers.push(scene.time.delayedCall(SWINGS * SWING_MS, () => this.finish()));
  }

  public get active(): boolean {
    return !this.done;
  }

  private finish(): void {
    if (this.done) return;
    this.destroy();
    this.onDone();
  }

  /** Para no meio (a cena saiu): o corpo volta ao quadro de sempre. */
  public destroy(): void {
    if (this.done) return;
    this.done = true;
    for (const t of this.timers) t.remove();
    this.timers.length = 0;
    this.body.setTexture(this.restKey, this.restFrame);
  }
}
