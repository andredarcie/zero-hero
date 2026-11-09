// A HORTA DA SISI: os quatro canteiros (semear, regar, a noite que faz amanhecer pronto, colher a flor) e a arte de
// cada planta. As falas e o quadro são da PainterQuest.

import { getSoundManager } from '@/game/audio/SoundManager';
import type { PlantSpotObject } from '@/game/objects/PlantSpotObject';
import { DYE_KINDS, DYE_TINTS, GROW_LEVELS, GROW_STEP_MS, PLOT_COUNT, type DyeKind } from '@/game/quests/dyePlants';
import { DYE_BUD_TEXTURE, DYE_SPROUT_TEXTURE, dyeFlowerTexture } from '@/game/render3d/paintTextures';
import type { PainterQuest } from './PainterQuest';

export const SIZE_PLANT = 0.95;

/** O que PainterGarden usa de PainterQuest. */
export type PainterGardenHost = Pick<PainterQuest,
  'burst' | 'host' | 'save'
>;

export class PainterGarden {
  public constructor(private readonly host: PainterGardenHost) {}

  public plantTexture(kind: DyeKind, level: number): string {
    if (level >= GROW_LEVELS) return dyeFlowerTexture(kind);
    return level === 2 ? DYE_BUD_TEXTURE : DYE_SPROUT_TEXTURE;
  }

  public restorePlots(): void {
    for (const plot of this.host.save.plots) {
      if (plot.cut) continue;
      const spot = this.host.host.spotAt(plot.x, plot.y);
      if (!spot) continue;
      spot.restoreDye(plot.watered, plot.level, plot.level > 0 ? this.plantTexture(plot.kind, plot.level) : undefined, SIZE_PLANT);
    }
  }

  /**
   * UMA NOITE DE SONO (pedido do autor): o herói acorda e as plantas regadas amanheceram prontas. Só adianta o
   * relógio delas; o `update` sobe os níveis com o brilho de sempre e passa a etapa para a colheita.
   */
  public growOvernight(): void {
    for (const plot of this.host.save.plots) {
      if (plot.watered && !plot.cut) plot.growMs = Math.max(plot.growMs, GROW_LEVELS * GROW_STEP_MS);
    }
  }

  public sow(spot: PlantSpotObject, x: number, y: number): void {
    this.host.host.swing(x, y);
    this.host.host.scene.time.delayedCall(150, () => {
      if (this.host.host.held() !== 'dyeSeeds' || !spot.isHole || !spot.plant('dye')) return;
      const kind = DYE_KINDS[this.host.save.plots.length % PLOT_COUNT];
      this.host.save.plots.push({ x, y, kind, level: 0, growMs: 0, watered: false, cut: false });
      this.host.host.removeFromHand('dyeSeeds', 1);
      this.host.host.persist();
    });
  }

  /** A água pousou num monte desta quest. Devolve false se não é um canteiro dela. */
  public waterAt(spot: PlantSpotObject): boolean {
    if (spot.sownKind !== 'dye') return false;
    const plot = this.host.save.plots.find((p) => p.x === spot.worldX && p.y === spot.worldY);
    if (!plot || plot.watered || !spot.waterDye()) return true;
    plot.watered = true;
    if (this.host.save.stage === 'water' && this.host.save.plots.length >= PLOT_COUNT && this.host.save.plots.every((p) => p.watered)) {
      this.host.save.stage = 'grow';
    }
    this.host.host.persist();
    return true;
  }

  /** As flores vêm à mão, sem ferramenta: o que estiver nela cede o lugar, e o ramo cresce nas costas. */
  public pickFlowerAt(x: number, y: number): boolean {
    const plot = this.host.save.plots.find((p) => p.x === x && p.y === y && !p.cut && p.level >= GROW_LEVELS);
    const spot = plot && this.host.host.spotAt(x, y);
    if (!plot || !spot) return false;
    plot.cut = true;
    spot.clearDye();
    getSoundManager().work.playGrassCut();
    this.host.burst(x, y, DYE_TINTS[plot.kind], 10);
    const hero = this.host.host.hero();
    this.host.host.fling('dyeBundle', x, y, hero.x, hero.y);
    const picked = this.host.save.plots.filter((p) => p.cut).length;
    if (this.host.host.held() === 'dyeBundle') {
      this.host.host.takeIntoHand('dyeBundle', 1);
    } else {
      // O ramo pousado no chão volta junto: é um só.
      this.host.host.takeFromGround('dyeBundle');
      this.host.host.takeIntoHand('dyeBundle', picked);
    }
    if (picked >= PLOT_COUNT) this.host.host.itemGet('dyeBundle', () => {});
    else getSoundManager().ui.playItemStash();
    this.host.host.persist();
    return true;
  }

  public flowersReady(): boolean {
    return this.host.save.stage === 'harvest' && this.host.host.held() === 'dyeBundle' && this.host.save.plots.every((p) => p.cut);
  }
}
