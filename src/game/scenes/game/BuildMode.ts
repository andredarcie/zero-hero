// O MODO DE CONSTRUÇÃO DA BANCADA (pedido do autor, 2026-11-17): o Z na bancada para o jogo inteiro (até a música),
// a câmera enquadra o acampamento e o chão dele vira uma grade — verde onde dá para pôr, vermelho onde não dá (o mato
// alto que só a foice da Morte corta, e o tile que fecharia o caminho). Embaixo, a tábua com o que dá para pôr: as
// construções, pagas com o material guardado na bancada, e as lembranças dos pedidos fechados, que não custam nada mas
// só valem postas pela mão do jogador. Escolhe-se uma carta e um tile verde (o dedo, o mouse, ou as setas e o Z); uma
// peça já posta, clicada, sobe para mudar de lugar. Com o jogo parado nada se desenha sozinho: cada peça posta pede
// UM quadro à mão (o mesmo truque do ajuste do zoom, PauseControl).

import { getSoundManager } from '@/game/audio/SoundManager';
import { t } from '@/game/i18n/i18n';
import { isQuestDone } from '@/game/runtime/QuestLog';
import { questFor } from '@/game/dialogs/NpcQuests';
import { CAMP_BED, CAMP_BENCH, CAMP_CENTER, CAMP_NOTEBOOK } from '@/game/objects/HeroCamp';
import {
  BENCH_MATERIALS, canAfford, homeBuild, homeMenu, refund, spend, type HomePieceKind,
} from '@/game/objects/homeBuilds';
import { pieceTexture } from '@/game/objects/CampPieces';
import { pieceIcon } from '@/game/render3d/homeIcons';
import { adventureState } from '@/game/runtime/adventureState';
import { BuildOverlay, buildPanelOnSide, type BuildCellView, type BuildView } from '@/game/runtime/BuildOverlay';
import { CAMP_PASSAGES, CAMP_ZONE, gridCells, inCampZone, type GridCellKind, type GridWorld } from '@/game/runtime/homeGrid';
import { isTouchDevice } from '@/game/runtime/PauseMenu';
import { spriteDataUrl } from '@/game/runtime/spriteDataUrl';
import { canStep, reliefAt } from '@/game/world/relief';
import type * as Engine from '@/game/engine';
import type { GameScene } from '../GameScene';
import { BuildGridView } from './BuildGridView';
import { ITEM_VISUAL_2D } from './sceneDefs';

/** O que BuildMode usa de GameScene (e a cena do motor, de onde saem os desenhos 2D do material). */
export type BuildModeHost = Engine.Scene & Pick<GameScene,
  'actions' | 'cameraLook' | 'cameraLookBlend' | 'cinema' | 'cutsceneActive' | 'itemManager' | 'pause' | 'playerWorld'
  | 'query' | 'save' | 'scene' | 'seenItems' | 'steps' | 'valley' | 'verbs' | 'view' | 'world3d' | 'camera' | 'tileSize'
>;

/** O quadro do acampamento: a câmera recua um pouco (o dolly) e olha um nada ao sul do meio, para a tábua não cobrir. */
const BUILD_DOLLY = 1.3;
const LOOK_SOUTH = 1.4;
/** A tábua à direita (celular deitado, runtime/BuildOverlay.buildPanelOnSide): o olhar vai a leste e chega mais perto. */
const SIDE_EAST = 2.8;
const SIDE_SOUTH = 0.4;
const SIDE_DOLLY = 1.2;
const FRAME_MS = 520;
/** Peças que só enfeitam: podem ficar cercadas (as outras têm de continuar ao alcance da mão). */
const DECOR_ONLY: ReadonlySet<HomePieceKind> = new Set<HomePieceKind>(['lantern', 'flowerPot', 'cairn']);

export class BuildMode {
  public overlay?: BuildOverlay;
  /** A grade desenhada no chão do mundo (ver BuildGridView). */
  private grid?: BuildGridView;
  private opening = false;
  /** O que está na mão: uma carta escolhida (from null) ou uma peça levantada (de onde ela saiu). */
  private holding: { kind: HomePieceKind; from: { x: number; y: number } | null } | null = null;

  public constructor(private readonly host: BuildModeHost) {}

  public get isOpen(): boolean {
    return this.overlay !== undefined || this.opening;
  }

