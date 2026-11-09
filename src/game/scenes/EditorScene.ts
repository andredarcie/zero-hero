import * as Engine from '@/game/engine';

import { registerSceneDebugHooks } from '@/game/debug/debugHooks';
import { buildEditorProbes } from '@/game/debug/probes/editorProbe';
import { EditorDomUi, PANEL_WIDTH, type UiState, type ViewMode } from '@/game/editor/EditorDomUi';
import { EditorStore, type StoreChange } from '@/game/editor/EditorStore';
import { registerFungiTextures } from '@/game/fungi/fungi';
import { registerBucketTextures } from '@/game/render3d/bucketTexture';

import { loadWorld, type WorldFileId } from '@/game/worldApi';

import { ensureFixtureTexture, type FixtureSprite } from '@/game/editor/EditorFixtures';
import { bosqueIconKey, registerBosqueTextures } from '@/game/objects/BigTrees';
import { fenceIconKey, registerFenceTextures } from '@/game/objects/WoodFence';
import { YARD_KINDS, registerYardTextures, yardIconKey } from '@/game/objects/LumberYard';
import { FORGE_KINDS, forgeIconKey, registerForgeTextures } from '@/game/objects/OldForge';
import { CRASH_KINDS, crashIconKey, registerCrashTextures } from '@/game/objects/CrashSite';
import { EditorBoard } from './editor/EditorBoard';
import { EditorPieces } from './editor/EditorPieces';
import { EditorView } from './editor/EditorView';
import { EditorRelief } from './editor/EditorRelief';
import { EditorTools, type CellCoord } from './editor/EditorTools';
import { EditorPointer } from './editor/EditorPointer';
import { EditorCameraRig } from './editor/EditorCameraRig';
import { EditorSession } from './editor/EditorSession';

// World-editor scene: the 2D side of the game. It renders the whole authored world
// as one pannable/zoomable tilemap and translates pointer gestures into EditorStore
// operations; every panel, palette and modal lives in EditorDomUi (plain DOM).

// Bump whenever UiState changes so old brushes cannot restore retired entity configuration.
const UI_STATE_KEY = 'worldEditorUi.v9';

export class EditorScene extends Engine.Scene {
  public static readonly key = 'editor';

  public store?: EditorStore;
  public ui?: EditorDomUi;
  private unlistenStore?: () => void;

  public uiState: UiState = {
    tool: 'brush',
    layer: 'ground',
    tile: 5,
    brushSize: 1,
    collisionMode: 'keep',
    reliefMode: 'high',
    tab: 'tiles',
    entity: { list: 'npcs', type: 'blackCat' },
    showGrid: true,
    // Off by default: the authored world marks every bush as collision, and the red
    // overlay drowns the terrain at low zoom. Selecting the collision tool re-enables it.
    showCollisions: false,
    // Ligada: a serra muda onde se anda, e o mapa plano sem ela engana (foi assim que ela pareceu sumir).
    showRelief: true,
    showEntities: true,
    showFixtures: true,
    propDir: 1, // leste
    viewMode: 'world',
    chunkX: 0,
    chunkY: 0,
  };

  public collisionLayer?: Engine.Tilemaps.TilemapLayer;
  public reliefGfx?: Engine.GameObjects.Graphics;
  public gridGfx?: Engine.GameObjects.Graphics;
  public chunkMaskGfx?: Engine.GameObjects.Graphics;
  public hoverGfx?: Engine.GameObjects.Graphics;
  public rectGfx?: Engine.GameObjects.Graphics;
  public entityContainer?: Engine.GameObjects.Container;
  /** As peças do jogo (EditorFixtures): gravadas uma vez — são fixas, o editor não as move. */
  public fixtureContainer?: Engine.GameObjects.Container;
  public fixtures?: FixtureSprite[];
  private loadingText?: Engine.GameObjects.Text;

