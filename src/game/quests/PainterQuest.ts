import type * as Engine from '@/game/engine';

import { getSoundManager } from '@/game/audio/SoundManager';
import type { DialogScript } from '@/game/dialogs/NpcDialogs';
import type { HeldItemKind } from '@/game/entities/ItemPickup';

import type { PlantSpotObject } from '@/game/objects/PlantSpotObject';
import { GROW_LEVELS, GROW_STEP_MS, PLOT_COUNT } from '@/game/quests/dyePlants';
import type { Billboard3D } from '@/game/render3d/Billboard3D';
import { EASEL_ART_TEXTURE, EASEL_BLANK_TEXTURE, paintTableTexture, publishEaselArt } from '@/game/render3d/paintTextures';
import { FX_DOT_TEXTURE, world3d } from '@/game/render3d/World3D';
import { adventureState, type PaintQuestSave } from '@/game/runtime/adventureState';
import { PaintingOverlay } from '@/game/runtime/PaintingOverlay';
import { PainterGarden, SIZE_PLANT } from './PainterGarden';
import { PainterStudio, SIZE_TABLE, SIZE_EASEL, EASEL_SPOTS } from './PainterStudio';
import { PainterTalk } from './PainterTalk';

/**
 * A QUEST DA SISI, a única do jogo em etapas: a pá, as sementes, o balde, a espera, a colheita com as
 * mãos, a mesa de tintas e o quadro, que ela só arma com as tintas prontas. Cada etapa é uma conversa, e
 * a próxima só existe depois da anterior: o estado é uma palavra no save (`stage`), mais os canteiros. Fechada, ela volta ao caminho comum das missões
 * (o evento `paint`, e daí o obrigado e o portão).
 *
 * Esta classe não conhece a cena, só o `PainterHost`: os gestos do mundo (mão, voar, pulo) são dela.
 */

export interface PainterHost {
  scene: Engine.Scene;
  held: () => HeldItemKind | 'none';
  heldCount: (kind: HeldItemKind) => number;
  takeIntoHand: (kind: HeldItemKind, units: number) => void;
  removeFromHand: (kind: HeldItemKind, units: number) => void;
  /** Tira do chão a primeira coisa desse tipo, onde estiver. */
  takeFromGround: (kind: HeldItemKind) => boolean;
  onGround: (kind: HeldItemKind) => boolean;
  dropAt: (kind: HeldItemKind, x: number, y: number) => void;
  hero: () => { x: number; y: number };
  isFree: (x: number, y: number) => boolean;
  fling: (kind: HeldItemKind, fromX: number, fromY: number, toX: number, toY: number) => void;
  /** Os buracos abertos que a pá cavou. */
  dugHoles: () => number;
  spotAt: (x: number, y: number) => PlantSpotObject | undefined;
  swing: (x: number, y: number) => void;
  say: (script: DialogScript, at: { worldX: number; worldY: number }, onClosed?: () => void) => void;
  itemGet: (kind: HeldItemKind, onDone: () => void) => void;
  hop: (x: number, y: number, height?: number) => void;
  hearts: (x: number, y: number) => void;
  sparkle: (x: number, y: number) => void;
  freeze: (frozen: boolean) => void;
  showButtons: (visible: boolean) => void;
  persist: () => void;
  closeQuest: () => void;
  markHeard: () => void;
}

export class PainterQuest {
  public readonly save: PaintQuestSave;
  public table?: Billboard3D;
  public easel?: Billboard3D;
  public tableTile?: { x: number; y: number };
  public easelTile?: { x: number; y: number };
  public shovelTile?: { x: number; y: number };
  public npc?: { worldX: number; worldY: number };
  public overlay?: PaintingOverlay;

  public constructor(public readonly host: PainterHost) {
    this.save = adventureState().paintQuest;
    // Um save de quando a Sisi só pedia dois canteiros: quem fechou aquele pedido está fechado.
    const progress = adventureState().questProgress;
    if ((progress.get('painter/grow') ?? 0) >= 2 && this.save.stage === 'start') {
      progress.set('painter/paint', 1);
      this.save.stage = 'done';
    }
  }

  // ── o lugar ─────────────────────────────────────────────────────────────────────────────────────

