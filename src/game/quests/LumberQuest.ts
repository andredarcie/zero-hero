import type * as Engine from '@/game/engine';

import type { DialogScript } from '@/game/dialogs/NpcDialogs';
import type { HeldItemKind } from '@/game/entities/ItemPickup';
import { tLines, type I18nLine } from '@/game/i18n/i18n';

import type { CampfireObject } from '@/game/objects/CampfireObject';
import type { Billboard3D } from '@/game/render3d/Billboard3D';
import { CHOP_BLOCK_TEXTURE, FIRE_PIT_TEXTURE } from '@/game/render3d/woodTextures';
import { world3d } from '@/game/render3d/World3D';
import { adventureState, type LumberQuestSave } from '@/game/runtime/adventureState';

import { LumberWork, STICKS } from './LumberWork';

/**
 * A QUEST DO MARCO: uma fogueira e uma noite. Não há fogueira nenhuma ao lado dele, só a terra
 * preparada. Marco dá o machado (nenhum mais fica solto no mundo), e são quatro voltas: achar uma árvore
 * seca, que é rara, cortar um galho, levá-lo no colo ao cepo, pô-lo em pé, e o minijogo de rachar já
 * começa. As duas metades vão nas costas para a terra, onde a fogueira vai crescendo. Com as quatro, ele manda acender. Aceso, é uma cena: ele vem
 * sentar, o herói senta na frente do fogo, o mundo escurece, e ele conta como o fogo funciona.
 *
 * O MACHADO OCUPA A MÃO, como tudo (pedido do autor): pegar o galho deixa o machado no chão. Ao rachar,
 * ele reaparece à esquerda do herói, com as metades nas costas: ninguém volta para buscá-lo.
 */

export interface LumberHost {
  scene: Engine.Scene;
  held: () => HeldItemKind | 'none';
  takeIntoHand: (kind: HeldItemKind, units: number) => void;
  onGround: (kind: HeldItemKind) => boolean;
  takeFromGround: (kind: HeldItemKind) => boolean;
  dropAt: (kind: HeldItemKind, x: number, y: number) => void;
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

const SIZE_BLOCK = 0.9;
const SIZE_PIT = 1.7;

export class LumberQuest {
  public readonly save: LumberQuestSave;
  private block?: Billboard3D;
  public standingStick?: Billboard3D;
  private pit?: Billboard3D;
  public readonly laidSticks: Billboard3D[] = [];
  public blockTile?: { x: number; y: number };
  public pitTile?: { x: number; y: number };
  public seatTile?: { x: number; y: number };
  public npc?: { worldX: number; worldY: number };
  public fire?: CampfireObject;
  public overlay?: { destroy: () => void };
  public dialogBase: () => DialogScript = () => ({ npcName: '', npcColorHex: '#ffffff', npcAssetKey: '', lines: [] });
  /** O galho, o cepo, a fogueira e a noite. (ver LumberWork) */
  private readonly work = new LumberWork(this);

  public constructor(public readonly host: LumberHost) {
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
      this.block = w3.objects.addBillboard(CHOP_BLOCK_TEXTURE, 0, { groundShadow: { rx: 0.34, rz: 0.2, alpha: 0.28 } })
        .setPosition(this.blockTile.x, this.blockTile.y)
        .setDisplaySize(SIZE_BLOCK, SIZE_BLOCK);
      if (this.save.standing) this.work.showStanding();
    }
    if (this.pitTile) {
      this.pit = w3.objects.addBillboard(FIRE_PIT_TEXTURE, 0, { flat: true, flatY: 0.016 })
        .setPosition(this.pitTile.x, this.pitTile.y)
        .setDisplaySize(SIZE_PIT, SIZE_PIT);
      if (this.isDone) {
        this.fire = this.host.addFire(this.pitTile.x, this.pitTile.y);
        this.fire.setHeldCold(true);
      } else {
        for (let i = 0; i < this.save.laid; i += 1) this.laidSticks.push(this.work.stickAt(i));
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
    if (this.blockTile?.x === x && this.blockTile.y === y) return this.work.useBlock();
    if (this.pitTile?.x === x && this.pitTile.y === y && !this.isDone) return this.work.usePit();
    return false;
  }

  /** O que falta na mão para agir neste tile, nesta etapa. */
  public neededAt(x: number, y: number): HeldItemKind | null {
    if (this.save.stage !== 'gather') return null;
    const held = this.host.held();
    if (this.blockTile?.x === x && this.blockTile.y === y) return this.save.standing || held === 'wood' ? null : 'wood';
    if (this.pitTile?.x === x && this.pitTile.y === y) return held === 'splitWood' ? null : 'splitWood';
    return null;
  }

  /** O gesto da mão neste tile agora, se houver: a mesma pergunta que o botão faz. */
  public actionAt(x: number, y: number): string | null {
    const { stage } = this.save;
    const held = this.host.held();
    if (this.blockTile?.x === x && this.blockTile.y === y) {
      if (stage !== 'gather') return null;
      if (this.save.standing) return 'split';
      return held === 'wood' ? 'stand' : null;
    }
    if (this.pitTile?.x !== x || this.pitTile.y !== y) return null;
    if (stage === 'light') return 'light';
    return stage === 'gather' && held === 'splitWood' ? 'stack' : null;
  }

  // ── o fogo e a noite ────────────────────────────────────────────────────────────────────────────

}
