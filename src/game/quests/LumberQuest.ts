import type Phaser from 'phaser';

import { getSoundManager } from '@/game/audio/SoundManager';
import type { DialogScript } from '@/game/dialogs/NpcDialogs';
import type { HeldItemKind } from '@/game/entities/ItemPickup';
import { t, tLines, type I18nLine } from '@/game/i18n/i18n';
import type { CampfireObject } from '@/game/objects/CampfireObject';
import type { Billboard3D } from '@/game/render3d/Billboard3D';
import {
  WOOD_STACK_TEXTURE, chopBlockTexture, publishStack,
} from '@/game/render3d/woodTextures';
import { world3d } from '@/game/render3d/World3D';
import { adventureState, type LumberQuestSave } from '@/game/runtime/adventureState';
import {
  FireLayOverlay, LOGS_TO_SPLIT, SplitOverlay, StackOverlay, stackAir,
} from '@/game/runtime/WoodcraftOverlays';

/**
 * A QUEST DO BRAM: fazer um fogo que dura. Ele não precisa de gravetos, precisa de lenha, e lenha é
 * um ofício: madeira morta, rachada no veio, empilhada com o ar passando, seca no tempo, e um fogo
 * montado na ordem certa. O estado é uma palavra no save (`stage`), mais o que o jogador fez em cada
 * etapa: é sobre isso que o Bram comenta no fim. Quanto ar a pilha deixa passar muda de verdade o
 * tempo de secar.
 *
 * A fogueira dele fica APAGADA e não segue o relógio até o fim: é o pedido inteiro. Depois ela fica
 * acesa para sempre, com a pilha que o jogador montou ao lado.
 */

export interface LumberHost {
  scene: Phaser.Scene;
  held: () => HeldItemKind | 'none';
  takeIntoHand: (kind: HeldItemKind, units: number) => void;
  removeFromHand: (kind: HeldItemKind, units: number) => void;
  onGround: (kind: HeldItemKind) => boolean;
  hero: () => { x: number; y: number };
  isFree: (x: number, y: number) => boolean;
  fling: (kind: HeldItemKind, fromX: number, fromY: number, toX: number, toY: number) => void;
  say: (script: DialogScript, at: { worldX: number; worldY: number }, onClosed?: () => void) => void;
  itemGet: (kind: HeldItemKind, onDone: () => void) => void;
  think: (texture: string) => void;
  hop: (x: number, y: number, height?: number) => void;
  hearts: (x: number, y: number) => void;
  sparkle: (x: number, y: number) => void;
  freeze: (frozen: boolean) => void;
  showButtons: (visible: boolean) => void;
  persist: () => void;
  closeQuest: () => void;
  markHeard: () => void;
  fireNear: (x: number, y: number) => CampfireObject | undefined;
  keepFireLit: (fire: CampfireObject) => void;
}

const WOOD_NEEDED = LOGS_TO_SPLIT;
/** Do pior ao melhor empilhamento: pilha apertada leva bem mais tempo para secar. */
const DRY_SLOW_MS = 150000;
const DRY_FAST_MS = 60000;
const DRY_TONES = 3;
const AXE_ICON = 'axe-icon';
const SIZE_BLOCK = 0.9;
const SIZE_RACK = 1.15;

const COMMENT_GOOD_AIR = 0.75;
const COMMENT_BAD_AIR = 0.45;

export class LumberQuest {
  private readonly save: LumberQuestSave;
  private block?: Billboard3D;
  private rack?: Billboard3D;
  private blockTile?: { x: number; y: number };
  private rackTile?: { x: number; y: number };
  private npc?: { worldX: number; worldY: number };
  private fire?: CampfireObject;
  private overlay?: { destroy: () => void };
  private dialogBase: () => DialogScript = () => ({ npcName: '', npcColorHex: '#ffffff', npcAssetKey: '', lines: [] });

  public constructor(private readonly host: LumberHost) {
    this.save = adventureState().lumberQuest;
    // Um save de quando o Bram só pedia quatro gravetos: quem fechou aquele pedido está fechado.
    const progress = adventureState().questProgress;
    if ((progress.get('businessMan/deliver:wood') ?? 0) >= 4 && this.save.stage === 'start') {
      progress.set('businessMan/fire', 1);
      this.save.stage = 'done';
    }
  }

  public setDialogBase(read: () => DialogScript): void {
    this.dialogBase = read;
  }

  // ── o lugar ─────────────────────────────────────────────────────────────────────────────────────

