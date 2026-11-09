import type * as Engine from '@/game/engine';

import { getSoundManager } from '@/game/audio/SoundManager';
import type { DialogScript } from '@/game/dialogs/NpcDialogs';
import type { HeldItemKind } from '@/game/entities/ItemPickup';
import { tLines, type I18nLine } from '@/game/i18n/i18n';

import type { Billboard3D } from '@/game/render3d/Billboard3D';
import {
  ASH_TEXTURE, SAND_TEXTURE, TELESCOPE_STAND_TEXTURE, TRIPOD_TEXTURE,
} from '@/game/render3d/skyTextures';
import { CAIRN_TEXTURE } from '@/game/render3d/cozyTextures';
import { world3d } from '@/game/render3d/World3D';
import { adventureState, type SkyQuestSave } from '@/game/runtime/adventureState';

import { AstronomerScope, SPOT_TILE, STAIR_FOOT } from './AstronomerScope';
import { AstronomerForge } from './AstronomerForge';

/**
 * A QUEST DA THEA: o telescópio. O tubo sobrou; faltam o tripé e a lente. Ela dá a picareta (a ÚNICA do
 * vale) e manda o herói para oeste, ao lago de lava: na margem, a pedra de veio PRETO dá carvão e a de veio
 * vermelho dá minério. NINGUÉM DEPENDE DE OUTRO VIZINHO (pedido do autor): nada aqui pede o machado do Marco
 * nem coisa de outra quest, e o jogador faz os pedidos na ordem que quiser. O FORNO dela, fixo ao lado da
 * nave, é o guia: ele pede um item de cada vez, na ordem certa (`furnaceNeed`), e devolve o resultado — o
 * carvão (fica aceso lá dentro), o minério (sai a esponja, que o martelo vira ferro); depois areia (só na
 * beira do lago grande, no sul) e cinza (ao lado dela), que viram vidro. O vidro, polido num minijogo, vira lente. Montado, o herói o leva nas costas ao planalto, onde o céu é
 * mais limpo. De noite, e só de noite, ele procura os quatro alvos que ela ensina. Ela sobe, os dois
 * conversam, a nave pousa e leva Thea para casa (ver TheaDeparture), e o pedido fecha. O telescópio fica
 * lá para sempre.
 *
 * Esta classe não conhece a cena, só o `AstronomerHost`.
 */

export interface AstronomerHost {
  scene: Engine.Scene;
  held: () => HeldItemKind | 'none';
  takeIntoHand: (kind: HeldItemKind, units: number) => void;
  removeFromHand: (kind: HeldItemKind, units: number) => void;
  onGround: (kind: HeldItemKind) => boolean;
  dropAt: (kind: HeldItemKind, x: number, y: number) => void;
  hero: () => { x: number; y: number };
  isFree: (x: number, y: number) => boolean;
  fling: (kind: HeldItemKind, fromX: number, fromY: number, toX: number, toY: number) => void;
  say: (script: DialogScript, at: { worldX: number; worldY: number }, onClosed?: () => void) => void;
  itemGet: (kind: HeldItemKind, onDone: () => void) => void;
  hop: (x: number, y: number, height?: number) => void;
  hearts: (x: number, y: number) => void;
  sparkle: (x: number, y: number) => void;
  freeze: (frozen: boolean) => void;
  /** A câmera olha para este tile, sem o herói sair do lugar. `null` volta para ele. */
  lookAt: (tile: { x: number; y: number } | null) => void;
  showButtons: (visible: boolean) => void;
  persist: () => void;
  closeQuest: () => void;
  markHeard: () => void;
  /** Este item já passou pela mão do herói? É o que escolhe o próximo passo do ferro. */
  seen: (kind: HeldItemKind) => boolean;
  isNight: () => boolean;
  /**
   * O herói senta ao lado disto, o tempo corre, e `onNight` roda quando escurece. Uma seta desiste.
   * Com `company`, ela sobe a escada com uma caneca e fica ali até a noite.
   */
  waitForNight: (x: number, y: number, onNight: () => void, company?: { from: readonly [number, number]; beside: { x: number; y: number } }) => void;
  /** Quem saiu da ocular antes do fim: ela desce e volta para casa. */
  sendSkyVisitorHome: () => void;
  /** A cena final: ela sobe a escada, senta ao lado do herói e fala. `onDone` já é depois do corte. */
  playFarewell: (scene: { from: readonly [number, number]; beside: { x: number; y: number }; script: DialogScript; goodbye: DialogScript; ship: { x: number; y: number } }, onDone: () => void) => void;
  /** Ela não está mais no mundo: o tile dela fica livre. */
  theaGone: () => void;
}

