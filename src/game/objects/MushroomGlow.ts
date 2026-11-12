import type * as Engine from '@/game/engine';

import { FUNGUS_SPECS, fungusTextureKey, type MushroomKind } from '@/game/fungi/fungi';
import type { Billboard3D } from '@/game/render3d/Billboard3D';
import { FX_DOT_TEXTURE, world3d } from '@/game/render3d/World3D';

/**
 * O COGUMELO QUE BRILHA (pedido do autor, 2026-11-11: mais cogumelos opcionais, nas áreas do vale onde não havia nada
 * para fazer). O cogumelo-da-oliveira (Omphalotus olearius) é bioluminescente de verdade: as lamelas acendem num verde
 * fraco no escuro. Aqui isso é o gesto dele: de dia é um tufo laranja no pé das árvores; DE NOITE ele acende no meio da
 * mata, e quem anda no escuro vê a luz de longe e vai atrás.
 *
 * Nenhuma luz nova no mundo (a regra do projeto): é um halo somado no chão, e a própria arte do cogumelo somada por
 * cima, em verde. Os dois vêm com a noite, devagar no fim da tarde e no começo da manhã, e somem quando ele é colhido.
 */

/** O fim da tarde e o começo da manhã: a rampa em que o brilho chega e vai (frações do dia). */
const DUSK = [0.7, 0.78] as const;
const DAWN = [0.22, 0.3] as const;
/** O halo no chão em volta dele, e a arte somada por cima, no máximo da noite. */
const HALO_SIZE = 1.5;
const HALO_ALPHA = 0.5;
const GLOW_ALPHA = 0.55;
const GLOW_TINT = 0x9dff7a;
/** A respiração do brilho: um fungo vivo, não uma lâmpada. */
const PULSE_MS = 2400;
/** O tamanho do cogumelo no chão (entities/ItemPickup, GROUND_SIZE): a arte somada cai exatamente em cima dele. */
const ITEM_SIZE = 0.75;

const smooth = (a: number, b: number, t: number): number => {
  const k = Math.min(1, Math.max(0, (t - a) / (b - a)));
  return k * k * (3 - 2 * k);
};

/** Quanto é noite agora, de 0 (dia) a 1 (noite fechada), pela hora do dia (0..1). */
export const nightAmount = (time: number): number => Math.max(smooth(DUSK[0], DUSK[1], time), 1 - smooth(DAWN[0], DAWN[1], time));

export interface GlowMushroom {
  kind: MushroomKind;
  worldX: number;
  worldY: number;
}

/** As espécies que brilham, entre as que ainda estão no chão. */
export const glowingOf = (mushrooms: readonly GlowMushroom[]): GlowMushroom[] => mushrooms.filter((m) => FUNGUS_SPECS[m.kind].glows);

export class MushroomGlow {
  private readonly byKind = new Map<MushroomKind, { halo: Billboard3D; glow: Billboard3D }>();

  public constructor(private readonly scene: Engine.Scene, mushrooms: readonly GlowMushroom[]) {
    const w3 = world3d();
    for (const m of glowingOf(mushrooms)) {
      const halo = w3.objects.addBillboard(FX_DOT_TEXTURE, 0, { centered: true, fog: false, depthWrite: false, additive: true, alphaTest: 0.02 })
        .setTint(GLOW_TINT)
        .setPosition(m.worldX, m.worldY)
        .setElevation(0.3)
        .setDisplaySize(HALO_SIZE, HALO_SIZE)
        .setAlpha(0);
      const glow = w3.objects.addBillboard(fungusTextureKey(m.kind), 0, { fog: false, depthWrite: false, additive: true })
        .setTint(GLOW_TINT)
        .setPosition(m.worldX, m.worldY + 0.005)
        .setDisplaySize(ITEM_SIZE, ITEM_SIZE)
        .setAlpha(0);
      this.byKind.set(m.kind, { halo, glow });
    }
  }

  /** Quantas espécies estão brilhando no chão agora (a janela do playtest). */
  public get count(): number {
    return this.byKind.size;
  }

  /** O brilho de agora (0..1) da espécie, ou 0 se ela não está no chão. */
  public level(kind: MushroomKind): number {
    const g = this.byKind.get(kind);
    return g ? g.halo.alpha / HALO_ALPHA : 0;
  }

  /** A cada quadro: a noite que está fazendo, e a respiração. */
  public update(time: number): void {
    if (this.byKind.size === 0) return;
    const night = nightAmount(time);
    const pulse = 0.82 + 0.18 * Math.sin((this.scene.time.now / PULSE_MS) * Math.PI * 2);
    for (const { halo, glow } of this.byKind.values()) {
      halo.setAlpha(HALO_ALPHA * night * pulse);
      glow.setAlpha(GLOW_ALPHA * night * pulse);
    }
  }

  /** Colhido: o brilho sai junto (cada espécie existe uma vez e não renasce). */
  public wither(kind: MushroomKind): void {
    const g = this.byKind.get(kind);
    if (!g) return;
    this.byKind.delete(kind);
    g.halo.destroy();
    g.glow.destroy();
  }

  public destroy(): void {
    for (const { halo, glow } of this.byKind.values()) {
      halo.destroy();
      glow.destroy();
    }
    this.byKind.clear();
  }
}
