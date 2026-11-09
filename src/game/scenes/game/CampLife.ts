// O DESCANSO E A COMPANHIA: sentar na fogueira, dormir no acampamento, o banco com vista, bater numa porta, o vizinho
// que traz chá e o que vem sentar junto, e a foice da Morte.

import { tLines, type I18nLine } from '@/game/i18n/i18n';
import { canStep } from '@/game/world/relief';
import { findVisitPath, fireSeats, VISIT_RADIUS, type VisitTile } from '@/game/world/visitPath';
import { CAMP_BED, CAMP_RING } from '@/game/objects/HeroCamp';
import { getSoundManager } from '@/game/audio/SoundManager';
import { getDialog, getDialogVoice } from '@/game/world/WorldData';
import { adventureState } from '@/game/runtime/adventureState';
import { FireVisitor } from '@/game/entities/FireVisitor';
import type { HomeKind } from '@/game/render3d/homeTextures';
import type { ValleyFind } from '@/game/objects/ValleyFinds';
import type { GameScene } from '../GameScene';
import { DIALOG_VOICES, NPC_DIALOGS } from '@/game/dialogs/NpcDialogs';
import { isNightTime, isSleepTime, setTimeScale } from '@/game/runtime/timeOfDay';
import { t } from '@/game/i18n/i18n';
import { CatCare } from '@/game/systems/CatCare';
import { Resting } from '@/game/systems/Resting';
import { USE_COOLDOWN_MS } from './sceneDefs';

/** O passo para cima do banco: sem pressa, mas sem a cerimônia da abertura. */
const FIND_STEP_MS = 300;

export class CampLife {
  // O DESCANSO (systems/Resting): sentado numa fogueira, num banco com vista, ao lado do telescópio, ou dormindo no
  // colchão do acampamento — com a Morte vindo nas noites de lá.
  public readonly rest: Resting;
  // A COMPANHIA: o gato que chega com o primeiro favor (e o barril dele), e o vizinho que vem sentar na fogueira.
  public readonly catCare: CatCare;

