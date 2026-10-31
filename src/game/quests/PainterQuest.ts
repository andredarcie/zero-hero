import type Phaser from 'phaser';

import { getSoundManager } from '@/game/audio/SoundManager';
import type { DialogScript } from '@/game/dialogs/NpcDialogs';
import type { HeldItemKind } from '@/game/entities/ItemPickup';
import { t, tLines, type I18nLine } from '@/game/i18n/i18n';
import type { PlantSpotObject } from '@/game/objects/PlantSpotObject';
import {
  DYE_KINDS, DYE_TINTS, GROW_LEVELS, GROW_STEP_MS, PLOT_COUNT, type DyeKind,
} from '@/game/quests/dyePlants';
import type { Billboard3D } from '@/game/render3d/Billboard3D';
import {
  DYE_BUD_TEXTURE, DYE_SPROUT_TEXTURE, EASEL_ART_TEXTURE, EASEL_BLANK_TEXTURE,
  dyeFlowerTexture, paintTableTexture, publishEaselArt,
} from '@/game/render3d/paintTextures';
import { FX_DOT_TEXTURE, world3d } from '@/game/render3d/World3D';
import { adventureState, type PaintQuestSave } from '@/game/runtime/adventureState';
import { PaintingOverlay, readPainting } from '@/game/runtime/PaintingOverlay';

/**
 * A QUEST DA IRIS, a única do jogo em etapas: a pá, as sementes, o balde, a espera, a faca, a mesa de
 * tintas e o quadro. Cada etapa é uma conversa, e a próxima só existe depois da anterior: o estado é
 * uma palavra no save (`stage`), mais os canteiros. Fechada, ela volta ao caminho comum das missões
 * (o evento `paint`, e daí o obrigado e o portão).
 *
 * Esta classe não conhece a cena, só o `PainterHost`: os gestos do mundo (mão, voar, pulo) são dela.
 */

export interface PainterHost {
  scene: Phaser.Scene;
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

const SIZE_TABLE = 1;
const SIZE_EASEL = 1.1;
const SIZE_PLANT = 0.95;
/** Pouca tinta, e tinta de sobra: "não sobrou um canto" tem de ser verdade, ela olha para o quadro. */
const COVERAGE_SPARSE = 0.06;
const COVERAGE_FULL = 0.8;

export class PainterQuest {
  private readonly save: PaintQuestSave;
  private table?: Billboard3D;
  private easel?: Billboard3D;
  private tableTile?: { x: number; y: number };
  private easelTile?: { x: number; y: number };
  private shovelTile?: { x: number; y: number };
  private npc?: { worldX: number; worldY: number };
  private overlay?: PaintingOverlay;
  private draft?: HTMLCanvasElement;
  private busy = false;

  public constructor(private readonly host: PainterHost) {
    this.save = adventureState().paintQuest;
    // Um save de quando a Iris só pedia dois canteiros: quem fechou aquele pedido está fechado.
    const progress = adventureState().questProgress;
    if ((progress.get('painter/grow') ?? 0) >= 2 && this.save.stage === 'start') {
      progress.set('painter/paint', 1);
      this.save.stage = 'done';
    }
  }

  // ── o lugar ─────────────────────────────────────────────────────────────────────────────────────