  public activeStroke: { erase: boolean; last: CellCoord } | null = null;
  public rectDrag: CellCoord | null = null;
  public panning: { lastX: number; lastY: number } | null = null;
  public appliedView: { mode: ViewMode | null; chunkX: number; chunkY: number } = { mode: null, chunkX: -1, chunkY: -1 };
  /** O tabuleiro: o tilemap e a grade. (ver EditorBoard) */
  public readonly board: EditorBoard = new EditorBoard(this);
  /** As peças desenhadas. (ver EditorPieces) */
  public readonly pieces: EditorPieces = new EditorPieces(this);
  /** O modo mundo/chunk e as camadas visíveis. (ver EditorView) */
  public readonly view: EditorView = new EditorView(this);
  /** A serra: planalto e escadas. (ver EditorRelief) */
  public readonly relief: EditorRelief = new EditorRelief(this);
  /** O pincel, a borracha, o balde, o retângulo e o conta-gotas. (ver EditorTools) */
  public readonly tools: EditorTools = new EditorTools(this);
  /** O mouse no tabuleiro. (ver EditorPointer) */
  public readonly pointer: EditorPointer = new EditorPointer(this);
  /** A câmera do editor. (ver EditorCameraRig) */
  public readonly cam: EditorCameraRig = new EditorCameraRig(this);
  /** Salvar, recarregar e testar. (ver EditorSession) */
  public readonly session: EditorSession = new EditorSession(this);

  public constructor() {
    super(EditorScene.key);
  }

  public create(): void {
    // The bucket's pixel art is generated at boot (into the 2D texture manager here so the
    // palette can show it, and the 3D registry for the live playtest).
    registerBucketTextures(this);
    registerFungiTextures(this);
    // As árvores do bosque são props: a paleta e os chips mostram o desenho delas, então ele entra no motor 2D já.
    registerBosqueTextures();
    for (const kind of ['oak', 'birch', 'sapling', 'log'] as const) ensureFixtureTexture(this, bosqueIconKey(kind));
    registerFenceTextures();
    ensureFixtureTexture(this, fenceIconKey);
    registerYardTextures();
    for (const kind of YARD_KINDS) ensureFixtureTexture(this, yardIconKey(kind));
    ensureFixtureTexture(this, 'yard-chips-0');
    ensureFixtureTexture(this, 'yard-chips-1');
    ensureFixtureTexture(this, 'yard-woodpile-1');
    registerForgeTextures();
    for (const kind of FORGE_KINDS) ensureFixtureTexture(this, forgeIconKey(kind));
    ensureFixtureTexture(this, 'forge-floor');
    registerCrashTextures();
    for (const kind of CRASH_KINDS) ensureFixtureTexture(this, crashIconKey(kind));
    // The engine never auto-calls shutdown(); wire it so the DOM shell and listeners are torn
    // down when the scene stops (see also GameScene, which does the same).
    this.events.once(Engine.Scenes.Events.SHUTDOWN, this.shutdown, this);
    this.events.on(Engine.Scenes.Events.WAKE, this.session.handleWake, this.session);
    this.events.on(Engine.Scenes.Events.SLEEP, this.session.handleSleep, this.session);

    this.cameras.main.setBackgroundColor('#0a1013');
    this.input.mouse?.disableContextMenu();
    this.scale.on(Engine.Scale.Events.RESIZE, this.cam.handleResize, this.cam);
    this.cam.handleResize({ width: this.scale.width, height: this.scale.height });

    this.pointer.registerPointerInput();
    registerSceneDebugHooks(this, () => this.session.renderSnapshot());
    // A porta dos playtests no editor (debug/probes/editorProbe), só no desenvolvimento.
    if (import.meta.env.DEV) window.editorDebug = buildEditorProbes(this);

    void this.bootstrap();
  }

  public shutdown(): void {
    this.scale.off(Engine.Scale.Events.RESIZE, this.cam.handleResize, this.cam);
    this.events.off(Engine.Scenes.Events.WAKE, this.session.handleWake, this.session);
    this.events.off(Engine.Scenes.Events.SLEEP, this.session.handleSleep, this.session);
    this.unlistenStore?.();
    this.unlistenStore = undefined;
    this.ui?.destroy();
    this.ui = undefined;
  }

  public update(): void {
    this.cam.syncCameraDerivedUi();
  }

  // ── Boot ────────────────────────────────────────────────────────────────

  // O QUE ESTA CENA ABRE: o mundo de verdade (`world.json`). É um arquivo só — o subterrâneo e os
  // levels isolados foram removidos do jogo, e as rotas deles junto.
  public get worldFileId(): WorldFileId {
    return 'world';
  }

  // Editor and each lab level persist UI/camera separately: their worlds have different sizes,
  // so a camera restored from another would strand the view off-map.
  public get uiStateKey(): string {
    return this.worldFileId === 'world' ? UI_STATE_KEY : `${UI_STATE_KEY}.${this.worldFileId}`;
  }

