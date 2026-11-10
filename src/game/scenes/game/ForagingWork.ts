// A COLHEITA DE COGUMELOS: o mini-jogo da faca, o cesto, a faca emprestada e devolvida ao Shui (e o aceno dele), e
// o olhar para o cogumelo-parente.

import { CHUNK_COLUMNS, CHUNK_ROWS, dialogBoxMetrics } from '@/game/constants';
import type { DialogScript } from '@/game/dialogs/NpcDialogs';
import type { HeldItemKind } from '@/game/entities/ItemPickup';
import { tLines } from '@/game/i18n/i18n';
import { isMushroomKind, type MushroomKind } from '@/game/fungi/fungi';
import { ForagingOverlay } from '@/game/runtime/ForagingOverlay';
import { RELIEF_HIGH, reliefAt } from '@/game/world/relief';
import { NpcWave } from '@/game/entities/NpcWave';
import { isTouchDevice } from '@/game/runtime/PauseMenu';
import { BagStash } from '@/game/runtime/BagStash';
import { MushroomKin } from '@/game/objects/MushroomKin';
import { getSoundManager } from '@/game/audio/SoundManager';
import { getChunkTerrain, getHeldItemPickups, getOccupiedTiles } from '@/game/world/WorldData';
import { adventureState } from '@/game/runtime/adventureState';
import type * as Engine from '@/game/engine';
import type { GameScene } from '../GameScene';
import { FORAGER_DIALOG, ITEM_VISUAL_2D } from './sceneDefs';

/** O olhar da câmera para o porcini na fala da Shui: ida e volta, e quanto ela segura nele. */
const GLANCE_PAN_MS = 700;
const GLANCE_HOLD_MS = 1500;

/** O que ForagingWork usa de GameScene (e a cena do motor, que ele passa a quem monta objetos do mundo). */
export type ForagingWorkHost = Engine.Scene & Pick<GameScene,
  'actions' | 'adventure' | 'bumps' | 'camera' | 'cutsceneActive' | 'dialog' | 'dialogCam' | 'hand'
  | 'heldItem' | 'inventory' | 'itemManager' | 'movementController' | 'npcManager' | 'orders' | 'playerWorld' | 'props'
  | 'save' | 'scale' | 'seenItems' | 'sparkle' | 'steps' | 'tileSize' | 'time' | 'world3d'
>;

export class ForagingWork {
  /** A colheita de um cogumelo aberta (ver harvestMushroomAt). Congela o mundo como o catálogo. */
  public foraging?: ForagingOverlay;
  /** O cogumelo colhido indo para a bolsa de couro (runtime/BagStash). */
  public bagStash?: BagStash;
  /** Os cogumelinhos-filhos em volta de cada cogumelo ainda não colhido (objects/MushroomKin). */
  public mushroomKin?: MushroomKin;
  /** O tchau da Shui lá de baixo (entities/NpcWave), e se ela já acenou nesta subida. */
  public shuiWave?: NpcWave;
  public shuiWaved = false;

  public constructor(private readonly host: ForagingWorkHost) {}

  /**
   * A COLHEITA DE UM COGUMELO (ver ForagingOverlay): cortar na altura certa, serrar, escovar, ler a
   * ficha. O Z e o X trazem aqui diante de um cogumelo nascendo; sem a faca, o herói só pensa nela.
   *
   * O cogumelo SÓ SAI DO CHÃO quando entra na cesta (`basketMushroom`), no mesmo frame: uma
   * colheita largada no meio (sair antes do corte, fechar o jogo) deixa o cogumelo onde estava.
   */
  public harvestMushroomAt(wx: number, wy: number): boolean {
    const kind = this.host.itemManager?.kindAt(wx, wy);
    if (!isMushroomKind(kind)) return false;
    if (this.foraging) return true;
    // A FACA PRECISA ESTAR NAS COSTAS (a guardada já veio: ToolSwing.equipToolFor). Sem ela, o herói pensa nela.
    if (this.host.heldItem !== 'knife') {
      this.host.bumps.thinkOfNeed(wx, wy, true);
      return true;
    }
    this.host.actions.useBufferMs = 0;
    this.host.steps.stopBreathing();
    this.host.movementController?.interruptMovement(this.host.playerWorld.worldX, this.host.playerWorld.worldY);
    this.host.actions.actionButtons?.setVisible(false);
    // A tarja de teclas mentiria por cima da colheita (a tela diz os próprios botões).
    this.host.actions.controlsHint?.destroy();
    this.host.actions.controlsHint = undefined;
    const sound = getSoundManager();
    this.foraging = new ForagingOverlay(kind, {
      onMiss: () => sound.ui.playItemBonk(),
      onCut: () => sound.work.playMushroomCut(),
      onSand: () => sound.work.playSandTrickle(),
      onClean: () => sound.ui.playCozyChime(),
      onStash: () => sound.ui.playItemStash(),
      onNote: () => sound.ui.playPaperUnfold(),
      onDone: () => this.basketMushroom(kind, wx, wy),
      onCancel: () => this.closeForaging(),
    }, isTouchDevice());
    return true;
  }