  /** A mesa ao lado dela, em tile escolhido uma vez no boot. O quadro só vem depois das tintas. */
  public build(npc: { worldX: number; worldY: number }): void {
    this.npc = npc;
    const w3 = world3d();
    this.tableTile = this.pick([[-1, 0], [1, 0], [-1, -1], [1, -1]], []);
    this.shovelTile = this.pick([[-1, 1], [1, 1], [-2, 1], [2, 1], [-2, 0], [2, 0]], [this.tableTile]);
    if (this.tableTile) {
      this.table = w3.objects.addBillboard(paintTableTexture(this.potsReady()), 0, { groundShadow: { rx: 0.42, rz: 0.2, alpha: 0.28 } })
        .setPosition(this.tableTile.x, this.tableTile.y)
        .setDisplaySize(SIZE_TABLE, SIZE_TABLE);
    }
    if (this.hasEasel()) {
      const tile = this.save.easel ?? this.pick(EASEL_SPOTS, [this.tableTile]);
      if (tile) {
        this.save.easel = tile;
        this.showEasel(tile);
      }
    }
    this.restoreArt();
    this.garden.restorePlots();
  }

  public destroy(): void {
    this.overlay?.destroy();
    this.overlay = undefined;
    this.table?.destroy();
    this.easel?.destroy();
  }

  public isSolidAt(x: number, y: number): boolean {
    return (this.tableTile?.x === x && this.tableTile.y === y) || (this.easelTile?.x === x && this.easelTile.y === y);
  }

  private hasEasel(): boolean {
    return this.save.stage === 'paint' || this.save.stage === 'review' || this.save.stage === 'done';
  }

  private potsReady(): number {
    return this.hasEasel() ? PLOT_COUNT : 0;
  }

  public pick(offsets: ReadonlyArray<readonly [number, number]>, taken: Array<{ x: number; y: number } | undefined>): { x: number; y: number } | undefined {
    const { npc } = this;
    if (!npc) return undefined;
    for (const [dx, dy] of offsets) {
      const tile = { x: npc.worldX + dx, y: npc.worldY + dy };
      if (this.host.isFree(tile.x, tile.y) && !taken.some((o) => o?.x === tile.x && o.y === tile.y)) return tile;
    }
    return undefined;
  }

  public showEasel(tile: { x: number; y: number }): void {
    this.easelTile = tile;
    this.easel = world3d().objects.addBillboard(EASEL_BLANK_TEXTURE, 0, { groundShadow: { rx: 0.34, rz: 0.2, alpha: 0.28 } })
      .setPosition(tile.x, tile.y)
      .setDisplaySize(SIZE_EASEL, SIZE_EASEL);
  }

  private restoreArt(): void {
    if (!this.save.art) return;
    const image = document.createElement('img');
    image.onload = () => {
      publishEaselArt(image);
      this.easel?.setTexture(EASEL_ART_TEXTURE, 0);
    };
    image.src = this.save.art;
  }

  // ── o tempo ─────────────────────────────────────────────────────────────────────────────────────

  /** As plantas crescem no tempo do jogo: três níveis, e cada um avisa com um brilho. */
  public update(delta: number): void {
    let changed = false;
    for (const plot of this.save.plots) {
      if (!plot.watered || plot.cut || plot.level >= GROW_LEVELS) continue;
      plot.growMs += delta;
      const level = Math.min(GROW_LEVELS, Math.floor(plot.growMs / GROW_STEP_MS));
      if (level <= plot.level) continue;
      plot.level = level;
      changed = true;
      this.host.spotAt(plot.x, plot.y)?.setDyeLevel(this.garden.plantTexture(plot.kind, level), SIZE_PLANT);
      this.host.sparkle(plot.x, plot.y);
      getSoundManager().work.playGrassCut();
    }
    if (!changed) return;
    if (this.save.stage === 'grow' && this.save.plots.every((plot) => plot.level >= GROW_LEVELS)) this.save.stage = 'harvest';
    this.host.persist();
  }

  // ── o que muda o "!" sobre ela ──────────────────────────────────────────────────────────────────

  public talkKey(): string {
    const { stage } = this.save;
    if (stage === 'dig') return `painter:dig:${this.host.dugHoles() >= PLOT_COUNT ? 'ready' : 'wait'}`;
    if (stage === 'sow') return `painter:sow:${this.save.plots.length >= PLOT_COUNT ? 'ready' : 'wait'}`;
    if (stage === 'harvest') return `painter:harvest:${this.garden.flowersReady() ? 'ready' : 'wait'}`;
    return `painter:${stage}`;
  }

  public get isDone(): boolean {
    return this.save.stage === 'done';
  }

  // ── as conversas ────────────────────────────────────────────────────────────────────────────────

  /** O presente da etapa: voa dela para a mão, e o que é novo ganha a cerimônia. */
  public give(kind: HeldItemKind, units: number, at: { worldX: number; worldY: number }): void {
    const hero = this.host.hero();
    this.host.hop(at.worldX, at.worldY);
    this.host.fling(kind, at.worldX, at.worldY, hero.x, hero.y);
    this.host.takeIntoHand(kind, units);
    this.host.persist();
    this.host.itemGet(kind, () => {});
  }

