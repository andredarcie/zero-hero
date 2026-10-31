import type Phaser from 'phaser';

import { getSoundManager } from '@/game/audio/SoundManager';
import { ASSET_KEYS } from '@/game/constants';
import type { DialogScript } from '@/game/dialogs/NpcDialogs';
import type { HeldItemKind } from '@/game/entities/ItemPickup';
import { t, tLines, type I18nLine } from '@/game/i18n/i18n';
import type { CampfireObject } from '@/game/objects/CampfireObject';
import type { Billboard3D } from '@/game/render3d/Billboard3D';
import {
  CHOP_BLOCK_TEXTURE, FIRE_PIT_TEXTURE, woodSprite,
} from '@/game/render3d/woodTextures';
import { world3d } from '@/game/render3d/World3D';
import { adventureState, type LumberQuestSave } from '@/game/runtime/adventureState';
import { FireLightOverlay, LOGS_TO_SPLIT, SplitOverlay } from '@/game/runtime/WoodcraftOverlays';

/**
 * A QUEST DO BRAM: uma fogueira e uma noite. Não há fogueira nenhuma ao lado dele, só a terra
 * preparada. Bram dá o machado (nenhum mais fica solto no mundo), e são quatro voltas: cortar um
 * galho morto, levá-lo nas costas ao cepo, pô-lo em pé, rachá-lo no minijogo e atirar as duas metades
 * na terra, onde a fogueira vai crescendo. Com as quatro, ele manda acender. Aceso, é uma cena: ele vem
 * sentar, o herói senta na frente do fogo, o mundo escurece, e ele conta como o fogo funciona.
 *
 * O MACHADO OCUPA A MÃO, como tudo (pedido do autor): pegar o galho deixa o machado no chão, e o herói
 * volta para buscá-lo. Ao rachar, as metades vêm para as costas e o machado fica ao lado do cepo.
 */

export interface LumberHost {
  scene: Phaser.Scene;
  held: () => HeldItemKind | 'none';
  takeIntoHand: (kind: HeldItemKind, units: number) => void;
  onGround: (kind: HeldItemKind) => boolean;
  removeFromHand: (kind: HeldItemKind, units: number) => void;
  hero: () => { x: number; y: number };
  isFree: (x: number, y: number) => boolean;
  fling: (kind: HeldItemKind, fromX: number, fromY: number, toX: number, toY: number) => void;
  say: (script: DialogScript, at: { worldX: number; worldY: number }, onClosed?: () => void) => void;
  itemGet: (kind: HeldItemKind, onDone: () => void) => void;
  hop: (x: number, y: number, height?: number) => void;
  sparkle: (x: number, y: number) => void;
  dust: (x: number, y: number) => void;
  shake: () => void;
  freeze: (frozen: boolean) => void;
  showButtons: (visible: boolean) => void;
  persist: () => void;
  closeQuest: () => void;
  markHeard: () => void;
  /** Uma fogueira de verdade na terra preparada, ainda fria. */
  addFire: (x: number, y: number) => CampfireObject;
  /** A cena da noite. `onDone` roda já de dia, com a fogueira apagada. */
  playNight: (night: {
    fire: CampfireObject;
    pit: { x: number; y: number };
    seat: { x: number; y: number };
    npc: { worldX: number; worldY: number };
    story: DialogScript;
    farewell: DialogScript;
  }, onDone: () => void) => void;
}

const STICKS = LOGS_TO_SPLIT;
const SIZE_BLOCK = 0.9;
const SIZE_STICK = 1.05;
const SIZE_PIT = 1.7;
/** Onde cada galho pousa na terra, e a inclinação: quatro varas encostadas, formando a tenda. */
const SLOTS: ReadonlyArray<{ x: number; y: number; angle: number }> = [
  { x: -0.26, y: 0.04, angle: 30 },
  { x: 0.26, y: 0.04, angle: -30 },
  { x: -0.12, y: -0.1, angle: 13 },
  { x: 0.12, y: -0.1, angle: -13 },
];

