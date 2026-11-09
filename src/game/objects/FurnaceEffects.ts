// O QUE O FORNO MOSTRA ENQUANTO TRABALHA: a carga voando para a boca, o produto saindo e esperando, o brilho que pulsa
// e as faíscas. Só efeito: o que entra, o que sai e quando é do FurnaceObject.

import { itemGroundVisual, type HeldItemKind } from '@/game/entities/ItemPickup';
import type { Billboard3D } from '@/game/render3d/Billboard3D';
import { FX_DOT_TEXTURE, world3d } from '@/game/render3d/World3D';
import type { FurnaceObject } from './FurnaceObject';

// A boca acesa: um quad additive na frente da alvenaria, como o brilho da forja da bancada. Nao e
// uma luz THREE — a contagem de luzes deste renderer nunca muda em tempo de execucao.
export const MOUTH_ELEV = 0.34;
const EMBER = 0xe7462a;
const EMBER_HOT = 0xf8e394;
/** A altura de onde os insumos saem da mao do heroi. */
export const HAND_ELEV = 0.42;
export const DEPTH_ITEM = 0.05;
export const ITEM_SIZE = 0.5;
export const ease = (t: number): number => 0.5 - Math.cos(Math.PI * t) / 2;
export const arc = (t: number): number => Math.sin(Math.PI * t);

/** O que FurnaceEffects usa de FurnaceObject. */
export type FurnaceEffectsHost = Pick<FurnaceObject,
  'aliveMs' | 'glow' | 'scene' | 'sparks' | 'worldX' | 'worldY'
>;

export class FurnaceEffects {
  private readonly flying: Billboard3D[] = [];
  /**
   * De onde cada carga voando partiu — tile e altura da mao do heroi.
   */
  private chargeFrom: Array<readonly [number, number, number]> = [];

  public constructor(private readonly host: FurnaceEffectsHost) {}

  /**
   * A carga voando da mao do heroi para a boca usa a arte de `itemGroundVisual`.
   * Duas tabelas de sprite para o mesmo item e como uma delas envelhece errada.
   */
  public spawnCharge(
    kinds: readonly HeldItemKind[],
    origins: readonly (readonly [number, number])[],
    elev = HAND_ELEV,
  ): void {
    kinds.forEach((kind, i) => {
      const [sx, sy] = origins[i] ?? origins[origins.length - 1];
      this.chargeFrom.push([sx, sy, elev]);
      const visual = itemGroundVisual(kind);
      this.flying.push(world3d()
        .objects.addBillboard(visual.texture, visual.frame, { emissive: true, centered: true })
        .setPosition(sx, sy + DEPTH_ITEM)
        .setElevation(elev)
        .setDisplaySize(ITEM_SIZE, ITEM_SIZE));
    });
  }

  public moveCharge(k: number): void {
    this.flying.forEach((bb, i) => {
      const [sx, sy, se] = this.chargeFrom[i] ?? [this.host.worldX, this.host.worldY, HAND_ELEV];
      const t = Math.max(0, Math.min(1, (k - (i === 0 ? 0 : 0.16)) / (i === 0 ? 1 : 0.84)));
      bb.setPosition(sx + (this.host.worldX - sx) * t, sy + (this.host.worldY - sy) * t + DEPTH_ITEM)
        .setElevation(se + (MOUTH_ELEV - se) * t + 0.2 * arc(t))
        .setDisplaySize(ITEM_SIZE * (1 - t * 0.9), ITEM_SIZE * (1 - t * 0.9));
    });
  }

  /** A peca pedida no catalogo nascendo na boca. */
  public spawnProduct(kind: HeldItemKind): void {
    const visual = itemGroundVisual(kind);
    this.flying.push(world3d()
      .objects.addBillboard(visual.texture, visual.frame, { emissive: true, centered: true })
      .setPosition(this.host.worldX, this.host.worldY + DEPTH_ITEM)
      .setElevation(MOUTH_ELEV)
      .setDisplaySize(0.02, 0.02));
  }

  public holdProduct(): void {
    const bb = this.flying[0];
    if (!bb) return;
    bb.setPosition(this.host.worldX, this.host.worldY + DEPTH_ITEM)
      .setElevation(MOUTH_ELEV + Math.sin(this.host.aliveMs * 0.004) * 0.03)
      .setDisplaySize(ITEM_SIZE, ITEM_SIZE);
  }

  public moveProduct(t: number, ox: number, oy: number): void {
    const bb = this.flying[0];
    if (!bb) return;
    const born = Math.min(1, t / 0.25);
    const fly = Math.max(0, (t - 0.2) / 0.8);
    bb.setPosition(
      this.host.worldX + (ox - this.host.worldX) * ease(fly),
      this.host.worldY + (oy - this.host.worldY) * ease(fly) + DEPTH_ITEM * (1 - fly),
    )
      .setElevation(MOUTH_ELEV + 0.26 * arc(fly) - (MOUTH_ELEV - 0.1) * fly)
      .setDisplaySize(ITEM_SIZE * born, ITEM_SIZE * born);
  }

  public clearFlying(): void {
    for (const bb of this.flying) bb.destroy();
    this.flying.length = 0;
    this.chargeFrom.length = 0;
  }

  public pulseGlow(strength: number, effectsVisible: boolean): void {
    if (!effectsVisible) { this.host.glow?.setAlpha(0); return; }
    if (!this.host.glow) {
      this.host.glow = world3d()
        .objects.addBillboard(FX_DOT_TEXTURE, 0, {
          centered: true, additive: true, fog: false, depthWrite: false,
        })
        .setTint(EMBER)
        .setPosition(this.host.worldX, this.host.worldY + 0.03)
        .setElevation(MOUTH_ELEV);
    }
    const flicker = 0.8 + 0.2 * Math.sin(this.host.aliveMs * 0.019);
    this.host.glow
      .setAlpha(Math.min(0.9, strength * flicker))
      .setDisplaySize(0.8 * strength + 0.25, 0.5 * strength + 0.2);
  }

  public fadeGlow(deltaMs: number): void {
    if (!this.host.glow) return;
    const next = this.host.glow.alpha - deltaMs / 300;
    if (next <= 0) { this.host.glow.destroy(); this.host.glow = undefined; return; }
    this.host.glow.setAlpha(next);
  }

  /**
   * A brasa subindo. `from` e a altura de onde ela sai: o sopro do fole sobe pela CHAMINE (0,9,
   * acima da alvenaria) e o esguicho da entrega sai pela BOCA (a mesma altura da peca), porque as
   * duas coisas contam eventos diferentes — uma e a maquina respirando, a outra e a peca nascendo.
   */
  public spawnSparks(count: number, from = 0.9): void {
    for (let i = 0; i < count; i += 1) {
      const spark = world3d()
        .objects.addBillboard(FX_DOT_TEXTURE, 0, {
          centered: true, additive: true, emissive: true, fog: false, depthWrite: false,
        })
        .setTint(i % 2 === 0 ? EMBER_HOT : EMBER)
        .setPosition(this.host.worldX + (Math.random() - 0.5) * 0.25, this.host.worldY + DEPTH_ITEM)
        .setElevation(from)
        .setDisplaySize(0.05, 0.05);
      this.host.sparks.add(spark);
      this.host.scene.tweens.add({
        targets: spark,
        elevation: from + 0.45 + Math.random() * 0.25,
        alpha: 0,
        duration: 620 + i * 90,
        ease: 'Quad.easeOut',
        onComplete: () => { this.host.sparks.delete(spark); spark.destroy(); },
      });
    }
  }
}