  /** Perdeu de vista? Se a coisa não está na mão nem no chão, ela tem outra. */
  public resupply(kind: HeldItemKind, at: { worldX: number; worldY: number }, units = 1): void {
    if (this.host.held() === kind || this.host.onGround(kind)) return;
    this.give(kind, units, at);
  }

  // ── os gestos no mundo ──────────────────────────────────────────────────────────────────────────

  /** O X: semente no buraco, mão na flor, flores na mesa, pincel no quadro. */
  public useAt(x: number, y: number): boolean {
    const held = this.host.held();
    const spot = this.host.spotAt(x, y);
    if (held === 'dyeSeeds' && spot?.isHole) {
      this.garden.sow(spot, x, y);
      return true;
    }
    return this.interactAt(x, y);
  }

  /** O Z: a flor, a mesa e o quadro respondem à mão. */
  public interactAt(x: number, y: number): boolean {
    if (this.garden.pickFlowerAt(x, y)) return true;
    if (this.studio.useTableAt(x, y)) return true;
    return this.studio.openEaselAt(x, y);
  }

  /** O que falta na mão para agir neste tile, nesta etapa. */
  public neededAt(x: number, y: number): HeldItemKind | null {
    const held = this.host.held();
    if (this.easelTile?.x === x && this.easelTile.y === y) return this.save.stage === 'paint' && held !== 'brush' ? 'brush' : null;
    if (this.tableTile?.x === x && this.tableTile.y === y) return this.save.stage === 'harvest' && !this.garden.flowersReady() ? 'dyeBundle' : null;
    if (this.save.stage === 'sow' && this.save.plots.length < PLOT_COUNT && this.host.spotAt(x, y)?.isHole) return held === 'dyeSeeds' ? null : 'dyeSeeds';
    return null;
  }

  /** O gesto da mão neste tile agora, se houver: a mesma pergunta que o botão faz. */
  public actionAt(x: number, y: number): string | null {
    const held = this.host.held();
    if (this.easelTile?.x === x && this.easelTile.y === y) return this.save.stage === 'paint' && held === 'brush' ? 'paint' : null;
    if (this.tableTile?.x === x && this.tableTile.y === y) return this.garden.flowersReady() ? 'mix' : null;
    return this.save.plots.some((p) => p.x === x && p.y === y && !p.cut && p.level >= GROW_LEVELS) ? 'pick' : null;
  }

  public burst(x: number, y: number, tint: number, count: number): void {
    const w3 = world3d();
    for (let i = 0; i < count; i += 1) {
      const mote = w3.objects.addBillboard(FX_DOT_TEXTURE, 0, { depthLayer: 'ground', emissive: true })
        .setTint(tint)
        .setPosition(x + (Math.random() - 0.5) * 0.5, y)
        .setElevation(0.4)
        .setDisplaySize(0.11, 0.11);
      this.host.scene.tweens.add({
        targets: mote,
        x: mote.x + (Math.random() - 0.5) * 1.1,
        elevation: 0.7 + Math.random() * 0.7,
        alpha: 0,
        duration: 480 + Math.random() * 300,
        ease: 'Sine.easeOut',
        onComplete: () => mote.destroy(),
      });
    }
  }

  // ── o quadro ────────────────────────────────────────────────────────────────────────────────────

  public dialogBase: () => DialogScript = () => ({ npcName: '', npcColorHex: '#ffffff', npcAssetKey: '', lines: [] });
  /** Os canteiros de tinta. (ver PainterGarden) */
  public readonly garden = new PainterGarden(this);
  /** A mesa das tintas e o cavalete. (ver PainterStudio) */
  public readonly studio = new PainterStudio(this);
  /** As conversas de cada etapa. (ver PainterTalk) */
  private readonly talker = new PainterTalk(this);

  public setDialogBase(read: () => DialogScript): void {
    this.dialogBase = read;
  }

  /** (ver PainterGarden.growOvernight) */
  public growOvernight(...args: Parameters<PainterGarden['growOvernight']>): ReturnType<PainterGarden['growOvernight']> {
    return this.garden.growOvernight(...args);
  }

  /** (ver PainterGarden.waterAt) */
  public waterAt(...args: Parameters<PainterGarden['waterAt']>): ReturnType<PainterGarden['waterAt']> {
    return this.garden.waterAt(...args);
  }

  /** (ver PainterTalk.talk) */
  public talk(...args: Parameters<PainterTalk['talk']>): ReturnType<PainterTalk['talk']> {
    return this.talker.talk(...args);
  }
}
