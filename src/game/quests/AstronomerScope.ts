// O TELESCÓPIO DA THEA, da lente ao céu: polir o vidro, montar o tubo no tripé, abrir a ocular e a despedida dela. O que
// a quest pede antes (o ferro, o vidro) é da AstronomerForge; as falas, da AstronomerQuest.

import { getSoundManager } from '@/game/audio/SoundManager';
import { tLines } from '@/game/i18n/i18n';
import { isLastQuest } from '@/game/runtime/QuestLog';
import { LensOverlay, SkyOverlay, SKY_TARGETS, type SkyTarget } from '@/game/runtime/SkyOverlays';
import type { AstronomerQuest } from './AstronomerQuest';

/** Para onde a câmera olha enquanto se pole: o trecho mais fechado do bosque perto dela, a nordeste. */
const LENS_LOOK_OFFSET = [7.5, -3.5] as const;
/** O topo do planalto ao sul, e o pé da escada por onde se sobe. */
export const SPOT_TILE = { x: 32, y: 20 };
export const STAIR_FOOT = [31, 23] as const;
/** Onde a nave pousa: no planalto, à esquerda do telescópio, sem encostar em quem estiver ao lado dele. */
const SHIP_LANDING = { x: 29.3, y: 20 };

/** O que AstronomerScope usa de AstronomerQuest. */
export type AstronomerScopeHost = Pick<AstronomerQuest,
  'ash' | 'dialogBase' | 'host' | 'isDone' | 'mark' | 'npc' | 'overlay' | 'sand' | 'save' | 'showMark'
  | 'showTelescope' | 'tripod' | 'tripodTile'
>;

export class AstronomerScope {
  public constructor(private readonly host: AstronomerScopeHost) {}

  private openUi(): boolean {
    if (this.host.overlay) return false;
    this.host.host.freeze(true);
    this.host.host.showButtons(false);
    return true;
  }

  private closeUi(): void {
    this.host.overlay?.destroy();
    this.host.overlay = undefined;
    this.host.host.lookAt(null);
    this.host.host.freeze(false);
    this.host.host.showButtons(true);
  }

  public startPolish(): void {
    if (this.host.host.held() !== 'glass') return;
    const hero = this.host.host.hero();
    const tile = this.host.tripodTile ?? hero;
    this.host.host.removeFromHand('glass', 1);
    this.host.host.fling('glass', hero.x, hero.y, tile.x, tile.y);
    this.host.save.stage = 'polish';
    this.host.host.persist();
    this.openPolish();
  }

  public openPolish(): void {
    const npc = this.host.npc;
    if (!npc || !this.openUi()) return;
    const sound = getSoundManager();
    this.host.host.lookAt({ x: npc.worldX + LENS_LOOK_OFFSET[0], y: npc.worldY + LENS_LOOK_OFFSET[1] });
    this.host.overlay = new LensOverlay({
      onRub: () => sound.work.playSandTrickle(),
      onPhase: () => sound.ui.playCozyChime(),
      onLeave: () => this.closeUi(),
      onDone: () => {
        this.closeUi();
        this.finishLens();
      },
    });
  }

  /** A lente boa vai ao tubo, o tubo ao tripé, e o conjunto às costas do herói. */
  private finishLens(): void {
    const tile = this.host.tripodTile;
    const hero = this.host.host.hero();
    this.host.tripod?.destroy();
    this.host.tripod = undefined;
    this.host.sand?.destroy();
    this.host.sand = undefined;
    this.host.ash?.destroy();
    this.host.ash = undefined;
    if (tile) this.host.host.fling('telescope', tile.x, tile.y, hero.x, hero.y);
    this.host.host.takeIntoHand('telescope', 1);
    this.host.save.stage = 'carry';
    this.host.showMark();
    this.host.host.persist();
    this.host.host.itemGet('telescope', () => {
      const at = this.host.npc;
      if (at) this.host.host.say({ ...this.host.dialogBase(), lines: tLines('npc.astronautStep.carry') }, at, () => this.host.host.markHeard());
    });
  }

  /** O telescópio em pé, no lugar do marco. */
  public install(): void {
    this.host.host.removeFromHand('telescope', 1);
    this.host.mark?.destroy();
    this.host.mark = undefined;
    this.host.showTelescope(true);
    this.host.host.sparkle(SPOT_TILE.x, SPOT_TILE.y);
    getSoundManager().work.playBridgePlank();
    getSoundManager().ui.playCozyChime();
    this.host.save.stage = 'night';
    this.host.host.persist();
  }

  public openSky(): void {
    if (!this.openUi()) return;
    const sound = getSoundManager();
    sound.ui.playPaperUnfold();
    this.host.overlay = new SkyOverlay({
      onFound: (target: SkyTarget) => {
        if (!this.host.save.found.includes(target)) this.host.save.found.push(target);
        this.host.host.persist();
      },
      onFocus: () => sound.ui.playItemBonk(),
      onCard: () => { sound.ui.playPaperUnfold(); sound.ui.playCozyChime(); },
      onLeave: () => {
        this.closeUi();
        this.host.host.sendSkyVisitorHome();
      },
      onDone: () => {
        this.host.overlay?.destroy();
        this.host.overlay = undefined;
        if (this.host.isDone) { this.closeUi(); return; }
        this.farewell();
      },
    }, this.host.save.found.filter((target): target is SkyTarget => (SKY_TARGETS as readonly string[]).includes(target)));
  }

  /** O save só aprende no fim: fechar o jogo no meio da cena volta para diante do telescópio. */
  private farewell(): void {
    this.host.host.showButtons(true);
    this.host.host.playFarewell({
      from: STAIR_FOOT,
      beside: SPOT_TILE,
      script: { ...this.host.dialogBase(), calm: true, lines: tLines('npc.astronautStep.farewell') },
      // Se este é o último pedido do vale, o adeus dela termina com a chave do jardim alto, antes da nave.
      goodbye: { ...this.host.dialogBase(), calm: true, lines: [...tLines('npc.astronautStep.goodbye'), ...(isLastQuest('astronaut') ? tLines('garden.key') : [])] },
      ship: SHIP_LANDING,
    }, () => {
      this.host.save.stage = 'done';
      this.host.save.departed = true;
      this.host.host.theaGone();
      this.host.host.persist();
      this.host.host.closeQuest();
      this.host.host.markHeard();
    });
  }
}
