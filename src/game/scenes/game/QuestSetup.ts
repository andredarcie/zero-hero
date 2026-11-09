// AS QUESTS MONTADAS: o que cada uma pode pedir à cena (o host), o lenhador, a astrônoma (a nave, a caneca, ela vindo
// até o herói) e a pintora.

import * as Engine from '@/game/engine';
import type { DialogScript } from '@/game/dialogs/NpcDialogs';
import { isNightTime } from '@/game/runtime/timeOfDay';
import type { HeldItemKind } from '@/game/entities/ItemPickup';
import { CampfireObject } from '@/game/objects/CampfireObject';
import { PainterQuest } from '@/game/quests/PainterQuest';
import { LumberQuest } from '@/game/quests/LumberQuest';
import { AstronomerQuest } from '@/game/quests/AstronomerQuest';
import { getSoundManager } from '@/game/audio/SoundManager';
import type { NpcKind } from '@/game/world/ScreenContent';
import { getChunkContent, getWorldBounds, getDialog, getDialogVoice } from '@/game/world/WorldData';
import { adventureState } from '@/game/runtime/adventureState';
import { FireVisitor } from '@/game/entities/FireVisitor';
import { TeaBreak } from '@/game/entities/TeaBreak';
import type { TheaShipHost } from '@/game/entities/TheaShip';
import type { GameScene } from '../GameScene';
import { LUMBER_DIALOG, PAINTER_DIALOG, SKY_DIALOG } from './sceneDefs';

const PORCH_SEATS = [[1, 0], [-1, 0], [1, 1], [-1, 1], [0, 1]] as const;
const TELESCOPE_SEATS = [[1, 0], [0, -1], [0, 1], [-1, 0], [-1, 1], [1, 1]] as const;

export class QuestSetup {
  /** As duas canecas e os goles, enquanto a noite não vem. */
  private teaBreak?: TeaBreak;

  public painterQuest?: PainterQuest;
  public lumberQuest?: LumberQuest;
  public astronomerQuest?: AstronomerQuest;
  public fireVisitor?: FireVisitor;
  /** A Thea, sentada ao lado do telescópio: fica ali durante a ocular e é ela quem fala no fim. */
  public skyVisitor?: FireVisitor;

  public constructor(private readonly host: GameScene) {}

  /** O que uma quest em etapas pede da cena: a mão, o chão, os gestos e o congelar. */
  private questHost() {
    return {
      scene: this.host as Engine.Scene,
      held: () => this.host.heldItem,
      takeIntoHand: (kind: HeldItemKind, units: number) => this.host.hand.takeIntoHand(kind, units),
      removeFromHand: (kind: HeldItemKind, units: number) => {
        if (this.host.torch.heldOnFire) this.host.torch.extinguishTorch();
        this.host.inventory.remove(kind, units);
        this.host.carry.updateBackItem();
      },
      onGround: (kind: HeldItemKind) => (this.host.itemManager?.snapshot() ?? []).some((i) => i.kind === kind),
      takeFromGround: (kind: HeldItemKind) => {
        const it = this.host.itemManager?.snapshot().find((i) => i.kind === kind);
        return it ? this.host.itemManager?.takeAt(it.worldX, it.worldY) !== undefined : false;
      },
      dropAt: (kind: HeldItemKind, x: number, y: number) => {
        if (this.host.query.isTileOccupied(x, y)) this.host.groundItems.dropNear(kind, 1, x, y);
        else this.host.groundItems.dropItem(kind, x, y);
      },
      hero: () => ({ x: this.host.playerWorld.worldX, y: this.host.playerWorld.worldY }),
      isFree: (x: number, y: number) => !this.host.query.isSolidForEntities(x, y) && !this.host.itemManager?.hasItemAt(x, y)
        && !this.host.query.getPlantSpotAt(x, y) && !this.host.query.isOpenWaterAt(x, y),
      fling: (kind: HeldItemKind, fromX: number, fromY: number, toX: number, toY: number) => this.host.orders.flingCraftedItem(kind, fromX, fromY, toX, toY),
      itemGet: (kind: HeldItemKind, onDone: () => void) => {
        if (this.host.seenItems.has(kind)) { getSoundManager().ui.playSwordPickup(); onDone(); return; }
        this.host.seenItems.add(kind);
        this.host.hand.showItemGet(kind, onDone);
      },
      hop: (x: number, y: number, height?: number) => { this.host.npcManager?.hop(x, y, height); },
      hearts: (x: number, y: number) => this.host.sparkle.spawnHearts(x, y),
      sparkle: (x: number, y: number) => this.host.sparkle.spawnGrowSparkle(x, y),
      freeze: (frozen: boolean) => {
        this.host.cutsceneActive = frozen;
        if (frozen) {
          this.host.steps.stopBreathing();
          this.host.actions.controlsHint?.destroy();
          this.host.actions.controlsHint = undefined;
        }
      },
      showButtons: (visible: boolean) => this.host.actions.actionButtons?.setVisible(visible),
      persist: () => this.host.save.persistAdventure(),
    };
  }