  /** O Z na bancada: enquadra o acampamento, para o jogo e abre a grade. */
  public async open(): Promise<boolean> {
    if (this.isOpen || this.host.cutsceneActive || !this.host.valley.campPieces) return false;
    this.opening = true;
    this.host.cutsceneActive = true;
    this.host.actions.useBufferMs = 0;
    this.host.steps.stopBreathing();
    this.host.actions.actionButtons?.setVisible(false);
    this.host.pause.pauseTouchButton?.setVisible(false);
    this.host.actions.controlsHint?.destroy();
    this.host.actions.controlsHint = undefined;
    if (this.host.camera) this.host.verbs.actionPrompt?.render(null, this.host.tileSize, this.host.camera, this.host.time.now, { x: this.host.playerWorld.worldX, y: this.host.playerWorld.worldY });
    getSoundManager().ui.playToolboxOpen();
    // Com a tábua embaixo, a câmera olha um nada ao sul (a tábua não cobre o acampamento); com ela à direita (o celular
    // deitado), olha a leste do meio — o acampamento vai para a parte livre da tela — e chega mais perto (tile tocável).
    const side = buildPanelOnSide();
    this.host.cameraLook = side
      ? { x: CAMP_CENTER.x + SIDE_EAST, y: CAMP_CENTER.y + SIDE_SOUTH, drift: 0 }
      : { x: CAMP_CENTER.x, y: CAMP_CENTER.y + LOOK_SOUTH, drift: 0 };
    await Promise.all([
      this.host.cinema.dollyTo(side ? SIDE_DOLLY : BUILD_DOLLY, FRAME_MS),
      new Promise<void>((resolve) => { this.host.time.delayedCall(FRAME_MS + 260, () => resolve()); }),
    ]);
    if (!this.opening) return false;
    this.opening = false;
    // O JOGO PARA DE VERDADE: a cena (o mundo, os bichos, o relógio) e a música com os sons do lugar.
    this.host.scene.pause();
    getSoundManager().setListening(true);
    this.host.view.render3D(0, 0);
    this.grid = new BuildGridView(this.host, () => this.redraw());
    this.overlay = new BuildOverlay({
      read: () => this.view(),
      tileAt: (px, py) => this.tileAt(px, py),
      paint: (cells, tile, kind) => {
        this.grid?.paint(cells, tile, kind ? pieceTexture(kind as HomePieceKind) : null);
        this.redraw();
      },
      pick: (kind) => this.pick(kind as HomePieceKind),
      lift: (x, y) => this.lift(x, y),
      place: (x, y) => this.place(x, y),
      drop: () => this.drop(),
      scrap: () => this.scrap(),
      refuse: () => getSoundManager().ui.playToolboxRefuse(),
      close: () => this.finish(),
    });
    return true;
  }

  /** Fecha pela cena (a sonda, o desmonte): o que estava na mão volta para onde estava. */
  public close(): void {
    this.overlay?.close();
  }

  /** O desmonte da cena: sem resumir nada (a cena está indo embora). */
  public destroy(): void {
    this.opening = false;
    this.overlay?.destroy();
    this.overlay = undefined;
    this.grid?.destroy();
    this.grid = undefined;
    this.holding = null;
  }

  /** O que a tela mostra agora. */
  public view(): BuildView {
    const home = adventureState().home;
    const pieces = this.host.valley.campPieces;
    const built = new Set<string>(home.built);
    const entries = homeMenu(built, (quest) => {
      const q = questFor(quest);
      return q !== undefined && isQuestDone(q);
    }, (kind) => (pieces?.count(kind) ?? 0) + (this.holding?.kind === kind && this.holding.from ? 1 : 0), home.stock);
    const touch = isTouchDevice();
    const material = (m: (typeof BENCH_MATERIALS)[number]): string => {
      const v = ITEM_VISUAL_2D[m];
      return spriteDataUrl(this.host, v.texture, v.frame, 2);
    };
    return {
      title: t('home.build.title'),
      stock: BENCH_MATERIALS.map((m) => ({ icon: material(m), label: t(`items.name.${m}`), count: home.stock[m] })),
      cards: entries.map((e) => ({
        kind: e.kind,
        icon: pieceIcon(e.kind),
        name: t(`home.piece.${e.kind}`),
        gift: Boolean(e.gift),
        state: e.state,
        next: e.next,
        needs: BENCH_MATERIALS.filter((m) => (e.cost?.[m] ?? 0) > 0)
          .map((m) => ({ icon: material(m), label: t(`items.name.${m}`), need: e.cost?.[m] ?? 0, have: home.stock[m] })),
      })),
      cells: this.cells(),
      holding: this.holding ? { kind: this.holding.kind, icon: pieceIcon(this.holding.kind) } : null,
      texts: {
        choose: t(touch ? 'home.build.chooseTouch' : 'home.build.choose'),
        place: t(touch ? 'home.build.placeTouch' : 'home.build.place'),
        move: t(touch ? 'home.build.moveTouch' : 'home.build.move'),
        empty: t(touch ? 'home.build.emptyTouch' : 'home.build.empty'),
        gift: t('home.build.gift'), scrap: t('home.build.scrap'), back: t('home.build.back'), done: t('home.build.done'),
      },
    };
  }