  private async bootstrap(): Promise<void> {
    this.session.restoreUi();
    this.loadingText?.destroy();
    this.loadingText = this.add.text(PANEL_WIDTH + 24, 24, 'Carregando mundo...', {
      color: '#f4a261', fontFamily: "'Press Start 2P', monospace", fontSize: '12px',
    }).setScrollFactor(0);

    let store: EditorStore;
    try {
      store = new EditorStore(await loadWorld(this.worldFileId));
    } catch (error) {
      this.loadingText.setText(
        `Falha ao carregar ${this.worldFileId}.json\n${error instanceof Error ? error.message : String(error)}\n\nClique para tentar de novo`,
      );
      this.input.once(Engine.Input.Events.POINTER_DOWN, () => void this.bootstrap());
      return;
    }

    this.loadingText.destroy();
    this.loadingText = undefined;
    this.store = store;
    this.unlistenStore = store.listen((change) => this.handleStoreChange(change));

    this.ui = new EditorDomUi(this, store, this.uiState, {
      onStateChange: () => this.handleUiStateChange(),
      onSave: () => void this.session.handleSave(),
      onReload: () => this.session.handleReload(),
      onPlaytest: () => this.session.startPlaytest(),
      onUndo: () => { this.store?.history.undo(); },
      onRedo: () => { this.store?.history.redo(); },
      onFitView: () => this.cam.fitView(),
      onNavigate: (tileX, tileY) => this.cam.navigateTo(tileX, tileY),
      onWorldApply: (settings) => this.session.applyWorldSettings(settings),
      onDialogApply: (kind, dialog) => { this.store?.meta.setDialog(kind, dialog); },
      worldFile: this.worldFileId,
    });
    this.ui.setLoading(false);

    this.board.buildWorldObjects();
    if (!this.cam.restoreCamera()) this.cam.fitView();
    this.view.syncViewMode();
    this.ui.refreshHeader();
    this.ui.minimap.requestMinimapRedraw();
  }

  // ── World rendering ─────────────────────────────────────────────────────

  // ── View mode (mundo x chunk) ───────────────────────────────────────────

  // ── Store events ────────────────────────────────────────────────────────

  private handleStoreChange(change: StoreChange): void {
    if (change.structure) {
      this.board.buildWorldObjects();
      this.appliedView = { mode: null, chunkX: -1, chunkY: -1 };
      this.view.syncViewMode();
      if (this.uiState.viewMode === 'world') this.cam.fitView();
    } else if (change.cells) {
      const seen = new Set<string>();
      change.cells.forEach((cell) => {
        const key = `${cell.wx},${cell.wy}`;
        if (seen.has(key)) return;
        seen.add(key);
        this.board.refreshCell(cell.wx, cell.wy);
      });
      this.relief.drawRelief();
    }
    if (!change.structure && (change.entities || change.spawn)) {
      this.pieces.renderEntities();
      // Um prop do bosque posto ou apagado muda as peças do jogo: grava de novo (o mapa mudou).
      if (change.entities) {
        this.fixtures = undefined;
        this.pieces.renderFixtures();
      }
    }
    if (change.cells || change.entities || change.spawn || change.structure) this.ui?.minimap.requestMinimapRedraw();
    this.ui?.refreshHeader();
    this.pointer.refreshHoverStatus();
  }

  private handleUiStateChange(): void {
    if (this.uiState.tool === 'collision' && !this.uiState.showCollisions) {
      this.uiState.showCollisions = true;
      this.ui?.syncFromState();
    }
    if (this.uiState.tool === 'relief' && !this.uiState.showRelief) {
      this.uiState.showRelief = true;
      this.ui?.syncFromState();
    }
    this.view.syncViewMode();
    this.view.applyViewToggles();
    this.pointer.drawHover();
    this.session.persistUi();
  }

  // ── Pointer input ───────────────────────────────────────────────────────

  // ── Tool application ────────────────────────────────────────────────────

  // ── Serra ───────────────────────────────────────────────────────────────

  // ── Overlays / status ───────────────────────────────────────────────────

  // ── Camera helpers ──────────────────────────────────────────────────────

  // ── Actions ─────────────────────────────────────────────────────────────

  // ── Persistence (survives the post-save Vite reload) ────────────────────

}