  public buildLumberQuest(): void {
    if (!this.host.adventure) return;
    const bounds = getWorldBounds();
    let npc: { worldX: number; worldY: number } | undefined;
    for (let cy = bounds.minCy; cy <= bounds.maxCy; cy += 1) {
      for (let cx = bounds.minCx; cx <= bounds.maxCx; cx += 1) {
        const found = getChunkContent(cx, cy).npcs.find((n) => n.type === 'businessMan');
        if (found) npc = { worldX: found.worldX, worldY: found.worldY };
      }
    }
    if (!npc) return;
    const quest = new LumberQuest({
      ...this.questHost(),
      say: (script, at, onClosed) => this.host.dialog.openDialogScript(script, at, getDialogVoice('businessMan'), onClosed),
      closeQuest: () => this.host.delivery.questEvent({ type: 'fire' }),
      markHeard: () => {
        if (this.lumberQuest) this.host.seenDialogKeys.add(this.lumberQuest.talkKey());
        this.host.save.persistAdventure();
      },
      dust: (x, y) => {
        this.host.debris.spawnSmokePuff(x, y);
        this.host.debris.spawnDirtBurst(x, y, 6);
      },
      shake: () => this.host.world3d?.cam.shake(70, 0.006),
      addFire: (x, y) => {
        // In place: o propRegistry referencia este array.
        const fire = new CampfireObject(this.host, x, y, false);
        this.host.props.campfires.push(fire);
        return fire;
      },
      playNight: (night, onDone) => { void this.host.campfireNight.playCampfireNight(night, onDone); },
    });
    quest.setDialogBase(() => getDialog('businessMan', LUMBER_DIALOG) as DialogScript);
    this.lumberQuest = quest;
    quest.build(npc);
  }

  /** A QUEST DA THEA: tudo o que ela precisa da cena passa por aqui (ver AstronomerHost). */
  public buildAstronomerQuest(): void {
    if (!this.host.adventure) return;
    const bounds = getWorldBounds();
    let npc: { worldX: number; worldY: number } | undefined;
    for (let cy = bounds.minCy; cy <= bounds.maxCy; cy += 1) {
      for (let cx = bounds.minCx; cx <= bounds.maxCx; cx += 1) {
        const found = getChunkContent(cx, cy).npcs.find((n) => n.type === 'astronaut');
        if (found) npc = { worldX: found.worldX, worldY: found.worldY };
      }
    }
    if (!npc) return;
    const quest = new AstronomerQuest({
      ...this.questHost(),
      say: (script, at, onClosed) => this.host.dialog.openDialogScript(script, at, getDialogVoice('astronaut'), onClosed),
      closeQuest: () => this.host.delivery.questEvent({ type: 'sky' }),
      markHeard: () => {
        if (this.astronomerQuest) this.host.seenDialogKeys.add(this.astronomerQuest.talkKey());
        this.host.save.persistAdventure();
      },
      hearts: (x, y) => this.host.sparkle.spawnHearts(x, y),
      lookAt: (tile) => { this.host.cameraLook = tile ?? undefined; },
      seen: (kind) => this.host.seenItems.has(kind),
      isNight: () => isNightTime(),
      waitForNight: (x, y, onNight, company) => {
        this.host.camp.rest.waitForNight(x, y, onNight);
        if (company) void this.bringMug(company.from, company.beside);
      },
      sendSkyVisitorHome: () => {
        const visitor = this.skyVisitor;
        this.skyVisitor = undefined;
        visitor?.leave(() => this.host.npcManager?.setKindAway('astronaut', false));
      },
      playFarewell: (farewell, onDone) => { void this.host.marks.playStarFarewell(farewell, onDone); },
      theaGone: () => this.host.npcManager?.setKindHidden('astronaut', true),
    });
    quest.setDialogBase(() => getDialog('astronaut', SKY_DIALOG) as DialogScript);
    this.astronomerQuest = quest;
    quest.build(npc);
  }