  /** A mesa e o quadro ao lado dela, em tiles escolhidos uma vez no boot. */
  public build(npc: { worldX: number; worldY: number }): void {
    this.npc = npc;
    const w3 = world3d();
    const pick = (offsets: ReadonlyArray<readonly [number, number]>, taken: Array<{ x: number; y: number } | undefined>): { x: number; y: number } | undefined => {
      for (const [dx, dy] of offsets) {
        const tile = { x: npc.worldX + dx, y: npc.worldY + dy };
        if (this.host.isFree(tile.x, tile.y) && !taken.some((o) => o?.x === tile.x && o.y === tile.y)) return tile;
      }
      return undefined;
    };
    // Nada diretamente atrás dela: o "!" e o keycap sobre a cabeça da Iris cairiam em cima do quadro.
    this.tableTile = pick([[-1, 0], [1, 0], [-1, -1], [1, -1]], []);
    this.easelTile = pick([[-2, 0], [2, 0], [-2, -1], [2, -1], [-2, 1], [2, 1]], [this.tableTile]);
    this.shovelTile = pick([[-1, 1], [1, 1], [-2, 1], [2, 1], [-2, 0], [2, 0]], [this.tableTile, this.easelTile]);
    if (this.tableTile) {
      this.table = w3.addBillboard(paintTableTexture(this.potsReady()), 0, { groundShadow: { rx: 0.42, rz: 0.2, alpha: 0.28 } })
        .setPosition(this.tableTile.x, this.tableTile.y)
        .setDisplaySize(SIZE_TABLE, SIZE_TABLE);
    }
    if (this.easelTile) {
      this.easel = w3.addBillboard(EASEL_BLANK_TEXTURE, 0, { groundShadow: { rx: 0.34, rz: 0.2, alpha: 0.28 } })
        .setPosition(this.easelTile.x, this.easelTile.y)
        .setDisplaySize(SIZE_EASEL, SIZE_EASEL);
    }
    this.restoreArt();
    this.restorePlots();
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

  private potsReady(): number {
    return this.save.stage === 'paint' || this.save.stage === 'done' ? PLOT_COUNT : 0;
  }

  private plantTexture(kind: DyeKind, level: number): string {
    if (level >= GROW_LEVELS) return dyeFlowerTexture(kind);
    return level === 2 ? DYE_BUD_TEXTURE : DYE_SPROUT_TEXTURE;
  }

  private restorePlots(): void {
    for (const plot of this.save.plots) {
      if (plot.cut) continue;
      const spot = this.host.spotAt(plot.x, plot.y);
      if (!spot) continue;
      spot.restoreDye(plot.watered, plot.level, plot.level > 0 ? this.plantTexture(plot.kind, plot.level) : undefined, SIZE_PLANT);
    }
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
      this.host.spotAt(plot.x, plot.y)?.setDyeLevel(this.plantTexture(plot.kind, level), SIZE_PLANT);
      this.host.sparkle(plot.x, plot.y);
      getSoundManager().playGrassCut();
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
    if (stage === 'harvest') return `painter:harvest:${this.host.held() === 'dyeBundle' ? 'ready' : 'wait'}`;
    return `painter:${stage}`;
  }

  public get isDone(): boolean {
    return this.save.stage === 'done';
  }

  // ── as conversas ────────────────────────────────────────────────────────────────────────────────

  /** Falar com ela. Devolve false quando a quest acabou: daí em diante é a conversa de sempre. */
  public talk(base: DialogScript, at: { worldX: number; worldY: number }): boolean {
    if (this.isDone) return false;
    const say = (lines: I18nLine[], onClosed?: () => void, onLine?: (index: number) => void): void => {
      this.host.say({ ...base, lines, onLine }, at, () => {
        onClosed?.();
        this.host.markHeard();
      });
    };
    const step = (key: string): I18nLine[] => tLines(`npc.painterStep.${key}`);
    const remaining = (key: string, n: number): I18nLine[] => step(key)
      .map((line) => ({ ...line, text: line.text.replace('{n}', String(n)) }));

    switch (this.save.stage) {
      case 'start':
        say(base.lines, () => {
          this.save.stage = 'dig';
          this.give('shovel', 1, at);
        });
        return true;
      case 'dig': {
        const left = PLOT_COUNT - this.host.dugHoles();
        if (left > 0) { say(remaining('dig', left), () => this.resupply('shovel', at)); return true; }
        this.returnShovel(at);
        say(step('seeds'), () => {
          this.save.stage = 'sow';
          this.give('dyeSeeds', PLOT_COUNT, at);
        });
        return true;
      }
      case 'sow': {
        const left = PLOT_COUNT - this.save.plots.length;
        if (left > 0) { say(remaining('sow', left), () => this.resupply('dyeSeeds', at, left)); return true; }
        say(step('bucket'), () => {
          this.save.stage = 'water';
          this.give('bucket', 1, at);
        });
        return true;
      }
      case 'water': {
        const left = this.save.plots.filter((plot) => !plot.watered).length;
        say(remaining('water', left), () => {
          if (this.host.held() !== 'bucket' && this.host.held() !== 'bucketFull' && !this.host.onGround('bucket') && !this.host.onGround('bucketFull')) this.give('bucket', 1, at);
        });
        return true;
      }
      case 'grow':
        say(step('wait'));
        return true;
      case 'harvest':
        if (this.host.held() === 'dyeBundle') { this.makePaint(base, at); return true; }
        if (this.save.plots.every((plot) => plot.cut)) { say(step('bring')); return true; }
        say(step('harvest'));
        return true;
      case 'paint':
        say(step('easel'), () => this.resupply('brush', at));
        return true;
      default:
        return false;
    }
  }

  /** O presente da etapa: voa dela para a mão, e o que é novo ganha a cerimônia. */
  private give(kind: HeldItemKind, units: number, at: { worldX: number; worldY: number }): void {
    const hero = this.host.hero();
    this.host.hop(at.worldX, at.worldY);
    this.host.fling(kind, at.worldX, at.worldY, hero.x, hero.y);
    this.host.takeIntoHand(kind, units);
    this.host.persist();
    this.host.itemGet(kind, () => {});
  }

  /** Perdeu de vista? Se a coisa não está na mão nem no chão, ela tem outra. */
  private resupply(kind: HeldItemKind, at: { worldX: number; worldY: number }, units = 1): void {
    if (this.host.held() === kind || this.host.onGround(kind)) return;
    this.give(kind, units, at);
  }

  /** A pá volta e fica ao lado dela, para quem quiser pegar de novo. */
  private returnShovel(at: { worldX: number; worldY: number }): void {
    const tile = this.shovelTile ?? { x: at.worldX, y: at.worldY + 1 };
    const hero = this.host.hero();
    const inHand = this.host.held() === 'shovel';
    if (inHand) this.host.removeFromHand('shovel', 1);
    else if (!this.host.takeFromGround('shovel')) return;
    if (inHand) this.host.fling('shovel', hero.x, hero.y, tile.x, tile.y);
    this.host.dropAt('shovel', tile.x, tile.y);
    getSoundManager().playItemStash();
    this.host.persist();
  }

  // ── os gestos no mundo ──────────────────────────────────────────────────────────────────────────

  /** O X: semente no buraco, faca na planta, pincel no quadro. */
  public useAt(x: number, y: number): boolean {
    const held = this.host.held();
    const spot = this.host.spotAt(x, y);
    if (held === 'dyeSeeds' && spot?.isHole) {
      this.sow(spot, x, y);
      return true;
    }
    if (this.cutAt(x, y)) return true;
    return this.openEaselAt(x, y);
  }

  /** O Z: a planta e o quadro respondem à mão também. */
  public interactAt(x: number, y: number): boolean {
    if (this.cutAt(x, y)) return true;
    return this.openEaselAt(x, y);
  }

  /** O que falta na mão para agir neste tile, nesta etapa. */
  public neededAt(x: number, y: number): HeldItemKind | null {
    const held = this.host.held();
    if (this.easelTile?.x === x && this.easelTile.y === y) return this.save.stage === 'paint' && held !== 'brush' ? 'brush' : null;
    if (this.save.plots.some((p) => p.x === x && p.y === y && !p.cut && p.level >= GROW_LEVELS)) return held === 'knife' ? null : 'knife';
    if (this.save.stage === 'sow' && this.save.plots.length < PLOT_COUNT && this.host.spotAt(x, y)?.isHole) return held === 'dyeSeeds' ? null : 'dyeSeeds';
    return null;
  }

  /** O keycap flutua sobre o que este gesto alcança agora. */
  public wantsKey(x: number, y: number): boolean {
    const held = this.host.held();
    if (this.easelTile?.x === x && this.easelTile.y === y) return this.save.stage === 'paint' && held === 'brush';
    return held === 'knife' && this.save.plots.some((p) => p.x === x && p.y === y && !p.cut && p.level >= GROW_LEVELS);
  }

  private sow(spot: PlantSpotObject, x: number, y: number): void {
    this.host.swing(x, y);
    this.host.scene.time.delayedCall(150, () => {
      if (this.host.held() !== 'dyeSeeds' || !spot.isHole || !spot.plant('dye')) return;
      const kind = DYE_KINDS[this.save.plots.length % PLOT_COUNT];
      this.save.plots.push({ x, y, kind, level: 0, growMs: 0, watered: false, cut: false });
      this.host.removeFromHand('dyeSeeds', 1);
      this.host.persist();
    });
  }

  /** A água pousou num monte desta quest. Devolve false se não é um canteiro dela. */
  public waterAt(spot: PlantSpotObject): boolean {
    if (spot.sownKind !== 'dye') return false;
    const plot = this.save.plots.find((p) => p.x === spot.worldX && p.y === spot.worldY);
    if (!plot || plot.watered || !spot.waterDye()) return true;
    plot.watered = true;
    if (this.save.stage === 'water' && this.save.plots.length >= PLOT_COUNT && this.save.plots.every((p) => p.watered)) {
      this.save.stage = 'grow';
    }
    this.host.persist();
    return true;
  }

  private cutAt(x: number, y: number): boolean {
    const plot = this.save.plots.find((p) => p.x === x && p.y === y && !p.cut && p.level >= GROW_LEVELS);
    const spot = plot && this.host.spotAt(x, y);
    if (!plot || !spot) return false;
    if (this.host.held() !== 'knife') {
      spot.shakeDye();
      return true;
    }
    this.host.swing(x, y);
    this.host.scene.time.delayedCall(120, () => {
      if (plot.cut || this.host.held() !== 'knife') return;
      plot.cut = true;
      spot.clearDye();
      getSoundManager().playMushroomCut();
      this.burst(x, y, DYE_TINTS[plot.kind], 10);
      if (this.save.plots.every((p) => p.cut)) this.bundleUp();
      this.host.persist();
    });
    return true;
  }

  /** A última flor cortada: o ramo vai às costas, e a faca volta para a Hollis, como no cogumelo. */
  private bundleUp(): void {
    this.host.removeFromHand('knife', 1);
    this.host.takeIntoHand('dyeBundle', 1);
    this.host.persist();
    this.host.itemGet('dyeBundle', () => {});
  }

  /** A MESA: as flores viram tinta, uma planta por fala, e os potes enchem junto. */
  private makePaint(base: DialogScript, at: { worldX: number; worldY: number }): void {
    const hero = this.host.hero();
    const tile = this.tableTile ?? { x: at.worldX, y: at.worldY };
    this.host.removeFromHand('dyeBundle', 1);
    this.host.fling('dyeBundle', hero.x, hero.y, tile.x, tile.y);
    getSoundManager().playItemStash();
    const lines: I18nLine[] = [
      ...tLines('npc.painterMake.intro'),
      ...DYE_KINDS.flatMap((kind) => tLines(`npc.painterMake.${kind}`)),
      ...tLines('npc.painterMake.binder'),
      ...tLines('npc.painterMake.brush'),
    ];
    const introLines = tLines('npc.painterMake.intro').length;
    this.host.say({
      ...base,
      lines,
      onLine: (index) => {
        const dye = DYE_KINDS[index - introLines];
        if (!dye) return;
        this.fillPots(index - introLines + 1, tile, DYE_TINTS[dye]);
      },
    }, at, () => {
      this.save.stage = 'paint';
      this.table?.setTexture(paintTableTexture(PLOT_COUNT), 0);
      this.give('brush', 1, at);
      this.host.markHeard();
    });
  }

  private fillPots(filled: number, tile: { x: number; y: number }, tint: number): void {
    this.table?.setTexture(paintTableTexture(filled), 0);
    this.burst(tile.x, tile.y, tint, 14);
    getSoundManager().playFurnaceBreath();
    const table = this.table;
    if (!table) return;
    // A mesa trabalha: um socão do pilão, em altura, sem esticar a arte.
    this.host.scene.tweens.killTweensOf(table);
    table.setDisplaySize(SIZE_TABLE, SIZE_TABLE);
    this.host.scene.tweens.add({
      targets: table, displayHeight: SIZE_TABLE * 0.9, displayWidth: SIZE_TABLE * 1.05, duration: 90, yoyo: true, repeat: 2, ease: 'Sine.easeInOut',
    });
  }

  private burst(x: number, y: number, tint: number, count: number): void {
    const w3 = world3d();
    for (let i = 0; i < count; i += 1) {
      const mote = w3.addBillboard(FX_DOT_TEXTURE, 0, { depthLayer: 'ground', emissive: true })
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

  private openEaselAt(x: number, y: number): boolean {
    if (this.easelTile?.x !== x || this.easelTile.y !== y) return false;
    if (this.save.stage !== 'paint') {
      if (this.save.stage !== 'done') this.host.scene.tweens.add({ targets: this.easel, elevation: 0.05, duration: 70, yoyo: true });
      return true;
    }
    if (this.host.held() !== 'brush') return true;
    if (this.overlay || this.busy) return true;
    this.host.freeze(true);
    this.host.showButtons(false);
    const sound = getSoundManager();
    sound.playPaperUnfold();
    this.overlay = new PaintingOverlay({
      onStroke: () => sound.playSandTrickle(),
      onPick: () => sound.playItemBonk(),
      onCancel: (canvas) => {
        this.draft = canvas;
        this.closeEasel();
      },
      onDone: (canvas) => this.finishPainting(canvas),
    }, this.draft);
    return true;
  }

  private closeEasel(): void {
    this.overlay?.destroy();
    this.overlay = undefined;
    this.host.freeze(false);
    this.host.showButtons(true);
  }

  /** Terminou: o desenho vai ao quadro e ao save, ela comenta, agradece e pega o pincel de volta. */
  private finishPainting(canvas: HTMLCanvasElement): void {
    const reading = readPainting(canvas);
    publishEaselArt(canvas);
    this.easel?.setTexture(EASEL_ART_TEXTURE, 0);
    this.save.art = canvas.toDataURL('image/png');
    this.draft = undefined;
    this.busy = true;
    this.closeEasel();
    this.host.persist();
    const at = this.npc;
    if (!at) return;
    const scriptLines = this.reviewLines(reading);
    this.host.say({ ...this.dialogBase(), lines: scriptLines }, at, () => {
      const hero = this.host.hero();
      this.host.removeFromHand('brush', 1);
      this.host.fling('brush', hero.x, hero.y, at.worldX, at.worldY);
      getSoundManager().playItemStash();
      this.host.hop(at.worldX, at.worldY, 0.34);
      this.host.hearts(at.worldX, at.worldY);
      this.save.stage = 'done';
      this.busy = false;
      this.host.persist();
      this.host.closeQuest();
      this.host.markHeard();
    });
  }

  private dialogBase: () => DialogScript = () => ({ npcName: '', npcColorHex: '#ffffff', npcAssetKey: '', lines: [] });

  public setDialogBase(read: () => DialogScript): void {
    this.dialogBase = read;
  }

  /** O comentário lê o desenho de verdade: quanto cobriu e que cor mandou. */
  private reviewLines(reading: ReturnType<typeof readPainting>): I18nLine[] {
    const form = reading.coverage < COVERAGE_SPARSE ? 'sparse' : reading.coverage > COVERAGE_FULL ? 'full' : 'middle';
    const color = reading.used.length >= DYE_KINDS.length ? 'all' : reading.dominant;
    return [
      { speaker: 'npc', text: t(`npc.painterReview.form.${form}`) },
      { speaker: 'npc', text: t(`npc.painterReview.color.${color}`) },
      ...tLines('npc.painterReview.thanks'),
    ];
  }
}