/**
 * A AREIA SÓ EXISTE NA BEIRA DO LAGO GRANDE, no sul, ao lado do tronco onde se senta para olhar a água
 * (pedido do autor): o herói desce o vale inteiro para buscá-la. O primeiro tile livre desta lista.
 */
const SAND_TILES = [[40, 50], [42, 50], [40, 51], [42, 51], [39, 50], [43, 50]] as const;
const SIZE_TRIPOD = 1;
const SIZE_TELESCOPE = 1.15;
const SIZE_HEAP = 0.95;
const SIZE_MARK = 0.8;
const POP_MS = 320;

export class AstronomerQuest {
  public readonly save: SkyQuestSave;
  public npc?: { worldX: number; worldY: number };
  public tripod?: Billboard3D;
  public tripodTile?: { x: number; y: number };
  public sand?: Billboard3D;
  private sandTile?: { x: number; y: number };
  public ash?: Billboard3D;
  private ashTile?: { x: number; y: number };
  public mark?: Billboard3D;
  private telescope?: Billboard3D;
  public overlay?: { destroy: () => void };
  public dialogBase: () => DialogScript = () => ({ npcName: '', npcColorHex: '#ffffff', npcAssetKey: '', lines: [] });
  /** A lente, o telescópio e o céu. (ver AstronomerScope) */
  private readonly scope = new AstronomerScope(this);
  /** O forno, a barra e o tripé. (ver AstronomerForge) */
  private readonly forge = new AstronomerForge(this);

  public constructor(public readonly host: AstronomerHost) {
    this.save = adventureState().skyQuest;
    const state = adventureState();
    // Saves de quando ela só pedia a barra de ferro: quem entregou está fechado, e quem já tinha a
    // picareta segue para o ferro.
    if ((state.questProgress.get('astronaut/deliver:iron') ?? 0) >= 1 && this.save.stage === 'start') {
      state.questProgress.set('astronaut/sky', 1);
      this.save.stage = 'done';
    } else if (state.giftsGiven.has('astronaut') && this.save.stage === 'start') {
      this.save.stage = 'iron';
    }
  }

  public setDialogBase(read: () => DialogScript): void {
    this.dialogBase = read;
  }

  public get isDone(): boolean {
    return this.save.stage === 'done';
  }

  public talkKey(): string {
    const { stage } = this.save;
    if (stage === 'iron') return `astronaut:iron:${this.host.held() === 'iron' ? 'ready' : this.forge.ironStep()}`;
    if (stage === 'glass') return `astronaut:glass:${this.host.held() === 'glass' ? 'ready' : 'wait'}`;
    return `astronaut:${stage}`;
  }

  // ── o lugar ─────────────────────────────────────────────────────────────────────────────────────

  public build(npc: { worldX: number; worldY: number }): void {
    this.npc = npc;
    const { stage } = this.save;
    if (this.save.departed) this.host.theaGone();
    if (stage === 'glass' || stage === 'polish') this.placeCamp();
    if (stage === 'glass' || stage === 'polish') this.showTripod(false);
    if (stage === 'glass') this.showHeaps(false);
    if (stage === 'carry') this.showMark();
    if (stage === 'night' || stage === 'done') this.showTelescope(false);
  }

  /**
   * À esquerda dela o tripé, e atrás dele a areia; à direita, além da fogueira, a cinza. Só se escolhe na
   * hora de mostrar: até lá o herói pode ter posto o forno, ou estar parado, num desses tiles.
   */
  public placeCamp(): void {
    const npc = this.npc;
    if (!npc) return;
    const hero = this.host.hero();
    const taken: { x: number; y: number }[] = [];
    const pick = (offsets: readonly (readonly [number, number])[]): { x: number; y: number } | undefined => {
      const found = offsets
        .map(([dx, dy]) => ({ x: npc.worldX + dx, y: npc.worldY + dy }))
        .find((t) => this.host.isFree(t.x, t.y) && !(t.x === hero.x && t.y === hero.y) && !taken.some((o) => o.x === t.x && o.y === t.y));
      if (found) taken.push(found);
      return found;
    };
    this.tripodTile = pick([[-1, 0], [-1, 1], [0, 1], [-2, 0]]);
    this.sandTile = SAND_TILES.map(([x, y]) => ({ x, y })).find((t) => this.host.isFree(t.x, t.y) && !(t.x === hero.x && t.y === hero.y));
    this.ashTile = pick([[2, 0], [2, 1], [1, 1], [2, -1]]);
  }

  public destroy(): void {
    this.overlay?.destroy();
    this.overlay = undefined;
    for (const bb of [this.tripod, this.sand, this.ash, this.mark, this.telescope]) bb?.destroy();
  }

