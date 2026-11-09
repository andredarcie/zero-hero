// O QUE A PANCADA ARRANCA DO ALTAR: as faíscas em leque, as pedrinhas de escória que quicam no chão, e o anel da
// última pancada. Só efeito: nada aqui decide o que a pancada faz (ver AltarObject.strike).

import type { Billboard3D } from '@/game/render3d/Billboard3D';
import { FX_DOT_TEXTURE, FX_RING_TEXTURE, world3d } from '@/game/render3d/World3D';
import type { AltarObject } from './AltarObject';

/** Onde a peça fica: a altura da MESA da bigorna na arte (fileira 5 de 16), e um fio à frente para não sumir nela. */
export const LOAD_ELEV = 0.68;
const SLAG = 0xe7462a;
/** As pedrinhas de escória que a pancada solta e caem em volta do toco. */
const PEBBLE_TINTS = [0x3c3330, 0x55473d, 0x6b5a4c];

/** O que AltarDebris usa de AltarObject. */
export type AltarDebrisHost = Pick<AltarObject,
  'scene' | 'worldX' | 'worldY'
>;

export class AltarDebris {
  private readonly pebbles = new Set<Billboard3D>();
  private readonly sparks = new Set<Billboard3D>();

  public constructor(private readonly host: AltarDebrisHost) {}

  /**
   * O LEQUE RASANTE. Escória que escapa entre a ferramenta e a pedra é cuspida para os lados, e um
   * leque baixo diz de onde ela saiu melhor que um círculo.
   */
  public spawnSparks(count: number, tint: number, last: boolean): void {
    for (let i = 0; i < count; i += 1) {
      const side = i % 2 === 0 ? 1 : -1;
      const spread = 0.35 + Math.random() * 0.75;
      const spark = world3d()
        .objects.addBillboard(FX_DOT_TEXTURE, 0, {
          centered: true, additive: true, emissive: true, fog: false, depthWrite: false,
        })
        .setTint(i % 3 === 0 ? SLAG : tint)
        .setPosition(this.host.worldX, this.host.worldY - 0.03)
        .setElevation(LOAD_ELEV)
        .setDisplaySize(0.05, 0.05);
      this.sparks.add(spark);

      const reach = (last ? 0.7 : 0.5) * spread;
      const vx = side * reach;
      const vy = (last ? 0.55 : 0.38) * (0.5 + Math.random());
      const gravity = vy + LOAD_ELEV; // chega ao chão exatamente em t=1
      const arc = { t: 0 };
      this.host.scene.tweens.add({
        targets: arc,
        t: 1,
        duration: 300 + i * 24,
        ease: 'Linear',
        onUpdate: () => {
          const { t } = arc;
          spark.x = this.host.worldX + vx * t;
          spark.elevation = Math.max(0.01, LOAD_ELEV + vy * t - gravity * t * t);
          spark.alpha = 1 - t * t;
        },
        onComplete: () => { this.sparks.delete(spark); spark.destroy(); },
      });
    }
  }

  /**
   * AS PEDRINHAS (pedido do autor): a escória que a pancada arranca da esponja não é só faísca — são lascas escuras
   * que pulam da mesa, quicam uma vez no chão em volta do toco e somem.
   */
  public spawnPebbles(count: number): void {
    for (let i = 0; i < count; i += 1) {
      const pebble = world3d()
        .objects.addBillboard(FX_DOT_TEXTURE, 0, { centered: true, fog: false })
        .setTint(PEBBLE_TINTS[i % PEBBLE_TINTS.length])
        .setPosition(this.host.worldX, this.host.worldY - 0.02)
        .setElevation(LOAD_ELEV)
        .setDisplaySize(0.05 + Math.random() * 0.03, 0.05 + Math.random() * 0.03);
      this.pebbles.add(pebble);
      const angle = Math.random() * Math.PI * 2;
      const reach = 0.35 + Math.random() * 0.45;
      const vx = Math.cos(angle) * reach;
      const vy = Math.sin(angle) * reach * 0.6;
      const up = 0.2 + Math.random() * 0.25;
      const fall = up + LOAD_ELEV;
      const arc = { t: 0 };
      this.host.scene.tweens.add({
        targets: arc,
        t: 1,
        duration: 380 + Math.random() * 160,
        ease: 'Linear',
        onUpdate: () => {
          const { t } = arc;
          pebble.x = this.host.worldX + vx * t;
          pebble.y = this.host.worldY - 0.02 + vy * t;
          pebble.elevation = Math.max(0.01, LOAD_ELEV + up * t - fall * t * t);
        },
        onComplete: () => {
          // o quique, e o fade no chão
          this.host.scene.tweens.add({
            targets: pebble,
            elevation: { from: 0.01, to: 0.06 },
            yoyo: true,
            duration: 90,
            onComplete: () => {
              this.host.scene.tweens.add({
                targets: pebble, alpha: 0, delay: 500, duration: 400,
                onComplete: () => { this.pebbles.delete(pebble); pebble.destroy(); },
              });
            },
          });
        },
      });
    }
  }

  /** O anel da última pancada, deitado no chão: o mesmo "acabou" do resto do jogo. */
  public spawnShock(): void {
    const ring = world3d()
      .objects.addBillboard(FX_RING_TEXTURE, 0, {
        flat: true, flatY: 0.03, additive: true, fog: false, depthWrite: false,
      })
      .setTint(SLAG)
      .setPosition(this.host.worldX, this.host.worldY)
      .setDisplaySize(0.3, 0.3)
      .setAlpha(0.85);
    this.host.scene.tweens.add({
      targets: ring,
      scaleX: 1.5,
      scaleY: 1.5,
      alpha: 0,
      duration: 420,
      ease: 'Quad.easeOut',
      onComplete: () => ring.destroy(),
    });
  }

  /** O altar saiu de cena: o que ainda estava no ar some junto. */
  public destroy(): void {
    for (const piece of [...this.pebbles, ...this.sparks]) {
      this.host.scene.tweens.killTweensOf(piece);
      piece.destroy();
    }
    this.pebbles.clear();
    this.sparks.clear();
  }
}