  public build(npc: { worldX: number; worldY: number }): void {
    this.npc = npc;
    const pick = (offsets: ReadonlyArray<readonly [number, number]>, taken?: { x: number; y: number }): { x: number; y: number } | undefined => {
      for (const [dx, dy] of offsets) {
        const tile = { x: npc.worldX + dx, y: npc.worldY + dy };
        if (this.host.isFree(tile.x, tile.y) && !(taken?.x === tile.x && taken.y === tile.y)) return tile;
      }
      return undefined;
    };
    this.blockTile = pick([[-1, 0], [-1, 1], [1, 1], [-2, 0]]);
    this.rackTile = pick([[-2, 0], [-3, 0], [-2, 1], [2, 1], [-1, 1]], this.blockTile);
    const w3 = world3d();
    if (this.blockTile) {
      this.block = w3.addBillboard(chopBlockTexture(this.blockLogs()), 0, { groundShadow: { rx: 0.34, rz: 0.2, alpha: 0.28 } })
        .setPosition(this.blockTile.x, this.blockTile.y)
        .setDisplaySize(SIZE_BLOCK, SIZE_BLOCK);
    }
    if (this.rackTile) {
      publishStack(this.save.heights, this.dryTone());
      this.rack = w3.addBillboard(WOOD_STACK_TEXTURE, 0, { groundShadow: { rx: 0.42, rz: 0.2, alpha: 0.28 } })
        .setPosition(this.rackTile.x, this.rackTile.y)
        .setDisplaySize(SIZE_RACK, SIZE_RACK);
    }
    this.fire = this.host.fireNear(npc.worldX, npc.worldY);
    if (this.isDone) {
      if (this.fire) this.host.keepFireLit(this.fire);
    } else if (this.fire) {
      this.fire.setHeldCold(true);
    }
  }

  public destroy(): void {
    this.overlay?.destroy();
    this.overlay = undefined;
    this.block?.destroy();
    this.rack?.destroy();
  }

  public isSolidAt(x: number, y: number): boolean {
    return (this.blockTile?.x === x && this.blockTile.y === y) || (this.rackTile?.x === x && this.rackTile.y === y);
  }

  public get isDone(): boolean {
    return this.save.stage === 'done';
  }

  private blockLogs(): number {
    if (this.save.stage === 'chop') return this.save.wood;
    return this.save.stage === 'split' ? WOOD_NEEDED - this.save.split : 0;
  }

  private dryMs(): number {
    return DRY_SLOW_MS + (DRY_FAST_MS - DRY_SLOW_MS) * this.save.air;
  }

  private dryTone(): number {
    if (this.save.stage === 'lay' || this.isDone) return DRY_TONES;
    return Math.min(DRY_TONES, Math.floor((this.save.dryMs / this.dryMs()) * DRY_TONES));
  }

  // ── o tempo ─────────────────────────────────────────────────────────────────────────────────────

  public update(delta: number): void {
    if (this.save.stage !== 'dry') return;
    const before = this.dryTone();
    this.save.dryMs += delta;
    const after = this.dryTone();
    if (after === before) return;
    publishStack(this.save.heights, after);
    this.rack?.setTexture(WOOD_STACK_TEXTURE, 0);
    if (this.rackTile) this.host.sparkle(this.rackTile.x, this.rackTile.y);
    if (after >= DRY_TONES) this.save.stage = 'lay';
    this.host.persist();
  }

  public talkKey(): string {
    return `businessMan:${this.save.stage}`;
  }

  // ── as conversas ────────────────────────────────────────────────────────────────────────────────

  public talk(base: DialogScript, at: { worldX: number; worldY: number }): boolean {
    if (this.isDone) return false;
    const say = (lines: I18nLine[], onClosed?: () => void): void => {
      this.host.say({ ...base, lines }, at, () => {
        onClosed?.();
        this.host.markHeard();
      });
    };
    const step = (key: string): I18nLine[] => tLines(`npc.businessManStep.${key}`);
    switch (this.save.stage) {
      case 'start':
        say(base.lines, () => {
          this.save.stage = 'chop';
          this.give('axe', at);
        });
        return true;
      case 'chop':
        say(step('chop').map((line) => ({ ...line, text: line.text.replace('{n}', String(WOOD_NEEDED - this.save.wood)) })), () => this.resupply('axe', at));
        return true;
      case 'split':
        say(step('split'), () => this.resupply('axe', at));
        return true;
      case 'stack':
        say(step('stack'));
        return true;
      case 'dry':
        say(step(this.save.air >= COMMENT_GOOD_AIR ? 'dryFast' : this.save.air < COMMENT_BAD_AIR ? 'drySlow' : 'dry'));
        return true;
      case 'lay':
        say(step('lay'));
        return true;
      default:
        return false;
    }
  }

  private give(kind: HeldItemKind, at: { worldX: number; worldY: number }): void {
    const hero = this.host.hero();
    this.host.hop(at.worldX, at.worldY);
    this.host.fling(kind, at.worldX, at.worldY, hero.x, hero.y);
    this.host.takeIntoHand(kind, 1);
    this.host.persist();
    this.host.itemGet(kind, () => {});
  }

  private resupply(kind: HeldItemKind, at: { worldX: number; worldY: number }): void {
    if (this.host.held() === kind || this.host.onGround(kind)) return;
    this.give(kind, at);
  }

  // ── os gestos no mundo ──────────────────────────────────────────────────────────────────────────

  /** O Z e o X são a mesma resposta aqui: cepo, suporte e fogueira. */
  public interactAt(x: number, y: number): boolean {
    if (this.blockTile?.x === x && this.blockTile.y === y) return this.useBlock();
    if (this.rackTile?.x === x && this.rackTile.y === y) return this.useRack();
    if (this.save.stage === 'lay' && this.fire && this.fire.worldX === x && this.fire.worldY === y) {
      this.openFire();
      return true;
    }
    return false;
  }