export class LumberQuest {
  private readonly save: LumberQuestSave;
  private block?: Billboard3D;
  private standingStick?: Billboard3D;
  private pit?: Billboard3D;
  private readonly laidSticks: Billboard3D[] = [];
  private blockTile?: { x: number; y: number };
  private pitTile?: { x: number; y: number };
  private seatTile?: { x: number; y: number };
  private npc?: { worldX: number; worldY: number };
  private fire?: CampfireObject;
  private overlay?: { destroy: () => void };
  private busy = false;
  private missedThisStick = false;
  private dialogBase: () => DialogScript = () => ({ npcName: '', npcColorHex: '#ffffff', npcAssetKey: '', lines: [] });

  public constructor(private readonly host: LumberHost) {
    this.save = adventureState().lumberQuest;
    const progress = adventureState().questProgress;
    // Saves das versões anteriores da quest: ninguém perde o que já fez.
    const old = this.save.stage as string;
    if ((progress.get('businessMan/deliver:wood') ?? 0) >= 4 && old === 'start') {
      progress.set('businessMan/fire', 1);
      this.save.stage = 'done';
    } else if (old === 'chop') {
      this.save.stage = 'gather';
    } else if (old === 'split' || old === 'stack' || old === 'dry' || old === 'lay') {
      this.save.stage = 'light';
      this.save.laid = STICKS;
    }
  }

  public setDialogBase(read: () => DialogScript): void {
    this.dialogBase = read;
  }

  // ── o lugar ─────────────────────────────────────────────────────────────────────────────────────

  public build(npc: { worldX: number; worldY: number }): void {
    this.npc = npc;
    const at = (dx: number, dy: number): { x: number; y: number } => ({ x: npc.worldX + dx, y: npc.worldY + dy });
    const free = (tile: { x: number; y: number }): boolean => this.host.isFree(tile.x, tile.y);
    this.blockTile = [at(-1, 0), at(-1, 1), at(-2, 0)].find(free);
    // A terra fica a uns passos dele, para ele ter de andar até lá, com lugar para os dois sentarem.
    const spots: ReadonlyArray<readonly [number, number]> = [[3, 2], [3, 3], [2, 3], [4, 2], [-2, 3], [0, 3]];
    for (const [dx, dy] of spots) {
      const pit = at(dx, dy);
      // Um de cada lado do fogo, olho no olho: o herói embaixo, olhando para cima, e ele em cima.
      const south = { x: pit.x, y: pit.y + 1 };
      const north = { x: pit.x, y: pit.y - 1 };
      if (!free(pit) || !free(south) || !free(north)) continue;
      this.pitTile = pit;
      // Dois tiles acima, se der: colado no fogo, a chama cobriria o rosto dele.
      const back = { x: pit.x, y: pit.y - 2 };
      this.seatTile = free(back) ? back : north;
      break;
    }
    const w3 = world3d();
    if (this.blockTile) {
      this.block = w3.addBillboard(CHOP_BLOCK_TEXTURE, 0, { groundShadow: { rx: 0.34, rz: 0.2, alpha: 0.28 } })
        .setPosition(this.blockTile.x, this.blockTile.y)
        .setDisplaySize(SIZE_BLOCK, SIZE_BLOCK);
      if (this.save.standing) this.showStanding();
    }
    if (this.pitTile) {
      this.pit = w3.addBillboard(FIRE_PIT_TEXTURE, 0, { flat: true, flatY: 0.016 })
        .setPosition(this.pitTile.x, this.pitTile.y)
        .setDisplaySize(SIZE_PIT, SIZE_PIT);
      if (this.isDone) {
        this.fire = this.host.addFire(this.pitTile.x, this.pitTile.y);
        this.fire.setHeldCold(true);
      } else {
        for (let i = 0; i < this.save.laid; i += 1) this.laidSticks.push(this.stickAt(i));
      }
    }
  }