  /**
   * O FIM DA QUEST DA THEA: o último alvo saiu da ocular, e ela vem subindo a escada, senta ao lado do
   * herói e fala. Depois um corte curto, e ela já está em casa. O céu continua, e a noite também.
   */
  /** Ela vem sentar ao lado disto: o corpo é um stand-in, e o de verdade fica fora de casa enquanto isso. */
  public theaComesTo(from: readonly [number, number], beside: { x: number; y: number }, kind: NpcKind = 'astronaut'): FireVisitor {
    const hero: [number, number] = [this.host.playerWorld.worldX, this.host.playerWorld.worldY];
    // Na varanda ele senta do lado ou na frente: atrás do banco ninguém o veria.
    const offsets = this.host.camp.rest.atFind ? PORCH_SEATS : TELESCOPE_SEATS;
    const seats = offsets
      .map(([dx, dy]) => [beside.x + dx, beside.y + dy] as [number, number])
      .filter(([x, y]) => !(x === hero[0] && y === hero[1]) && !this.host.query.isSolidForEntities(x, y));
    this.host.npcManager?.setKindAway(kind, true);
    const path = this.host.camp.visitPath(from, seats, hero, [beside.x, beside.y]);
    const visitor = new FireVisitor(this.host, kind, path ?? [from, seats[0] ?? from]);
    visitor.arrive();
    return visitor;
  }

  /** ESPERAR A NOITE: ela sobe sem falar nada, senta, e os dois tomam o chá (ver TeaBreak). */
  public async bringMug(from: readonly [number, number], beside: { x: number; y: number }, kind: NpcKind = 'astronaut'): Promise<void> {
    const visitor = this.theaComesTo(from, beside, kind);
    this.fireVisitor = visitor;
    // Quem mora longe demora: a caneca só sai quando ele senta de verdade.
    for (let i = 0; i < 400 && !visitor.isSeated; i += 1) {
      await this.host.cinema.wait(120);
      if (!this.host.camp.rest.isResting || this.fireVisitor !== visitor) return;
    }
    if (!this.host.camp.rest.isResting || this.fireVisitor !== visitor || !visitor.isSeated) return;
    // O corpo dela ainda está baixando para sentar: a escala de descanso só vale depois disso.
    await this.host.cinema.wait(450);
    if (!this.host.camp.rest.isResting || this.fireVisitor !== visitor) return;
    this.teaBreak = new TeaBreak({
      scene: this.host,
      heroBody: this.host.hero,
      heroTile: { x: this.host.playerWorld.worldX, y: this.host.playerWorld.worldY },
      thea: visitor.bodySprite,
      sparkle: (x, y) => this.host.sparkle.spawnGrowSparkle(x, y),
      hearts: (x, y) => this.host.sparkle.spawnHearts(x, y),
    });
  }

  public clearMug(): void {
    this.teaBreak?.destroy();
    this.teaBreak = undefined;
  }

  /** O que a nave pede da cena, venha ela para buscar ou para trazer a Thea. */
  public shipHost(at: { x: number; y: number }): TheaShipHost {
    return {
      scene: this.host,
      at,
      smoke: (x, y) => this.host.debris.spawnSmokePuff(x, y),
      dirt: (x, y, count) => this.host.debris.spawnDirtBurst(x, y, count),
      shake: (ms, amplitude) => this.host.world3d?.cam.shake(ms, amplitude),
      sparkle: (x, y) => this.host.sparkle.spawnGrowSparkle(x, y),
      project: (x, y, elevation) => this.host.world3d?.projection.projectTile(x, y, elevation) ?? { x: 0, y: 0 },
    };
  }

  /** A QUEST DA SISI: tudo o que ela precisa da cena passa por aqui (ver PainterHost). */
  public buildPainterQuest(): void {
    if (!this.host.adventure) return;
    const bounds = getWorldBounds();
    let npc: { worldX: number; worldY: number } | undefined;
    for (let cy = bounds.minCy; cy <= bounds.maxCy; cy += 1) {
      for (let cx = bounds.minCx; cx <= bounds.maxCx; cx += 1) {
        const found = getChunkContent(cx, cy).npcs.find((n) => n.type === 'painter');
        if (found) npc = { worldX: found.worldX, worldY: found.worldY };
      }
    }
    if (!npc) return;
    const dug = adventureState().dugSpots;
    const quest = new PainterQuest({
      ...this.questHost(),
      heldCount: (kind) => this.host.inventory.count(kind),
      dugHoles: () => this.host.props.plantSpots.filter((spot) => spot.isHole && dug.has(`${spot.worldX},${spot.worldY}`)).length,
      spotAt: (x, y) => this.host.query.getPlantSpotAt(x, y),
      swing: (x, y) => this.host.swing.swingHeld(x, y),
      say: (script, at, onClosed) => this.host.dialog.openDialogScript(script, at, getDialogVoice('painter'), onClosed),
      closeQuest: () => this.host.delivery.questEvent({ type: 'paint' }),
      markHeard: () => {
        if (this.painterQuest) this.host.seenDialogKeys.add(this.painterQuest.talkKey());
        this.host.save.persistAdventure();
      },
    });
    quest.setDialogBase(() => getDialog('painter', PAINTER_DIALOG) as DialogScript);
    this.painterQuest = quest;
    quest.build(npc);
  }
}
