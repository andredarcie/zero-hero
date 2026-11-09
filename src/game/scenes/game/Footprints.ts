// AS PEGADAS E O FÔLEGO: a pegada que fica na terra e some aos poucos, e o herói que respira quando para.

import { SCENE_DEPTHS } from '@/game/constants';
import { getSoundManager } from '@/game/audio/SoundManager';
import type { GameScene } from '../GameScene';
import * as Engine from '@/game/engine';

/** Quanto uma pegada leva para sumir (era a duração do tween dela). */
const FOOTPRINT_FADE_MS = 700;

/** O que Footprints usa de GameScene. */
export type FootprintsHost = Pick<GameScene,
  'add' | 'camera' | 'hero' | 'query' | 'tileSize' | 'time' | 'tweens'
>;

export class Footprints {
  // Footprints (world-anchored so they scroll with the ground)
  private footprintStep = false;

  public readonly footprints: Array<{ obj: Engine.GameObjects.Ellipse; worldX: number; worldY: number; offX: number; offY: number; bornAt: number }> = [];
  /**
   * Pegadas apagadas, prontas para a próxima. Criar uma elipse 2D (e um tween) a cada tile e
   * destruir 700ms depois custava 0,4ms por passo — 2,5ms no celular fraco, um tranco a cada tile.
   */
  public readonly footprintPool: Engine.GameObjects.Ellipse[] = [];
  // Breathing idle
  public breathingTween?: Engine.Tweens.Tween;

  public constructor(private readonly host: FootprintsHost) {}

  // Footprints are placed in world space and re-projected every frame so they stay glued to
  // the ground as the world scrolls under the centered hero.
  public updateFootprints(): void {
    if (!this.host.camera) return;
    for (const f of this.footprints) {
      const s = this.host.camera.tileToScreen(f.worldX, f.worldY, this.host.tileSize);
      f.obj.setPosition(s.x + f.offX, s.y + f.offY);
    }
  }

  /**
   * O esmaecimento que era um tween de 700ms 'Power1.easeIn' (alfa 1 → 0, curva v²). Roda no
   * render3D, que corre todo quadro como o gerenciador de tweens corria — inclusive com o update
   * parado num diálogo — e devolve ao pool a pegada que sumiu.
   */
  public fadeFootprints(): void {
    const now = this.host.time.now;
    for (let i = this.footprints.length - 1; i >= 0; i--) {
      const f = this.footprints[i];
      const t = (now - f.bornAt) / FOOTPRINT_FADE_MS;
      if (t >= 1) {
        f.obj.setVisible(false);
        this.footprintPool.push(f.obj);
        this.footprints.splice(i, 1);
      } else {
        f.obj.setAlpha(1 - t * t);
      }
    }
  }

  public startBreathing(): void {
    if (this.breathingTween?.isPlaying()) return;
    this.breathingTween?.destroy();
    // The billboard stands on its feet, so stretching it only grows it upward — no origin
    // pivot needed (the old 2D sprite had to flip its origin and offset y to fake this).
    this.breathingTween = this.host.tweens.add({
      targets: this.host.hero,
      scaleY: 1.045,
      scaleX: 0.972,
      duration: 1100,
      ease: 'Sine.easeInOut',
      yoyo: true,
      repeat: -1,
    });
  }

  public stopBreathing(): void {
    if (!this.breathingTween) return;
    this.breathingTween.stop();
    this.breathingTween.destroy();
    this.breathingTween = undefined;
    // Back to rest: no squash. (O `sizePx` NAO se escreve aqui — ele sai da projecao da camera
    // uma vez por frame, no render3D. Era esta linha que "consertava" o tamanho do heroi no
    // primeiro passo, escondendo que ele nascia errado.)
    this.host.hero.scaleX = 1;
    this.host.hero.scaleY = 1;
  }

  public spawnFootprint(fromWorldX: number, fromWorldY: number, dx: number, dy: number): void {
    if (!this.host.camera) return;
    getSoundManager().work.playStep(this.host.query.surfaceAt(fromWorldX, fromWorldY));

    // Alternate left / right foot using perpendicular offset
    const sign = this.footprintStep ? 1 : -1;
    this.footprintStep = !this.footprintStep;

    // Perpendicular to movement direction
    const perpX = -dy;
    const perpY = dx;
    const offset = this.host.tileSize * 0.17;
    const offX = perpX * offset * sign;
    const offY = perpY * offset * sign + this.host.tileSize * 0.28;

    const s = this.host.camera.tileToScreen(fromWorldX, fromWorldY, this.host.tileSize);
    const w = Math.max(3, Math.floor(this.host.tileSize * (dy !== 0 ? 0.30 : 0.16)));
    const h = Math.max(3, Math.floor(this.host.tileSize * (dx !== 0 ? 0.30 : 0.16)));

    const reused = this.footprintPool.pop();
    const print = reused
      ? reused.setPosition(s.x + offX, s.y + offY).setAlpha(1).setVisible(true)
      : this.host.add
        .ellipse(s.x + offX, s.y + offY, w, h, 0x1a0e06, 0.75)
        .setDepth(SCENE_DEPTHS.decorBelowPlayer - 1);
    // A forma muda com a direção do passo; refazer o contorno só quando ela muda de fato.
    if (reused && (reused.width !== w || reused.height !== h)) reused.setSize(w, h);

    this.footprints.push({ obj: print, worldX: fromWorldX, worldY: fromWorldY, offX, offY, bornAt: this.host.time.now });
  }
}