  public wantsKey(x: number, y: number): boolean {
    const { stage } = this.save;
    const held = this.host.held();
    if (this.blockTile?.x === x && this.blockTile.y === y) return (stage === 'chop' && held === 'wood') || (stage === 'split' && held === 'axe');
    if (this.rackTile?.x === x && this.rackTile.y === y) return stage === 'stack';
    return stage === 'lay' && this.fire?.worldX === x && this.fire.worldY === y;
  }

  private useBlock(): boolean {
    const { stage } = this.save;
    if (stage === 'chop') {
      if (this.host.held() !== 'wood') return true;
      const tile = this.blockTile;
      const hero = this.host.hero();
      this.host.removeFromHand('wood', 1);
      if (tile) this.host.fling('wood', hero.x, hero.y, tile.x, tile.y);
      this.save.wood += 1;
      this.block?.setTexture(chopBlockTexture(this.save.wood), 0);
      getSoundManager().playItemStash();
      if (this.save.wood >= WOOD_NEEDED) this.save.stage = 'split';
      this.host.persist();
      return true;
    }
    if (stage !== 'split') return true;
    if (this.host.held() !== 'axe') {
      this.host.think(AXE_ICON);
      return true;
    }
    this.openSplit();
    return true;
  }

  private useRack(): boolean {
    if (this.save.stage !== 'stack') return true;
    this.openStack();
    return true;
  }

  private openUi(): boolean {
    if (this.overlay) return false;
    this.host.freeze(true);
    this.host.showButtons(false);
    return true;
  }

  private closeUi(): void {
    this.overlay?.destroy();
    this.overlay = undefined;
    this.host.freeze(false);
    this.host.showButtons(true);
  }

  private openSplit(): void {
    if (!this.openUi()) return;
    const sound = getSoundManager();
    this.overlay = new SplitOverlay({
      onHit: () => sound.playWoodChop(),
      onMiss: () => sound.playItemBonk(),
      onClean: () => { sound.playWoodChop(); sound.playBridgePlank(); },
      onLog: (done, clean) => {
        this.save.split = done;
        this.save.clean = clean;
        this.block?.setTexture(chopBlockTexture(WOOD_NEEDED - done), 0);
        this.host.persist();
      },
      onLeave: () => this.closeUi(),
      onDone: () => {
        this.save.stage = 'stack';
        this.closeUi();
        this.host.persist();
      },
    }, this.save.split, this.save.clean);
  }

  private openStack(): void {
    if (!this.openUi()) return;
    const sound = getSoundManager();
    this.overlay = new StackOverlay({
      onPlace: () => sound.playBridgePlank(),
      onLift: () => sound.playItemStash(),
      onLeave: () => this.closeUi(),
      onDone: (heights) => {
        this.save.heights = heights;
        this.save.air = stackAir(heights);
        this.save.dryMs = 0;
        this.save.stage = 'dry';
        publishStack(heights, 0);
        this.rack?.setTexture(WOOD_STACK_TEXTURE, 0);
        this.closeUi();
        this.host.persist();
      },
    });
  }

  private openFire(): void {
    if (!this.openUi()) return;
    const sound = getSoundManager();
    this.overlay = new FireLayOverlay({
      onPlace: () => sound.playBridgePlank(),
      onStrike: () => sound.playHammer(),
      onBlow: () => sound.playFurnaceBreath(),
      onFail: () => sound.playItemBonk(),
      onCatch: () => sound.playIgnite(),
      onLeave: () => this.closeUi(),
      onDone: (attempts) => this.finish(attempts),
    });
  }

  /** O fogo pegou: fica aceso para sempre, e o Bram lê o trabalho inteiro. */
  private finish(attempts: number): void {
    this.closeUi();
    this.save.attempts = attempts;
    const { fire } = this;
    if (fire) {
      fire.setHeldCold(false);
      fire.light();
      this.host.keepFireLit(fire);
    }
    getSoundManager().playFurnaceIgnite();
    const at = this.npc;
    this.save.stage = 'done';
    this.host.persist();
    if (!at) return;
    const lines: I18nLine[] = [
      { speaker: 'npc', text: t(`npc.businessManReview.split.${this.save.clean >= 3 ? 'clean' : 'rough'}`) },
      { speaker: 'npc', text: t(`npc.businessManReview.air.${this.save.air >= COMMENT_GOOD_AIR ? 'good' : this.save.air < COMMENT_BAD_AIR ? 'bad' : 'ok'}`) },
      { speaker: 'npc', text: t(`npc.businessManReview.fire.${attempts === 0 ? 'first' : 'worked'}`) },
      ...tLines('npc.businessManReview.thanks'),
    ];
    this.host.say({ ...this.dialogBase(), calm: true, lines }, at, () => {
      this.host.hop(at.worldX, at.worldY, 0.34);
      this.host.hearts(at.worldX, at.worldY);
      this.host.closeQuest();
      this.host.markHeard();
    });
  }
}