  public constructor(private readonly host: GameScene) {
    this.rest = new Resting({
      scene: this.host,
      hero: this.host.hero,
      heroTile: () => ({ x: this.host.playerWorld.worldX, y: this.host.playerWorld.worldY }),
      setTimeScale: (scale) => setTimeScale(scale),
      isSleepTime: () => isSleepTime(),
      isNightTime: () => isNightTime(),
      settleBody: () => {
        this.host.steps.stopBreathing();
        this.host.movementController?.hold(true);
        this.host.actions.controlsHint?.destroy();
        this.host.actions.controlsHint = undefined;
      },
      dropStep: () => this.host.movementController?.interruptMovement(this.host.playerWorld.worldX, this.host.playerWorld.worldY),
      freeFeet: () => {
        this.host.movementController?.interruptMovement(this.host.playerWorld.worldX, this.host.playerWorld.worldY);
        this.host.movementController?.hold(false);
      },
      dolly: (factor, ms) => { void this.host.cinema.dollyTo(factor, ms); },
      vignette: (level, ms) => this.host.cinema.setVignette(level, ms),
      listenKeys: (onKey) => {
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
      },
      hideBackItem: () => { this.host.carry.backItemBb?.setVisible(false); },
      dirt: (x, y, count) => this.host.debris.spawnDirtBurst(x, y, count),
      snoreSpot: () => {
        if (!this.host.camera) return null;
        const at = this.host.camera.tileToScreen(this.host.playerWorld.worldX, this.host.playerWorld.worldY, this.host.tileSize);
        return { x: at.x - this.host.tileSize * 0.45, y: at.y - this.host.tileSize * 0.45, px: Math.max(1, Math.round(this.host.tileSize / 24)) };
      },
      onStoodUp: (was) => {
        if (was.sleeping) this.host.carry.updateBackItem();
        if (was.atFind) this.host.cameraLook = undefined;
        this.host.questSetup.clearMug();
        this.host.actions.useBufferMs = 0;
        this.host.actions.useCooldownMs = USE_COOLDOWN_MS;
      },
      sendGuestHome: () => {
        // A casa só volta a ter gente quando ele chega.
        const visitor = this.host.questSetup.fireVisitor;
        if (!visitor) return;
        visitor.leave(() => {
          if (this.host.questSetup.fireVisitor === visitor) this.host.questSetup.fireVisitor = undefined;
          this.host.npcManager?.setKindAway(visitor.kind, false);
        });
      },
      keepGuestForSky: () => {
        this.host.questSetup.skyVisitor = this.host.questSetup.fireVisitor;
        this.host.questSetup.fireVisitor = undefined;
      },
      canVisit: () => this.host.adventure,
      heard: (key) => this.host.seenDialogKeys.has(key),
      hear: (key) => { this.host.seenDialogKeys.add(key); },
      persist: () => this.host.save.persistAdventure(),
      growOvernight: () => { this.host.questSetup.painterQuest?.growOvernight(); },
      isSolid: (x, y) => this.host.query.isSolidForEntities(x, y),
      guestTile: () => {
        const guest = this.host.questSetup.fireVisitor?.bodySprite;
        return guest ? { x: guest.x, y: guest.y } : null;
      },
      smoke: (x, y) => this.host.debris.spawnSmokePuff(x, y),
      deathSays: (body, lines, onClosed) => {
        this.host.dialog.dialogSpeaker = body;
        const script = { ...NPC_DIALOGS.death, npcName: t('death.name'), lines };
        this.host.dialog.openDialogScript(script, undefined, DIALOG_VOICES.death, () => {
          this.host.dialog.dialogSpeaker = undefined;
          this.host.cutsceneActive = true;
          this.host.actions.actionButtons?.setVisible(false);
          onClosed();
        });
      },
      cutscene: (on) => {
        this.host.cutsceneActive = on;
        this.host.actions.actionButtons?.setVisible(!on);
        this.host.pause.pauseTouchButton?.setVisible(!on);
      },
      leaveScythe: (at) => this.host.camp.dropDeathScythe(at),
    });
    this.catCare = new CatCare({
      scene: this.host,
      ready: () => this.host.adventure && Boolean(this.host.world3d),
      heroTile: () => ({ x: this.host.playerWorld.worldX, y: this.host.playerWorld.worldY }),
      facing: () => this.host.movementController?.facing ?? { dx: 0, dy: 1 },
      heroVisualTile: () => this.host.verbs.heroVisualTile(),
      isSolid: (x, y) => this.host.query.isSolidForEntities(x, y),
      restFire: () => (this.rest.isResting ? this.rest.fireTile ?? null : null),
      roaming: () => !this.host.cutsceneActive && !this.host.dialog.dialogOpen && !this.rest.isResting,
      canAct: () => this.host.actions.canAct(),
      hearts: (x, y) => this.host.sparkle.spawnHearts(x, y),
      narrate: (lines) => this.host.camp.narrate(lines),
      say: (script, voice) => this.host.dialog.openDialogScript(script, undefined, voice),
      voice: () => getDialogVoice('blackCat'),
      heard: (key) => this.host.seenDialogKeys.has(key),
      hear: (key) => { this.host.seenDialogKeys.add(key); },
      persist: () => this.host.save.persistAdventure(),
    });
  }

  /**
   * DESCANSAR. O Z numa fogueira ACESA (uma qualquer do vale; a do fim tem o gesto proprio ate os
   * creditos) senta o cavaleiro de frente para ela, e o tempo passa depressa: o ceu anda, a luz
   * muda, os grilos e os passaros trocam de turno. Nada a fazer, nada a ganhar — e esse e o ponto.
   * Qualquer tecla (ou seta) levanta.
   */
  public restAtFireAt(wx: number, wy: number): boolean {
    const fire = this.host.query.getRestFireAt(wx, wy);
    if (!fire?.isLit || this.rest.isResting) return false;
    this.rest.sit(wx, wy);
    this.inviteFireVisitor(wx, wy);
    return true;
  }