  private closeForaging(): void {
    this.foraging = undefined;
    this.host.actions.actionButtons?.setVisible(true);
  }

  /**
   * O cogumelo limpo vai para a CESTA da Shui, e a faca fica na mão. É a única exceção à lei de uma
   * coisa de cada vez: tantas viagens de ida e volta não ensinavam nada, e era o trecho com mais cara de
   * tarefa do jogo. Ela leva tudo de uma vez ao falar com o herói (ver `settleBasket`).
   */
  private basketMushroom(kind: MushroomKind, wx: number, wy: number): void {
    this.closeForaging();
    this.host.itemManager?.takeAt(wx, wy);
    this.mushroomKin?.wither(kind); // a trilha levava a ele: sem ele, ela some
    const first = !this.host.seenItems.has(kind);
    adventureState().basket.push(kind);
    this.host.seenItems.add(kind);
    // GUARDAR NA BOLSA (pedido do autor): a bolsa de couro à direita, o cogumelo na mão esquerda, e ele passa
    // de uma para a outra. Substituiu o balão de pensamento com a cesta.
    const sound = getSoundManager();
    const visual = ITEM_VISUAL_2D[kind];
    this.bagStash?.destroy();
    this.bagStash = new BagStash(this.host, visual.texture, visual.frame, {
      open: () => sound.ui.playBagOpen(),
      toss: () => sound.ui.playBagToss(),
      land: () => sound.ui.playBagLand(),
      clasp: () => sound.ui.playBagClasp(),
    }, () => { this.bagStash = undefined; });
    if (first) this.host.time.delayedCall(1200, () => getSoundManager().ui.playSingingBowl());
    this.host.save.persistAdventure();
  }

  /**
   * O TCHAU DE LÁ DE BAIXO (pedido do autor): o herói sobe a serra, para na BORDA do planalto olhando para a
   * Shui lá embaixo, e ela acena. Uma vez por subida: ela só acena de novo depois que ele desce ou se afasta.
   */
  public tickShuiWave(): void {
    if (!this.host.adventure || this.host.cutsceneActive || this.host.dialog.dialogOpen || this.shuiWave) return;
    const npc = this.host.npcManager?.getActiveWorldPositions().find((n) => n.kind === FORAGER_DIALOG);
    if (!npc) return;
    const hx = this.host.playerWorld.worldX;
    const hy = this.host.playerWorld.worldY;
    const dx = npc.worldX - hx;
    const dy = npc.worldY - hy;
    const dist = Math.abs(dx) + Math.abs(dy);
    const onHigh = reliefAt(hx, hy) === RELIEF_HIGH;
    if (!onHigh || dist > 12) { this.shuiWaved = false; return; }
    if (this.shuiWaved || reliefAt(npc.worldX, npc.worldY) === RELIEF_HIGH || dist > 9) return;
    const f = this.host.movementController?.facing ?? { dx: 0, dy: 1 };
    // Olhando PARA ela (o eixo do olhar é o maior dos dois) e com o chão de baixo logo à frente: a borda.
    const along = f.dx * dx + f.dy * dy;
    const across = Math.abs(f.dx !== 0 ? dy : dx);
    const atEdge = reliefAt(hx + f.dx, hy + f.dy) !== RELIEF_HIGH;
    if (along <= 0 || across > along || !atEdge) return;
    const body = this.host.npcManager?.bodyAt(npc.worldX, npc.worldY);
    if (!body) return;
    this.shuiWaved = true;
    this.host.npcManager?.hop(npc.worldX, npc.worldY, 0.18);
    getSoundManager().nature.playFarWave();
    this.shuiWave = new NpcWave(this.host, body, () => { this.shuiWave = undefined; });
  }

  /**
   * A FACA ESTÁ COM A SHUI? Ela é derivada, não guardada: depois do presente, a faca que não está
   * com o herói (nas costas ou guardada), nem no chão, nem num altar, voltou para ela. Um booleano no
   * save seria uma segunda verdade, e a faca largada num canto do mapa provaria que ele mente.
   */
  public knifeWithShui(): boolean {
    if (!this.host.adventure || !adventureState().giftsGiven.has(FORAGER_DIALOG)) return false;
    if (this.host.inventory.owns('knife')) return false;
    if (this.host.props.altars.some((altar) => altar.carrying === 'knife')) return false;
    return !(this.host.itemManager?.snapshot().some((it) => it.kind === 'knife') ?? false);
  }

  /** A Shui devolve a faca: ela salta da mão dela para a do herói. */
  public returnKnife(npcWorld?: { worldX: number; worldY: number }): void {
    const { worldX: hx, worldY: hy } = this.host.playerWorld;
    if (npcWorld) {
      this.host.npcManager?.hop(npcWorld.worldX, npcWorld.worldY);
      this.host.orders.flingCraftedItem('knife', npcWorld.worldX, npcWorld.worldY, hx, hy);
    }
    this.host.time.delayedCall(200, () => {
      this.host.hand.takeIntoHand('knife');
      getSoundManager().ui.playSwordPickup();
      this.host.save.persistAdventure();
    });
  }