  /** O mundo, como a grade pergunta (runtime/homeGrid). */
  public world(): GridWorld {
    const q = this.host.query;
    const pieces = this.host.valley.campPieces;
    const kind = (x: number, y: number): GridCellKind => {
      // Fora da zona, o planalto, a ESCADA (o código de relevo cru: o degrau é chão de nível 0 para o passo) e as passagens.
      if (!inCampZone(x, y) || reliefAt(x, y) !== 0 || CAMP_PASSAGES.has(`${x},${y}`)) return 'void';
      if (this.host.valley.heroCamp?.at(x, y) || q.getToolboxAt(x, y)) return 'fixed';
      if (pieces?.at(x, y)) return 'piece';
      const grass = q.getTallGrassAt(x, y);
      if (grass?.blocking && grass.isTall) return 'grass';
      if (q.isOpenWaterAt(x, y) || q.isSolidForEntities(x, y)) return 'void';
      if (this.host.itemManager?.hasItemAt(x, y)) return 'item';
      return 'open';
    };
    const keep = [
      CAMP_BED, CAMP_NOTEBOOK, CAMP_BENCH,
      ...(pieces?.list ?? []).filter((p) => !DECOR_ONLY.has(p.kind)),
    ];
    return {
      kind,
      walkable: (x, y) => !q.isSolidForEntities(x, y),
      canStep: (x0, y0, x1, y1) => canStep(x0, y0, x1, y1),
      hero: { x: this.host.playerWorld.worldX, y: this.host.playerWorld.worldY },
      keep,
    };
  }

  private cells(): BuildCellView[] {
    return gridCells(this.world());
  }

  private tileAt(px: number, py: number): { x: number; y: number } | null {
    const projection = this.host.world3d?.projection;
    if (!projection) return null;
    const at = projection.screenToGround(px, py, 0);
    const x = Math.round(at.worldX);
    const y = Math.round(at.worldY);
    return x >= CAMP_ZONE.x0 && x <= CAMP_ZONE.x1 && y >= CAMP_ZONE.y0 && y <= CAMP_ZONE.y1 ? { x, y } : null;
  }

  private pick(kind: HomePieceKind): boolean {
    const entry = this.view().cards.find((c) => c.kind === kind);
    if (!entry || entry.state !== 'ready') return false;
    this.drop();
    this.holding = { kind, from: null };
    return true;
  }

  private lift(x: number, y: number): boolean {
    const pieces = this.host.valley.campPieces;
    const kind = pieces?.at(x, y);
    if (!pieces || !kind) return false;
    this.drop();
    pieces.remove(x, y);
    this.holding = { kind, from: { x, y } };
    getSoundManager().ui.playPut('wood');
    this.redraw();
    return true;
  }

  private place(x: number, y: number): boolean {
    const pieces = this.host.valley.campPieces;
    const holding = this.holding;
    if (!pieces || !holding) return false;
    const cell = gridCells(this.world()).find((c) => c.x === x && c.y === y);
    if (cell?.state !== 'free') return false;
    const home = adventureState().home;
    if (!holding.from) {
      const build = homeBuild(holding.kind);
      if (!canAfford(build.cost, home.stock)) return false;
      home.stock = spend(build.cost, home.stock);
      if (!home.built.includes(holding.kind)) home.built.push(holding.kind);
      // O caderno de campo anota o enfeite feito (a seção Casa).
      this.host.seenItems.add(holding.kind as never);
      adventureState().found.add(holding.kind);
    }
    pieces.add(holding.kind, x, y);
    this.holding = null;
    getSoundManager().work.playHammer();
    getSoundManager().ui.playToolboxDeliver();
    this.host.save.persistAdventure();
    this.redraw();
    return true;
  }

  /**
   * DESMONTAR a peça levantada (pedido do autor, 2026-11-17: "se eu destruir, ele volta para a lista"): ela sai do
   * acampamento, o material dela volta para a bancada (o presente não custou nada e não devolve nada), e a carta volta
   * para a tábua — construir de novo paga de novo. A escada não anda para trás: o `built` continua.
   */
  private scrap(): boolean {
    const holding = this.holding;
    if (!holding?.from) return false;
    this.holding = null;
    const home = adventureState().home;
    home.stock = refund(homeBuild(holding.kind).cost, home.stock);
    // a peça se desfaz (o golpe da madeira) e o material sobe de volta para a bancada (o "pegar")
    getSoundManager().work.playWoodChop();
    getSoundManager().ui.playPick('wood', 2);
    this.host.save.persistAdventure();
    this.redraw();
    return true;
  }

  /** A carta volta para a tábua; a peça levantada volta para onde estava. */
  private drop(): void {
    const holding = this.holding;
    this.holding = null;
    if (holding?.from) {
      this.host.valley.campPieces?.add(holding.kind, holding.from.x, holding.from.y);
      this.redraw();
    }
  }

  /** Com o jogo parado, o mundo só se redesenha à mão: um quadro com o tempo parado. */
  private redraw(): void {
    this.host.view.render3D(0, 0);
  }

  /** O jogo volta: a cena, a música, a câmera no herói. */
  private finish(): void {
    this.overlay = undefined;
    this.grid?.destroy();
    this.grid = undefined;
    this.holding = null;
    this.host.scene.resume();
    getSoundManager().setListening(false);
    this.host.cameraLook = undefined;
    void this.host.cinema.dollyTo(1, FRAME_MS);
    this.host.cutsceneActive = false;
    this.host.actions.actionButtons?.setVisible(true);
    this.host.pause.pauseTouchButton?.setVisible(true);
    this.host.save.persistAdventure();
  }
}