  /** A foice da Morte cai onde ela esteve (ver Resting), a menos que o herói já tenha uma. */
  public dropDeathScythe(at: { x: number; y: number }): void {
    const owned = this.host.heldItem === 'scythe' || (this.host.itemManager?.snapshot() ?? []).some((i) => i.kind === 'scythe');
    const tile = owned ? null : this.host.groundItems.dropNear('scythe', 1, at.x, at.y);
    if (tile) this.host.sparkle.spawnGrowSparkle(tile[0], tile[1]);
  }

  /**
   * DORMIR NO COLCHÃO DO ACAMPAMENTO (pedido do autor): o mago manda o herói descansar ali, e o Z diante do colchão o
   * leva para cima dele e o deita, com as pedras do acampamento ao lado. Não precisa de fogo aceso: é a casa dele. A
   * primeira noite aqui é quando a Morte aparece pela primeira vez (ver Resting).
   */
  private async sleepAtCamp(): Promise<void> {
    if (this.rest.isResting || this.host.cutsceneActive) return;
    this.host.cutsceneActive = true;
    await this.host.cinema.scriptStep(CAMP_BED.x - this.host.playerWorld.worldX, CAMP_BED.y - this.host.playerWorld.worldY, FIND_STEP_MS);
    this.host.movementController?.interruptMovement(CAMP_BED.x, CAMP_BED.y);
    this.host.cutsceneActive = false;
    this.rest.lieDown(CAMP_RING.x, CAMP_RING.y, { fixedBed: true, atCamp: true });
    this.host.seenDialogKeys.add('wizard:tent');
    this.host.save.persistAdventure();
  }

  /** O Z numa peça do acampamento: uma linha curta, do que ela é (e de quem é a lembrança). */
  public useCampAt(wx: number, wy: number): boolean {
    const piece = this.host.valley.heroCamp?.at(wx, wy);
    if (!piece) return false;
    getSoundManager().work.playFindTouch('bench');
    // O COLCHÃO: deitar e dormir.
    if (piece === 'bed') {
      void this.sleepAtCamp();
      return true;
    }
    // O TRONCO é lugar de sentar: o herói senta nele e fica olhando as pedras do fogo.
    if (piece === 'log') {
      void this.sitAtFind({ kind: 'bench', x: wx, y: wy }, { x: CAMP_RING.x, y: CAMP_RING.y });
      return true;
    }
    this.narrate(tLines(`camp.${piece}`));
    return true;
  }

  /** O Z num achado: o que tem vista senta, o resto se lê. */
  public useFindAt(wx: number, wy: number): boolean {
    const find = this.host.valley.valleyFinds?.at(wx, wy);
    if (!find) return false;
    getSoundManager().work.playFindTouch(find.kind);
    if (find.view) { void this.sitAtFind(find, find.view); return true; }
    if (find.owner) { this.knockAt(find.owner, { worldX: find.x, worldY: find.y }); return true; }
    // A placa do jardim alto muda quando o portão abre.
    this.narrate(tLines(find.kind === 'sign' && this.host.gateOpened ? 'finds.signOpen' : `finds.${find.kind}`));
    return true;
  }

  /** Uma linha sem ninguém falando: o roteiro do mago, sem nome e sem voz (os achados, o acampamento, o barril). */
  public narrate(lines: I18nLine[]): void {
    const base = getDialog('wizard');
    if (base) this.host.dialog.openDialogScript({ ...base, npcName: '', lines }, undefined, undefined);
  }