  public isSolidAt(x: number, y: number): boolean {
    return this.isTripod(x, y) || this.isSand(x, y) || this.isAsh(x, y) || this.isMark(x, y) || this.isTelescope(x, y);
  }

  private isTripod(x: number, y: number): boolean {
    return this.tripod !== undefined && this.tripodTile?.x === x && this.tripodTile.y === y;
  }

  private isSand(x: number, y: number): boolean {
    return this.sand !== undefined && this.sandTile?.x === x && this.sandTile.y === y;
  }

  private isAsh(x: number, y: number): boolean {
    return this.ash !== undefined && this.ashTile?.x === x && this.ashTile.y === y;
  }

  private isMark(x: number, y: number): boolean {
    return this.mark !== undefined && SPOT_TILE.x === x && SPOT_TILE.y === y;
  }

  private isTelescope(x: number, y: number): boolean {
    return this.telescope !== undefined && SPOT_TILE.x === x && SPOT_TILE.y === y;
  }

  private pop(bb: Billboard3D, size: number): void {
    bb.setDisplaySize(size * 0.2, size * 0.2);
    this.host.scene.tweens.add({ targets: bb, displayWidth: size, displayHeight: size, duration: POP_MS, ease: 'Back.easeOut' });
  }

  public showTripod(animate: boolean): void {
    const tile = this.tripodTile;
    if (!tile || this.tripod) return;
    this.tripod = world3d().objects.addBillboard(TRIPOD_TEXTURE, 0, { groundShadow: { rx: 0.3, rz: 0.16, alpha: 0.26 } })
      .setPosition(tile.x, tile.y)
      .setDisplaySize(SIZE_TRIPOD, SIZE_TRIPOD);
    if (animate) {
      this.pop(this.tripod, SIZE_TRIPOD);
      this.host.sparkle(tile.x, tile.y);
      getSoundManager().work.playBridgePlank();
    }
  }

  public showHeaps(animate: boolean): void {
    if (!this.sand && this.sandTile) {
      this.sand = world3d().objects.addBillboard(SAND_TEXTURE, 0, { groundShadow: { rx: 0.36, rz: 0.16, alpha: 0.2 } })
        .setPosition(this.sandTile.x, this.sandTile.y)
        .setDisplaySize(SIZE_HEAP, SIZE_HEAP);
      if (animate) this.pop(this.sand, SIZE_HEAP);
    }
    if (!this.ash && this.ashTile) {
      this.ash = world3d().objects.addBillboard(ASH_TEXTURE, 0, { groundShadow: { rx: 0.36, rz: 0.16, alpha: 0.2 } })
        .setPosition(this.ashTile.x, this.ashTile.y)
        .setDisplaySize(SIZE_HEAP, SIZE_HEAP);
      if (animate) this.pop(this.ash, SIZE_HEAP);
    }
  }

  public showMark(): void {
    if (this.mark) return;
    this.mark = world3d().objects.addBillboard(CAIRN_TEXTURE, 0, { groundShadow: { rx: 0.3, rz: 0.14, alpha: 0.24 } })
      .setPosition(SPOT_TILE.x, SPOT_TILE.y)
      .setDisplaySize(SIZE_MARK, SIZE_MARK);
  }

  public showTelescope(animate: boolean): void {
    if (this.telescope) return;
    this.telescope = world3d().objects.addBillboard(TELESCOPE_STAND_TEXTURE, 0, { groundShadow: { rx: 0.34, rz: 0.18, alpha: 0.28 } })
      .setPosition(SPOT_TILE.x, SPOT_TILE.y)
      .setDisplaySize(SIZE_TELESCOPE, SIZE_TELESCOPE);
    if (animate) this.pop(this.telescope, SIZE_TELESCOPE);
  }

  // ── o forno guia ────────────────────────────────────────────────────────────────────────────────

  // ── as conversas ────────────────────────────────────────────────────────────────────────────────