  public destroy(): void {
    this.overlay?.destroy();
    this.overlay = undefined;
    this.block?.destroy();
    this.standingStick?.destroy();
    this.pit?.destroy();
    for (const stick of this.laidSticks) stick.destroy();
    this.laidSticks.length = 0;
  }

  public isSolidAt(x: number, y: number): boolean {
    if (this.blockTile?.x === x && this.blockTile.y === y) return true;
    return this.pitTile?.x === x && this.pitTile.y === y;
  }

  public get isDone(): boolean {
    return this.save.stage === 'done';
  }

  /** Nas voltas, cada árvore dá um galho só: é um por viagem. */
  public get wantsOneStick(): boolean {
    return this.save.stage === 'gather';
  }

  private stickAt(index: number): Billboard3D {
    const slot = SLOTS[index];
    const tile = this.pitTile ?? { x: 0, y: 0 };
    return world3d().addBillboard(ASSET_KEYS.woodIcon, 0, { groundShadow: { rx: 0.14, rz: 0.08, alpha: 0.22 } })
      .setPosition(tile.x + slot.x, tile.y + slot.y)
      .setDisplaySize(SIZE_STICK, SIZE_STICK)
      .setAngle(slot.angle);
  }

  private showStanding(): void {
    const tile = this.blockTile;
    if (!tile) return;
    this.standingStick = world3d().addBillboard(ASSET_KEYS.woodIcon, 0, {})
      .setPosition(tile.x, tile.y + 0.02)
      .setElevation(0.38)
      .setDisplaySize(SIZE_STICK, SIZE_STICK);
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
          this.save.stage = 'gather';
          this.giveAxe(at);
        });
        return true;
      case 'gather':
        say(step('gather').map((line) => ({ ...line, text: line.text.replace('{n}', String(STICKS - this.save.laid)) })), () => {
          // Nada se perde: se o machado não está na mão nem no chão, ele tem outro.
          if (this.host.held() !== 'axe' && !this.host.onGround('axe')) this.giveAxe(at);
        });
        return true;
      case 'ready':
        say(step('ready'), () => {
          this.save.stage = 'light';
          this.host.persist();
        });
        return true;
      case 'light':
        say(step('light'));
        return true;
      default:
        return false;
    }
  }

  private giveAxe(at: { worldX: number; worldY: number }): void {
    const hero = this.host.hero();
    this.host.hop(at.worldX, at.worldY);
    this.host.fling('axe', at.worldX, at.worldY, hero.x, hero.y);
    this.host.takeIntoHand('axe', 1);
    this.host.persist();
    this.host.itemGet('axe', () => {});
  }

  // ── os gestos no mundo ──────────────────────────────────────────────────────────────────────────

  public interactAt(x: number, y: number): boolean {
    if (this.blockTile?.x === x && this.blockTile.y === y) return this.useBlock();
    if (this.pitTile?.x === x && this.pitTile.y === y && !this.isDone) return this.usePit();
    return false;
  }

  /** O que falta na mão para agir neste tile, nesta etapa. */
  public neededAt(x: number, y: number): HeldItemKind | null {
    if (this.save.stage !== 'gather') return null;
    const held = this.host.held();
    if (this.blockTile?.x === x && this.blockTile.y === y) {
      if (this.save.standing) return held === 'axe' ? null : 'axe';
      return held === 'wood' ? null : 'wood';
    }
    if (this.pitTile?.x === x && this.pitTile.y === y) return held === 'splitWood' ? null : 'splitWood';
    return null;
  }

  public wantsKey(x: number, y: number): boolean {
    const { stage } = this.save;
    const held = this.host.held();
    if (this.blockTile?.x === x && this.blockTile.y === y) return stage === 'gather' && (this.save.standing ? held === 'axe' : held === 'wood');
    if (this.pitTile?.x !== x || this.pitTile.y !== y) return false;
    return stage === 'light' || (stage === 'gather' && held === 'splitWood');
  }

  private useBlock(): boolean {
    if (this.save.stage !== 'gather' || this.busy) return true;
    if (this.save.standing) {
      if (this.host.held() === 'axe') this.openSplit();
      return true;
    }
    if (this.host.held() === 'wood') this.standStick();
    return true;
  }

  /** O galho sai das costas e cai em pé no cepo: sobe, gira e assenta com um baque. */
  private standStick(): void {
    const tile = this.blockTile;
    if (!tile) return;
    const hero = this.host.hero();
    this.host.removeFromHand('wood', 1);
    this.busy = true;
    const { scene } = this.host;
    const ghost = world3d().addBillboard(ASSET_KEYS.woodIcon, 0, {})
      .setPosition(hero.x, hero.y)
      .setElevation(0.5)
      .setDisplaySize(SIZE_STICK, SIZE_STICK);
    const k = { t: 0 };
    scene.tweens.add({
      targets: k,
      t: 1,
      duration: 340,
      ease: 'Sine.easeIn',
      onUpdate: () => {
        ghost.setPosition(hero.x + (tile.x - hero.x) * k.t, hero.y + (tile.y - hero.y) * k.t);
        ghost.setElevation(0.5 + Math.sin(k.t * Math.PI) * 0.75 - k.t * 0.12);
        ghost.setAngle((1 - k.t) * 360);
      },
      onComplete: () => {
        ghost.destroy();
        this.showStanding();
        this.save.standing = true;
        this.busy = false;
        this.host.persist();
        getSoundManager().playBridgePlank();
        this.host.dust(tile.x, tile.y);
        const stick = this.standingStick;
        if (!stick) return;
        // O baque: amassa e volta, como quem acertou o centro do cepo.
        stick.setDisplaySize(SIZE_STICK * 1.14, SIZE_STICK * 0.82);
        scene.tweens.add({ targets: stick, displayWidth: SIZE_STICK, displayHeight: SIZE_STICK, duration: 220, ease: 'Back.easeOut' });
      },
    });
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
      onHit: () => { this.missedThisStick = true; sound.playWoodChop(); },
      onMiss: () => { this.missedThisStick = true; sound.playItemBonk(); },
      onClean: () => { sound.playWoodChop(); sound.playBridgePlank(); },
      // Sair e voltar não apaga o golpe errado: limpo é de primeira, no galho, não na tela.
      onSplit: (clean) => {
        if (clean && !this.missedThisStick) this.save.clean += 1;
        this.missedThisStick = false;
      },
      onLeave: () => this.closeUi(),
      onDone: () => {
        this.closeUi();
        this.finishSplit();
      },
    }, this.save.laid);
  }

  /** As duas metades pulam do cepo para as costas. */
  private finishSplit(): void {
    const tile = this.blockTile;
    const hero = this.host.hero();
    this.standingStick?.destroy();
    this.standingStick = undefined;
    this.save.standing = false;
    if (tile) this.host.fling('splitWood', tile.x, tile.y, hero.x, hero.y);
    this.host.takeIntoHand('splitWood', 1);
    this.host.itemGet('splitWood', () => {});
    this.host.persist();
  }

  private usePit(): boolean {
    if (this.busy) return true;
    if (this.save.stage === 'light') {
      this.openFire();
      return true;
    }
    if (this.save.stage !== 'gather' || this.host.held() !== 'splitWood' || this.save.laid >= STICKS) return true;
    this.throwOnPit();
    return true;
  }

  /** O GESTO DA QUEST: o herói atira o galho, ele gira no ar, cai, quica e fica na tenda. */
  private throwOnPit(): void {
    const tile = this.pitTile;
    if (!tile) return;
    const slot = SLOTS[this.save.laid];
    const hero = this.host.hero();
    const { scene } = this.host;
    this.host.removeFromHand('splitWood', 1);
    this.busy = true;
    this.save.laid += 1;
    getSoundManager().playSwordSlash();
    const stick = world3d().addBillboard(ASSET_KEYS.woodIcon, 0, { groundShadow: { rx: 0.14, rz: 0.08, alpha: 0.22 } })
      .setPosition(hero.x, hero.y)
      .setElevation(0.55)
      .setDisplaySize(SIZE_STICK, SIZE_STICK);
    this.laidSticks.push(stick);
    const to = { x: tile.x + slot.x, y: tile.y + slot.y };
    const k = { t: 0 };
    scene.tweens.add({
      targets: k,
      t: 1,
      duration: 460,
      ease: 'Quad.easeIn',
      onUpdate: () => {
        stick.setPosition(hero.x + (to.x - hero.x) * k.t, hero.y + (to.y - hero.y) * k.t);
        stick.setElevation(0.55 * (1 - k.t) + Math.sin(k.t * Math.PI) * 1.1);
        stick.setAngle(slot.angle + (1 - k.t) * 720);
      },
      onComplete: () => this.landStick(stick, slot, tile),
    });
  }

  private landStick(stick: Billboard3D, slot: { angle: number }, tile: { x: number; y: number }): void {
    const { scene } = this.host;
    stick.setElevation(0).setAngle(slot.angle);
    getSoundManager().playBridgePlank();
    getSoundManager().playFootstep();
    this.host.dust(tile.x, tile.y);
    this.host.shake();
    // O quique: sobe um fio e assenta, e o galho amassa ao tocar o chão.
    stick.setDisplaySize(SIZE_STICK * 1.2, SIZE_STICK * 0.78);
    scene.tweens.add({ targets: stick, displayWidth: SIZE_STICK, displayHeight: SIZE_STICK, duration: 260, ease: 'Back.easeOut' });
    scene.tweens.add({
      targets: stick,
      elevation: 0.12,
      duration: 110,
      yoyo: true,
      ease: 'Sine.easeOut',
      onComplete: () => {
        this.busy = false;
        this.host.sparkle(tile.x, tile.y);
        if (this.save.laid >= STICKS) {
          this.save.stage = 'ready';
          getSoundManager().playCozyChime();
        }
        this.host.persist();
      },
    });
  }

  // ── o fogo e a noite ────────────────────────────────────────────────────────────────────────────

  private openFire(): void {
    if (!this.openUi()) return;
    const sound = getSoundManager();
    this.overlay = new FireLightOverlay({
      onStrike: () => sound.playHammer(),
      onBlow: () => sound.playFurnaceBreath(),
      onFail: () => sound.playItemBonk(),
      onCatch: () => sound.playIgnite(),
      onLeave: () => this.closeUi(),
      onDone: (attempts) => this.startNight(attempts),
    }, woodSprite(this.host.scene));
  }

  private startNight(attempts: number): void {
    this.overlay?.destroy();
    this.overlay = undefined;
    this.save.attempts = attempts;
    const pit = this.pitTile;
    const seat = this.seatTile;
    const { npc } = this;
    if (!pit || !seat || !npc) return;
    for (const stick of this.laidSticks) stick.destroy();
    this.laidSticks.length = 0;
    const fire = this.host.addFire(pit.x, pit.y);
    this.fire = fire;
    const base = { ...this.dialogBase(), calm: true };
    const open: I18nLine[] = [
      { speaker: 'npc', text: t(`npc.businessManNight.split.${this.save.clean >= 3 ? 'clean' : 'rough'}`) },
      { speaker: 'npc', text: t(`npc.businessManNight.fire.${attempts === 0 ? 'first' : 'worked'}`) },
    ];
    this.host.playNight({
      fire,
      pit,
      seat,
      npc,
      story: { ...base, lines: (() => { const [sit, ...rest] = tLines('npc.businessManNight.story'); return [sit, ...open, ...rest]; })() },
      farewell: { ...base, lines: tLines('npc.businessManNight.farewell') },
    }, () => {
      fire.setHeldCold(true);
      this.save.stage = 'done';
      this.host.persist();
      this.host.closeQuest();
      this.host.markHeard();
    });
  }
}