  /** O cogumelo colhido recusa o chão: um tranco e o som de recusa, nunca uma legenda. */
  public refuseMushroomDrop(): void {
    this.host.world3d?.cam.shake(80, 0.002);
    getSoundManager().ui.playToolboxRefuse();
  }

  /**
   * OS COGUMELINHOS-FILHOS: em volta de cada cogumelo do mapa ainda não colhido (cada espécie existe uma vez e não
   * renasce, então "já teve na mão" é "já saiu do chão"). Um filho só nasce em chão limpo — sem enfeite,
   * árvore, peça, item ou NPC — e no mesmo nível do cogumelo: nada na encosta, na escada ou do outro lado da serra.
   */
  public makeMushroomKin(): MushroomKin | undefined {
    if (!this.host.adventure) return undefined;
    const mothers = getHeldItemPickups()
      .filter((p) => isMushroomKind(p.type) && !this.host.seenItems.has(p.type as HeldItemKind))
      .map((p) => ({ kind: p.type as MushroomKind, worldX: p.worldX, worldY: p.worldY }));
    if (mothers.length === 0) return undefined;
    const taken = getOccupiedTiles();
    return new MushroomKin(this.host, mothers, (x, y, mother) => {
      if (taken.has(`${x},${y}`)) return false;
      if (reliefAt(x, y) !== reliefAt(mother.worldX, mother.worldY)) return false;
      const terrain = getChunkTerrain(Math.floor(x / CHUNK_COLUMNS), Math.floor(y / CHUNK_ROWS));
      const lx = ((x % CHUNK_COLUMNS) + CHUNK_COLUMNS) % CHUNK_COLUMNS;
      const ly = ((y % CHUNK_ROWS) + CHUNK_ROWS) % CHUNK_ROWS;
      // SÓ EM CHÃO LIMPO (pedido do autor): em cima de arbusto, flor ou mato alto o filho parecia defeito. O
      // world.json já deixa liso o chão sorteado para eles (scripts/chao-dos-filhos.mjs, com a mesma conta).
      return !terrain.collisions[ly]?.[lx] && terrain.upper[ly]?.[lx] == null;
    });
  }

  /**
   * O PORCINI NA FALA DA SHUI (pedido do autor): na linha em que ela diz "aqui do meu lado esquerdo", a câmera
   * vai devagar até o cogumelo, ele brilha, e ela volta para a conversa. É o primeiro corte do jogo: tem de ser óbvio.
   */
  public withPorciniGlance(script: DialogScript, npcWorld: { worldX: number; worldY: number }): DialogScript {
    const text = tLines(`npc.${FORAGER_DIALOG}Hint.porcini`)[0]?.text;
    const index = text ? script.lines.findIndex((line) => line.text === text) : -1;
    if (index < 0) return script;
    const spot = (this.host.itemManager?.snapshot() ?? [])
      .filter((item) => item.kind === 'porcini' && Math.hypot(item.worldX - npcWorld.worldX, item.worldY - npcWorld.worldY) <= 6)[0];
    if (!spot) return script;
    const before = script.onLine;
    return {
      ...script,
      onLine: (i) => {
        before?.(i);
        if (i === index) this.glanceAt({ x: spot.worldX, y: spot.worldY }, npcWorld);
      },
    };
  }

  /** A câmera da conversa olha para um ponto do mundo, segura e volta para o NPC (só se a conversa continua). */
  private glanceAt(spot: { x: number; y: number }, npcWorld: { worldX: number; worldY: number }): void {
    if (!this.host.camera) return;
    const base = this.host.dialogCam.baseScreenCenter();
    const { boxHeight, margin } = dialogBoxMetrics(this.host.scale.width, this.host.scale.height);
    const stageCenterY = Math.floor((this.host.scale.height - boxHeight - margin) / 2);
    const dx = spot.x - this.host.playerWorld.worldX;
    const dy = spot.y - this.host.playerWorld.worldY;
    this.host.dialogCam.animateScreenCenter(Math.round(base.x - dx * this.host.tileSize), Math.round(stageCenterY - dy * this.host.tileSize), GLANCE_PAN_MS);
    this.host.time.delayedCall(GLANCE_PAN_MS, () => {
      if (!this.host.dialog.dialogOpen) return;
      this.host.sparkle.spawnGlint(spot.x, spot.y, 0.32, 0.6);
      getSoundManager().story.playKeyJingle();
    });
    this.host.time.delayedCall(GLANCE_PAN_MS + GLANCE_HOLD_MS, () => {
      if (!this.host.dialog.dialogOpen || this.host.dialog.dialogNpcWorld !== npcWorld) return;
      const back = this.host.dialogCam.dialogScreenCenter(npcWorld);
      this.host.dialogCam.animateScreenCenter(back.x, back.y, GLANCE_PAN_MS);
    });
  }
}