  /** Bater à porta: quem mora ali não abre, mas chama para a varanda. A casa da Thea, depois da nave, só tem a varanda. */
  private knockAt(owner: HomeKind, door: { worldX: number; worldY: number }): void {
    const gone = owner === 'astronaut' && adventureState().skyQuest.departed;
    const base = gone ? getDialog('wizard') : getDialog(owner);
    if (!base) return;
    const lines = tLines(`finds.door.${gone ? 'empty' : owner}`);
    if (gone) this.host.dialog.openDialogScript({ ...base, npcName: '', lines }, undefined, undefined);
    else this.host.dialog.openDialogScript({ ...base, lines }, door, getDialogVoice(owner));
  }

  /**
   * SENTAR NUM ACHADO: o herói dá um passo para cima dele e vira de frente. O tile continua sólido para
   * quem vem de fora, mas nada impede de sair dele, e por isso levantar é só andar.
   */
  private async sitAtFind(find: ValleyFind, view: { x: number; y: number }): Promise<void> {
    this.host.cutsceneActive = true;
    await this.host.cinema.scriptStep(find.x - this.host.playerWorld.worldX, find.y - this.host.playerWorld.worldY, FIND_STEP_MS);
    this.host.movementController?.interruptMovement(find.x, find.y);
    this.host.cutsceneActive = false;
    this.host.cinema.scriptFace(0, 1);
    this.rest.sitOnFind(view);
    this.host.cameraLook = view;
    if (find.owner) this.neighbourBringsTea(find.owner, { x: find.x, y: find.y });
  }

  /** Na varanda de alguém, esse alguém vem: caminha até o banco, senta do lado e traz a caneca. Sem pedir nada. */
  private neighbourBringsTea(owner: HomeKind, seat: { x: number; y: number }): void {
    if (owner === 'astronaut' && adventureState().skyQuest.departed) return;
    const home = this.host.npcManager?.getActiveWorldPositions().find((n) => n.kind === owner);
    if (home) void this.host.questSetup.bringMug([home.worldX, home.worldY], seat, owner);
  }

  /**
   * O VIZINHO MAIS PERTO VEM SENTAR na fogueira em que o heroi acabou de sentar — se houver um a
   * ate VISIT_RADIUS tiles, com caminho de verdade ate um lugar livre em volta do fogo.
   */
  private inviteFireVisitor(fx: number, fy: number): void {
    if (this.host.questSetup.fireVisitor || !this.host.npcManager || !this.host.adventure) return;
    const hx = this.host.playerWorld.worldX;
    const hy = this.host.playerWorld.worldY;
    const seats = fireSeats([fx, fy], [hx, hy], (x, y) => !this.host.query.isSolidForEntities(x, y) && !this.host.itemManager?.hasItemAt(x, y));
    if (seats.length === 0) return;
    const neighbours = this.host.npcManager.getActiveWorldPositions()
      .filter((n) => Math.hypot(n.worldX - fx, n.worldY - fy) <= VISIT_RADIUS)
      .sort((a, b) => Math.hypot(a.worldX - fx, a.worldY - fy) - Math.hypot(b.worldX - fx, b.worldY - fy));
    for (const n of neighbours.slice(0, 3)) {
      const path = this.visitPath([n.worldX, n.worldY], seats, [hx, hy], [fx, fy]);
      if (!path) continue;
      this.host.npcManager.setKindAway(n.kind, true);
      this.host.questSetup.fireVisitor = new FireVisitor(this.host, n.kind, path);
      this.host.questSetup.fireVisitor.arrive();
      return;
    }
  }

  /** O caminho de quem vem sentar (ver world/visitPath), pelo chão que o herói também não atravessa. */
  public visitPath(
    home: VisitTile,
    seats: ReadonlyArray<VisitTile>,
    hero: VisitTile,
    fire: VisitTile,
  ): Array<[number, number]> | null {
    return findVisitPath(home, seats, hero, fire, (x, y, nx, ny) => !this.host.query.isSolidForEntities(nx, ny) && canStep(x, y, nx, ny));
  }
}