  public talk(base: DialogScript, at: { worldX: number; worldY: number }): boolean {
    if (this.isDone) return false;
    const say = (lines: I18nLine[], onClosed?: () => void): void => {
      this.host.say({ ...base, lines }, at, () => {
        onClosed?.();
        this.host.markHeard();
      });
    };
    const step = (key: string): I18nLine[] => tLines(`npc.astronautStep.${key}`);
    switch (this.save.stage) {
      case 'start':
        say([...base.lines, ...tLines('npc.astronautHint.ore')], () => {
          this.save.stage = 'iron';
          this.give('pickaxe', at);
        });
        return true;
      case 'iron':
        if (this.host.held() === 'iron') { this.forge.deliverIron(base, at); return true; }
        say(tLines(`npc.astronautHint.${this.forge.ironStep()}`), () => {
          if (this.forge.ironStep() === 'ore' && this.host.held() !== 'pickaxe' && !this.host.onGround('pickaxe')) this.give('pickaxe', at);
        });
        return true;
      case 'glass':
        if (this.host.held() === 'glass') { say(step('polish'), () => this.scope.startPolish()); return true; }
        say(step('wait'));
        return true;
      case 'polish':
        say(step('polish'), () => this.scope.openPolish());
        return true;
      case 'carry':
        say(step('carry'), () => {
          if (this.host.held() !== 'telescope' && !this.host.onGround('telescope')) this.give('telescope', at);
        });
        return true;
      case 'night':
        say(step('night'));
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

  // ── os gestos no mundo ──────────────────────────────────────────────────────────────────────────

  public interactAt(x: number, y: number): boolean {
    if (this.isSand(x, y)) { this.takeHeap('sand', x, y); return true; }
    if (this.isAsh(x, y)) { this.takeHeap('ash', x, y); return true; }
    if (this.isTripod(x, y)) {
      if (this.save.stage === 'polish') this.scope.openPolish();
      else if (this.host.held() === 'glass') this.scope.startPolish();
      return true;
    }
    if (this.isMark(x, y)) {
      if (this.host.held() === 'telescope') this.scope.install();
      return true;
    }
    if (this.isTelescope(x, y)) {
      if (this.host.isNight()) this.scope.openSky();
      else this.host.waitForNight(x, y, () => this.scope.openSky(), this.isDone ? undefined : { from: STAIR_FOOT, beside: SPOT_TILE });
      return true;
    }
    return false;
  }

  public neededAt(x: number, y: number): HeldItemKind | null {
    if (this.isMark(x, y)) return this.host.held() === 'telescope' ? null : 'telescope';
    if (this.isTripod(x, y) && this.save.stage === 'glass') return this.host.held() === 'glass' ? null : 'glass';
    return null;
  }

  /** O gesto da mão neste tile agora, se houver: a mesma pergunta que o botão faz. */
  public actionAt(x: number, y: number): string | null {
    const held = this.host.held();
    if (this.isSand(x, y)) return held !== 'sand' ? 'take' : null;
    if (this.isAsh(x, y)) return held !== 'ash' ? 'take' : null;
    if (this.isTripod(x, y)) return this.save.stage === 'polish' || held === 'glass' ? 'polish' : null;
    if (this.isMark(x, y)) return held === 'telescope' ? 'install' : null;
    return this.isTelescope(x, y) ? 'look' : null;
  }

  /** Os dois montes não acabam: nada se perde, e quem largou o punhado volta e pega outro. */
  private takeHeap(kind: 'sand' | 'ash', x: number, y: number): void {
    if (this.host.held() === kind) return;
    const hero = this.host.hero();
    this.host.fling(kind, x, y, hero.x, hero.y);
    this.host.takeIntoHand(kind, 1);
    getSoundManager().work.playSandTrickle();
    this.host.persist();
    this.host.itemGet(kind, () => {});
  }

  // ── a noite ─────────────────────────────────────────────────────────────────────────────────────

  /** (ver AstronomerForge.feedFurnace) */
  public feedFurnace(...args: Parameters<AstronomerForge['feedFurnace']>): ReturnType<AstronomerForge['feedFurnace']> {
    return this.forge.feedFurnace(...args);
  }

  /** (ver AstronomerForge.furnaceKindled) */
  public furnaceKindled(...args: Parameters<AstronomerForge['furnaceKindled']>): ReturnType<AstronomerForge['furnaceKindled']> {
    return this.forge.furnaceKindled(...args);
  }

  /** (ver AstronomerForge.furnaceNeed) */
  public furnaceNeed(...args: Parameters<AstronomerForge['furnaceNeed']>): ReturnType<AstronomerForge['furnaceNeed']> {
    return this.forge.furnaceNeed(...args);
  }

  /** (ver AstronomerForge.ironFromAnvil) */
  public ironFromAnvil(...args: Parameters<AstronomerForge['ironFromAnvil']>): ReturnType<AstronomerForge['ironFromAnvil']> {
    return this.forge.ironFromAnvil(...args);
  }

  /** (ver AstronomerForge.wantsIronAtAnvil) */
  public wantsIronAtAnvil(...args: Parameters<AstronomerForge['wantsIronAtAnvil']>): ReturnType<AstronomerForge['wantsIronAtAnvil']> {
    return this.forge.wantsIronAtAnvil(...args);
  }
}
