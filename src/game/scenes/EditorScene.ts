import Phaser from 'phaser';

import {
  ASSET_KEYS, CHUNK_COLUMNS, CHUNK_ROWS, CLIFF_WALL_FRAMES, HERO_FRAMES, KEY_FRAMES,
  MOONFLOWER_FRAMES, NPC_VISUALS, SLIME_FRAMES, SOLID_GROUND_FRAMES, SOLID_UPPER_FRAMES,
  TOOLBOX_FRAMES, ZORA_FRAMES,
} from '@/game/constants';
import { registerSceneDebugHooks } from '@/game/debug/debugHooks';
import {
  EditorDomUi, PANEL_WIDTH, hasDirectionFrames, isDirectionalProp, type UiState, type ViewMode,
} from '@/game/editor/EditorDomUi';
import { EditorStore, type PlacedEntity, type StoreChange } from '@/game/editor/EditorStore';
import { registerBucketTextures } from '@/game/render3d/bucketTexture';
import { registerLevelPortalTextures } from '@/game/render3d/levelPortalTexture';
import { GameScene } from '@/game/scenes/GameScene';
import { setActiveLevel } from '@/game/runtime/activeLevel';
import { setUnderground } from '@/game/runtime/underworld';
import type { EnemyKind, PickupKind } from '@/game/world/ScreenContent';
import type { PropDir, PropKind } from '@/game/world/worldSchema';
import { setWorldData } from '@/game/world/WorldData';
import {
  createLabLevel, deleteLabLevel, listLabLevels, loadWorld, renameLabLevel, saveWorld, worldFilePath,
  type WorldFileId, type WorldFloor,
} from '@/game/worldApi';

// World-editor scene: the Phaser side of the engine. It renders the whole authored world
// as one pannable/zoomable tilemap and translates pointer gestures into EditorStore
// operations; every panel, palette and modal lives in EditorDomUi (plain DOM).

const WORLD_TILE = 16; // px per tile in editor world-space (native tileset frame size)
const COLLISION_GID = 1000; // synthetic tile id for the painted-collision overlay tileset
const COLLISION_TEXTURE = 'editor-collision-tile';
// Trees are solid at runtime even without painted collision (ChunkManager.isCellBlocked +
// SOLID_UPPER_FRAMES). The editor shows that implicit collision in a distinct amber so
// authors can see trees block "by default" — and know it isn't erasable painted data.
const TREE_COLLISION_GID = 1001;
const TREE_COLLISION_TEXTURE = 'editor-tree-collision-tile';
const CAMERA_PAD = WORLD_TILE * 10;
const MIN_ZOOM = 0.3;
const MAX_ZOOM = 8;
// Bump whenever UiState changes so old brushes cannot restore retired entity configuration.
const UI_STATE_KEY = 'worldEditorUi.v8';

type CellCoord = { x: number; y: number };

// O que o chip de um PONTO DE SPAWN mostra: o proprio inimigo que vai nascer dali. E a arte do
// bicho e nao uma marca de cova porque o jogo nao desenha nada naquele tile (o nascimento e a
// arte) — o tabuleiro e o unico lugar onde a cova e visivel, e ali ela tem de dizer O QUE nasce.
const ENEMY_VISUAL: Record<EnemyKind, { key: string; frame?: number }> = {
  undead: { key: ASSET_KEYS.undead },
  bat: { key: ASSET_KEYS.bat },
  spider: { key: ASSET_KEYS.spider },
  slime: { key: ASSET_KEYS.slime, frame: SLIME_FRAMES.rest },
  bigslime: { key: ASSET_KEYS.bigSlime, frame: SLIME_FRAMES.rest },
  turret: { key: ASSET_KEYS.turret },
  // O mago inimigo e o NPC mago dividem a arte, e no tabuleiro isso NAO se resolve com tint (o
  // chip e desenhado por um Image de paleta, sem o material tingido do jogo). O que separa os dois
  // ali e a cor do ponto de lista — vermelho de inimigo contra o dos NPCs — e o proprio tooltip.
  mage: { key: ASSET_KEYS.mageCast },
  // O chip mostra ele ERGUIDO e nao submerso: o frame submerso nao tem corpo nenhum (so a esteira
  // na agua), e um chip de tabuleiro que nao mostra o bicho nao diz o que nasce ali.
  zora: { key: ASSET_KEYS.zora, frame: ZORA_FRAMES.up },
};

const PICKUP_VISUAL: Record<PickupKind, { key: string; frame?: number }> = {
  heart: { key: ASSET_KEYS.hearts, frame: 0 },
  sword: { key: ASSET_KEYS.swordItem, frame: 0 },
  key: { key: ASSET_KEYS.keyItem, frame: KEY_FRAMES.pickup },
  axe: { key: ASSET_KEYS.axeIcon },
  greatAxe: { key: ASSET_KEYS.greatAxeIcon },
  bomb: { key: ASSET_KEYS.bombItem, frame: 0 },
  pickaxe: { key: ASSET_KEYS.pickaxeIcon },
  scythe: { key: ASSET_KEYS.scytheIcon },
  shovel: { key: ASSET_KEYS.shovelIcon },
  wood: { key: ASSET_KEYS.woodIcon },
  stone: { key: ASSET_KEYS.rock },
  iron: { key: ASSET_KEYS.ironItem },
  seeds: { key: ASSET_KEYS.seedsItem },
  carnivoreSeeds: { key: ASSET_KEYS.carnivoreSeedsItem },
  bucket: { key: 'bucket-icon' }, // generated at boot (registerBucketTextures, called in create)
  // A CADEIA DO FERRO como item de chao. Faltavam as tres, e a falta NAO era inofensiva: um
  // level que autora minerio no chao (as aulas do gato) derrubava o editor inteiro no boot —
  // `entityVisual` lia `.key` de undefined, `renderEntities` morria, e a paleta nunca chegava
  // a ser construida. O sintoma era 'clico no mapa e nada acontece'.
  ore: { key: ASSET_KEYS.oreItem },
  bloom: { key: ASSET_KEYS.bloomItem },
  charcoal: { key: 'charcoal-item' },
};

const PROP_VISUAL: Record<PropKind, { key: string; frame?: number }> = {
  campfire: { key: ASSET_KEYS.campfireFrame1 },
  // A escada e geometria no jogo (StairsObject), entao ela nao tem sprite proprio — e o que ela
  // pega emprestado tem de dizer PEDRA. Ela vestia o icone do portal, a peca que ela substituiu,
  // e o resultado era um portal roxo marcando o lugar onde vai nascer um lance de alvenaria: a
  // mesma confusao que o gerador ja cometeu uma vez, quando trocou os tipos e deixou os portais
  // velhos no disco tapando os tiles. A rocha do atlas (a mesma da montanha) nao mente.
  stairs: { key: ASSET_KEYS.forestTileset, frame: CLIFF_WALL_FRAMES[0] },
  dryBush: { key: ASSET_KEYS.dryBush },
  lockedDoor: { key: ASSET_KEYS.lookedDoorObject },
  swingGate: { key: ASSET_KEYS.swingGateObject },
  dryTree: { key: ASSET_KEYS.dryTree, frame: 0 },
  dryShrub: { key: ASSET_KEYS.dryShrub },
  rock: { key: ASSET_KEYS.rock },
  ironRock: { key: ASSET_KEYS.ironRock, frame: 0 },
  tallGrass: { key: ASSET_KEYS.tallGrassUp, frame: 0 },
  lava: { key: ASSET_KEYS.lavaFloor },
  water: { key: ASSET_KEYS.water },
  bridgeSpot: { key: ASSET_KEYS.bridge },
  pyre: { key: ASSET_KEYS.woodItem },
  // A pose ABERTA: e a que diz o que a peca faz (uma ponte de petalas). Ver MOONFLOWER_FRAMES.
  moonflower: { key: ASSET_KEYS.moonflower, frame: MOONFLOWER_FRAMES.lying[3] },
  bombSpot: { key: ASSET_KEYS.bombItem, frame: 0 },
  plantSpot: { key: ASSET_KEYS.plantHole, frame: 0 },
  carnivorousPlant: { key: ASSET_KEYS.carnivorousPlant, frame: 0 },
  toolbox: { key: ASSET_KEYS.toolbox, frame: TOOLBOX_FRAMES.closed },
  furnace: { key: ASSET_KEYS.furnace, frame: 0 },
  altar: { key: ASSET_KEYS.altar, frame: 0 },
  levelPortal: { key: ASSET_KEYS.levelPortal },
};

const CHIP_COLOR: Record<PlacedEntity['list'], number> = {
  enemies: 0xff5566,
  npcs: 0x4488ff,
  pickups: 0x33cc77,
  props: 0xffaa33,
};

// N, L, S, O — a mesma tabela do mundo (worldY cresce pra baixo), usada so pela marca de proa.
const DIR_STEP: ReadonlyArray<readonly [number, number]> = [[0, -1], [1, 0], [0, 1], [-1, 0]];

const SPAWN_COLOR = 0x00e0ff;

type PersistedUi = { state: UiState; cam?: { centerX: number; centerY: number; zoom: number } };

export class EditorScene extends Phaser.Scene {
  public static readonly key = 'editor';

  private store?: EditorStore;
  private ui?: EditorDomUi;
  private unlistenStore?: () => void;

  private uiState: UiState = {
    tool: 'brush',
    layer: 'ground',
    tile: 5,
    brushSize: 1,
    collisionMode: 'keep',
    tab: 'tiles',
    entity: { list: 'npcs', type: 'blackCat' },
    showGrid: true,
    // Off by default: the authored world marks every bush as collision, and the red
    // overlay drowns the terrain at low zoom. Selecting the collision tool re-enables it.
    showCollisions: false,
    showEntities: true,
    propDir: 1, // leste
    viewMode: 'world',
    chunkX: 0,
    chunkY: 0,
  };

  private map?: Phaser.Tilemaps.Tilemap;
  private groundLayer?: Phaser.Tilemaps.TilemapLayer;
  private upperLayer?: Phaser.Tilemaps.TilemapLayer;
  private collisionLayer?: Phaser.Tilemaps.TilemapLayer;
  private gridGfx?: Phaser.GameObjects.Graphics;
  private chunkMaskGfx?: Phaser.GameObjects.Graphics;
  private hoverGfx?: Phaser.GameObjects.Graphics;
  private rectGfx?: Phaser.GameObjects.Graphics;
  private entityContainer?: Phaser.GameObjects.Container;
  private loadingText?: Phaser.GameObjects.Text;

  private hovered: CellCoord | null = null;
  private activeStroke: { erase: boolean; last: CellCoord } | null = null;
  private rectDrag: CellCoord | null = null;
  private panning: { lastX: number; lastY: number } | null = null;
  private lastCamSync = { scrollX: NaN, scrollY: NaN, zoom: NaN };
  private reloadArmedUntil = 0;
  private appliedView: { mode: ViewMode | null; chunkX: number; chunkY: number } = { mode: null, chunkX: -1, chunkY: -1 };

  public constructor() {
    super(EditorScene.key);
  }

  public create(): void {
    // The bucket's pixel art is generated at boot (into the Phaser texture manager here so the
    // palette can show it, and the 3D registry for the live playtest).
    registerBucketTextures(this);
    registerLevelPortalTextures(this);
    // Phaser never auto-calls shutdown(); wire it so the DOM shell and listeners are torn
    // down when the scene stops (see also GameScene, which does the same).
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.shutdown, this);
    this.events.on(Phaser.Scenes.Events.WAKE, this.handleWake, this);
    this.events.on(Phaser.Scenes.Events.SLEEP, this.handleSleep, this);

    this.cameras.main.setBackgroundColor('#0a1013');
    this.input.mouse?.disableContextMenu();
    this.scale.on(Phaser.Scale.Events.RESIZE, this.handleResize, this);
    this.handleResize({ width: this.scale.width, height: this.scale.height });

    this.registerPointerInput();
    registerSceneDebugHooks(this, () => this.renderSnapshot());

    void this.bootstrap();
  }

  public shutdown(): void {
    this.scale.off(Phaser.Scale.Events.RESIZE, this.handleResize, this);
    this.events.off(Phaser.Scenes.Events.WAKE, this.handleWake, this);
    this.events.off(Phaser.Scenes.Events.SLEEP, this.handleSleep, this);
    this.unlistenStore?.();
    this.unlistenStore = undefined;
    this.ui?.destroy();
    this.ui = undefined;
  }

  public update(): void {
    this.syncCameraDerivedUi();
  }

  // ── Boot ────────────────────────────────────────────────────────────────

  // O QUE ESTA CENA ABRE, e quem escolhe: a URL, sempre.
  //
  // `/editor` edita o MUNDO DE VERDADE, e ele tem DOIS ANDARES: a superfície (`world.json`) e o
  // espelho de baixo (`underworld.json`). `?under` escolhe, e os dois botões do painel são só uma
  // porta para esse parâmetro (`openFloor`) — a URL continua sendo a única fonte da verdade, então
  // recarregar, favoritar ou colar o endereço devolve exatamente o andar em que se estava.
  //
  // `/lab` roda a MESMA cena sobre um LEVEL de puzzle (`public/levels/level-N.json`, padrão o 2) —
  // e sobre o subterrâneo também, porque `?under` vale nas duas rotas. Ver main.ts / worldApi.ts.
  //
  // A grade do editor sempre foi guiada pelos `meta` do arquivo, então o espelho (25 telas, como o
  // overworld) entra sem mudança nenhuma de desenho.
  private get worldFileId(): WorldFileId {
    if (this.isUnderworld) return 'underworld';
    if (this.registry.get('appMode') !== 'lab') return 'world';
    return `level-${this.labLevelNumber}`;
  }

  private get isUnderworld(): boolean {
    return new URLSearchParams(window.location.search).has('under');
  }

  /** O andar aberto — o que os dois botões do painel acendem. */
  private get worldFloor(): WorldFloor {
    return this.isUnderworld ? 'underworld' : 'overworld';
  }


  private get labLevelNumber(): number {
    const raw = new URLSearchParams(window.location.search).get('level');
    return raw && /^\d+$/u.test(raw) && Number(raw) > 0 ? Number(raw) : 2;
  }

  /** O número dentro do worldFileId corrente (level OU dungeon) — o que o activeLevel recebe. */
  private get labFileNumber(): number {
    const match = /-(\d+)$/u.exec(this.worldFileId);
    return match ? Number(match[1]) : 1;
  }

  // Editor and each lab level persist UI/camera separately: their worlds have different sizes,
  // so a camera restored from another would strand the view off-map.
  private get uiStateKey(): string {
    return this.worldFileId === 'world' ? UI_STATE_KEY : `${UI_STATE_KEY}.${this.worldFileId}`;
  }

  private async bootstrap(): Promise<void> {
    this.restoreUi();
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
      this.input.once(Phaser.Input.Events.POINTER_DOWN, () => void this.bootstrap());
      return;
    }

    this.loadingText.destroy();
    this.loadingText = undefined;
    this.store = store;
    this.unlistenStore = store.listen((change) => this.handleStoreChange(change));

    this.ui = new EditorDomUi(this, store, this.uiState, {
      onStateChange: () => this.handleUiStateChange(),
      onSave: () => void this.handleSave(),
      onReload: () => this.handleReload(),
      onPlaytest: () => this.startPlaytest(),
      onUndo: () => { this.store?.undo(); },
      onRedo: () => { this.store?.redo(); },
      onFitView: () => this.fitView(),
      onNavigate: (tileX, tileY) => this.navigateTo(tileX, tileY),
      onWorldApply: (settings) => this.applyWorldSettings(settings),
      onDialogApply: (kind, dialog) => { this.store?.setDialog(kind, dialog); },
      worldFile: this.worldFileId,
      // Os dois andares só existem no /editor: no /lab o arquivo aberto é um LEVEL, que não é
      // andar de nada — oferecer a troca lá seria uma porta que muda o assunto da tela.
      ...(this.registry.get('appMode') === 'editor' ? {
        floorSwitch: {
          current: this.worldFloor,
          open: (floor: WorldFloor) => this.openFloor(floor),
        },
      } : {}),
      ...(this.registry.get('appMode') === 'lab' ? {
        levelManager: {
          currentId: this.worldFileId,
          list: listLabLevels,
          create: createLabLevel,
          rename: renameLabLevel,
          remove: deleteLabLevel,
          open: (id: string) => this.openLabFile(id),
        },
      } : {}),
    });
    this.ui.setLoading(false);

    this.buildWorldObjects();
    if (!this.restoreCamera()) this.fitView();
    this.syncViewMode();
    this.ui.refreshHeader();
    this.ui.requestMinimapRedraw();
  }

  // ── World rendering ─────────────────────────────────────────────────────

  private ensureCollisionTexture(): void {
    if (!this.textures.exists(COLLISION_TEXTURE)) {
      const gfx = this.add.graphics();
      gfx.fillStyle(0xff4455, 0.32).fillRect(0, 0, WORLD_TILE, WORLD_TILE);
      gfx.lineStyle(1, 0xff4455, 0.9).strokeRect(0.5, 0.5, WORLD_TILE - 1, WORLD_TILE - 1);
      gfx.generateTexture(COLLISION_TEXTURE, WORLD_TILE, WORLD_TILE);
      gfx.destroy();
    }
    if (!this.textures.exists(TREE_COLLISION_TEXTURE)) {
      // Amber, lighter than the painted-collision red, so trees read as implicitly solid.
      const gfx = this.add.graphics();
      gfx.fillStyle(0xf4a261, 0.22).fillRect(0, 0, WORLD_TILE, WORLD_TILE);
      gfx.lineStyle(1, 0xf4a261, 0.8).strokeRect(0.5, 0.5, WORLD_TILE - 1, WORLD_TILE - 1);
      gfx.generateTexture(TREE_COLLISION_TEXTURE, WORLD_TILE, WORLD_TILE);
      gfx.destroy();
    }
  }

  // Which collision overlay a cell should show: painted collision wins (red); otherwise a
  // tree upper-tile is implicitly solid (amber); otherwise nothing. Mirrors the runtime rule
  // in ChunkManager.isCellBlocked so the editor's collision view matches what actually blocks.
  private collisionOverlayGid(wx: number, wy: number): number | null {
    const store = this.store;
    if (!store) return null;
    if (store.readCell('collision', wx, wy) === true) return COLLISION_GID;
    const upper = store.readCell('upper', wx, wy) as number | null;
    if (upper !== null && SOLID_UPPER_FRAMES.has(upper)) return TREE_COLLISION_GID;
    // The sea blocks from the GROUND layer (SOLID_GROUND_FRAMES) — same implicit rule, so it
    // gets the same amber. Without this the editor would draw a paintable ocean as walkable.
    const ground = store.readCell('ground', wx, wy) as number | null;
    if (ground !== null && SOLID_GROUND_FRAMES.has(ground)) return TREE_COLLISION_GID;
    return null;
  }

  private buildWorldObjects(): void {
    const store = this.store;
    if (!store) return;

    this.map?.destroy();
    this.gridGfx?.destroy();
    this.chunkMaskGfx?.destroy();
    this.hoverGfx?.destroy();
    this.rectGfx?.destroy();
    this.entityContainer?.destroy();
    this.ensureCollisionTexture();

    const tilesX = store.tilesX;
    const tilesY = store.tilesY;

    this.map = this.make.tilemap({ tileWidth: WORLD_TILE, tileHeight: WORLD_TILE, width: tilesX, height: tilesY });
    const tiles = this.map.addTilesetImage('tiles', ASSET_KEYS.forestTileset, WORLD_TILE, WORLD_TILE, 0, 0, 0)!;
    const collisionTiles = this.map.addTilesetImage('collision', COLLISION_TEXTURE, WORLD_TILE, WORLD_TILE, 0, 0, COLLISION_GID)!;
    const treeCollisionTiles = this.map.addTilesetImage('treeCollision', TREE_COLLISION_TEXTURE, WORLD_TILE, WORLD_TILE, 0, 0, TREE_COLLISION_GID)!;

    this.groundLayer = this.map.createBlankLayer('ground', tiles, 0, 0)!.setDepth(0);
    this.upperLayer = this.map.createBlankLayer('upper', tiles, 0, 0)!.setDepth(1);
    this.collisionLayer = this.map.createBlankLayer('collision', [collisionTiles, treeCollisionTiles], 0, 0)!.setDepth(2);

    for (let wy = 0; wy < tilesY; wy += 1) {
      for (let wx = 0; wx < tilesX; wx += 1) {
        this.groundLayer.putTileAt(store.readCell('ground', wx, wy) as number, wx, wy, false);
        const upper = store.readCell('upper', wx, wy) as number | null;
        if (upper !== null) this.upperLayer.putTileAt(upper, wx, wy, false);
        const collisionGid = this.collisionOverlayGid(wx, wy);
        if (collisionGid !== null) this.collisionLayer.putTileAt(collisionGid, wx, wy, false);
      }
    }

    this.gridGfx = this.add.graphics().setDepth(3);
    this.drawGrid();
    this.entityContainer = this.add.container(0, 0).setDepth(4);
    this.renderEntities();
    this.chunkMaskGfx = this.add.graphics().setDepth(5);
    this.hoverGfx = this.add.graphics().setDepth(6);
    this.rectGfx = this.add.graphics().setDepth(7);

    const worldW = tilesX * WORLD_TILE;
    const worldH = tilesY * WORLD_TILE;
    this.cameras.main.setBounds(-CAMERA_PAD, -CAMERA_PAD, worldW + CAMERA_PAD * 2, worldH + CAMERA_PAD * 2);
    this.applyViewToggles();
  }

  private drawGrid(): void {
    const store = this.store;
    const gfx = this.gridGfx;
    if (!store || !gfx) return;
    const worldW = store.tilesX * WORLD_TILE;
    const worldH = store.tilesY * WORLD_TILE;

    gfx.clear();
    gfx.lineStyle(1, 0xffffff, 0.07);
    for (let x = 0; x <= store.tilesX; x += 1) gfx.lineBetween(x * WORLD_TILE, 0, x * WORLD_TILE, worldH);
    for (let y = 0; y <= store.tilesY; y += 1) gfx.lineBetween(0, y * WORLD_TILE, worldW, y * WORLD_TILE);

    // Chunk seams stand out so authors can see the streaming/screen boundaries.
    gfx.lineStyle(1, 0xf4a261, 0.28);
    for (let cx = 0; cx <= store.world.meta.worldChunksX; cx += 1) {
      gfx.lineBetween(cx * CHUNK_COLUMNS * WORLD_TILE, 0, cx * CHUNK_COLUMNS * WORLD_TILE, worldH);
    }
    for (let cy = 0; cy <= store.world.meta.worldChunksY; cy += 1) {
      gfx.lineBetween(0, cy * CHUNK_ROWS * WORLD_TILE, worldW, cy * CHUNK_ROWS * WORLD_TILE);
    }
  }

  private refreshCell(wx: number, wy: number): void {
    const store = this.store;
    if (!store || !this.groundLayer || !this.upperLayer || !this.collisionLayer) return;
    if (!store.isInside(wx, wy)) return;

    this.groundLayer.putTileAt(store.readCell('ground', wx, wy) as number, wx, wy, false);
    const upper = store.readCell('upper', wx, wy) as number | null;
    if (upper === null) this.upperLayer.removeTileAt(wx, wy, true, false);
    else this.upperLayer.putTileAt(upper, wx, wy, false);
    const collisionGid = this.collisionOverlayGid(wx, wy);
    if (collisionGid !== null) this.collisionLayer.putTileAt(collisionGid, wx, wy, false);
    else this.collisionLayer.removeTileAt(wx, wy, true, false);
  }

  private entityVisual(entity: PlacedEntity): { key: string; frame?: number } {
    if (entity.list === 'enemies') return ENEMY_VISUAL[entity.type] ?? { key: ASSET_KEYS.undead };
    if (entity.list === 'npcs') return NPC_VISUALS[entity.type];
    // O `??` e uma REDE, nao preguica: um kind de item que o editor nao conhece nao pode
    // derrubar o tabuleiro inteiro. Sem ele, um unico item desconhecido num canto do mundo
    // apagava a paleta e o editor virava uma tela que nao responde a clique nenhum.
    if (entity.list === 'pickups') return PICKUP_VISUAL[entity.type] ?? { key: ASSET_KEYS.rock };
    // Um prop com direcao desenha o frame da SUA direcao — e assim que se olha um mapa cheio de
    // bracos e se ve, sem clicar em nada, pra que lado cada um empurra. So vale para quem tem a
    // arte dividida por direcao: a caixa de ferramentas gira, mas seus frames sao poses da tampa
    // (ela recebe a marca de proa em renderEntities).
    if (entity.dir !== undefined && hasDirectionFrames(entity.type)) {
      return { key: PROP_VISUAL[entity.type].key, frame: entity.dir };
    }
    return PROP_VISUAL[entity.type];
  }

  private renderEntities(): void {
    const store = this.store;
    const container = this.entityContainer;
    if (!store || !container) return;
    container.removeAll(true);

    const place = (
      worldX: number,
      worldY: number,
      color: number,
      visual: { key: string; frame?: number },
      dir?: PropDir,
    ): void => {
      const cx = (worldX + 0.5) * WORLD_TILE;
      const cy = (worldY + 0.5) * WORLD_TILE;
      const chip = this.add.rectangle(cx, cy, WORLD_TILE * 0.86, WORLD_TILE * 0.86, color, 0.32).setStrokeStyle(1, color, 1);
      const sprite = this.add.sprite(cx, cy, visual.key, visual.frame ?? 0).setDisplaySize(WORLD_TILE * 0.74, WORLD_TILE * 0.74);
      container.add([chip, sprite]);
      // A marca de PROA: um pino colado na borda do chip do lado pra onde a peca aponta. Existe
      // so pra quem gira sem ter arte por direcao — sem ela, o autor nao ve a frente da peca.
      if (dir === undefined) return;
      const [dx, dy] = DIR_STEP[dir];
      container.add(this.add.rectangle(
        cx + dx * WORLD_TILE * 0.4,
        cy + dy * WORLD_TILE * 0.4,
        WORLD_TILE * (dx === 0 ? 0.44 : 0.16),
        WORLD_TILE * (dy === 0 ? 0.44 : 0.16),
        color,
        1,
      ));
    };

    store.allEntities().forEach((entity) => place(
      entity.worldX,
      entity.worldY,
      CHIP_COLOR[entity.list],
      this.entityVisual(entity),
      entity.list === 'props' && isDirectionalProp(entity.type) && !hasDirectionFrames(entity.type)
        ? entity.dir ?? 1
        : undefined,
    ));
    const spawn = store.spawn;
    place(spawn.worldX, spawn.worldY, SPAWN_COLOR, { key: ASSET_KEYS.hero, frame: HERO_FRAMES.idleDown });
    const startLabel = this.add.text(
      (spawn.worldX + 0.5) * WORLD_TILE,
      spawn.worldY * WORLD_TILE - 1,
      'INICIO',
      {
        fontFamily: '"Press Start 2P", monospace',
        fontSize: '4px',
        color: '#66d9ef',
        stroke: '#061014',
        strokeThickness: 2,
      },
    ).setOrigin(0.5, 1);
    container.add(startLabel);
  }

  private applyViewToggles(): void {
    this.gridGfx?.setVisible(this.uiState.showGrid);
    this.collisionLayer?.setVisible(this.uiState.showCollisions);
    this.entityContainer?.setVisible(this.uiState.showEntities);
  }

  // ── View mode (mundo x chunk) ───────────────────────────────────────────

  private chunkRect(): { x: number; y: number; w: number; h: number } {
    return {
      x: this.uiState.chunkX * CHUNK_COLUMNS * WORLD_TILE,
      y: this.uiState.chunkY * CHUNK_ROWS * WORLD_TILE,
      w: CHUNK_COLUMNS * WORLD_TILE,
      h: CHUNK_ROWS * WORLD_TILE,
    };
  }

  /** Editable area in tile coords, or null when the whole world is editable (world view). */
  private editableBounds(): { x0: number; y0: number; x1: number; y1: number } | null {
    if (this.uiState.viewMode !== 'chunk') return null;
    return {
      x0: this.uiState.chunkX * CHUNK_COLUMNS,
      y0: this.uiState.chunkY * CHUNK_ROWS,
      x1: (this.uiState.chunkX + 1) * CHUNK_COLUMNS - 1,
      y1: (this.uiState.chunkY + 1) * CHUNK_ROWS - 1,
    };
  }

  private isEditable(x: number, y: number): boolean {
    const bounds = this.editableBounds();
    return !bounds || (x >= bounds.x0 && x <= bounds.x1 && y >= bounds.y0 && y <= bounds.y1);
  }

  private clampChunkSelection(): void {
    const meta = this.store?.world.meta;
    if (!meta) return;
    this.uiState.chunkX = Math.max(0, Math.min(meta.worldChunksX - 1, this.uiState.chunkX));
    this.uiState.chunkY = Math.max(0, Math.min(meta.worldChunksY - 1, this.uiState.chunkY));
  }

  /** Applies viewMode/chunk selection when they changed since the last application. */
  private syncViewMode(): void {
    const state = this.uiState;
    // Entering chunk view from world view focuses the chunk under the camera centre.
    if (state.viewMode === 'chunk' && this.appliedView.mode === 'world') {
      const cam = this.cameras.main;
      state.chunkX = Math.floor(cam.midPoint.x / WORLD_TILE / CHUNK_COLUMNS);
      state.chunkY = Math.floor(cam.midPoint.y / WORLD_TILE / CHUNK_ROWS);
    }
    this.clampChunkSelection();
    const changed = state.viewMode !== this.appliedView.mode
      || state.chunkX !== this.appliedView.chunkX
      || state.chunkY !== this.appliedView.chunkY;
    if (!changed) return;
    this.appliedView = { mode: state.viewMode, chunkX: state.chunkX, chunkY: state.chunkY };
    this.applyViewMode();
    this.ui?.syncFromState();
  }

  private applyViewMode(): void {
    const store = this.store;
    if (!store) return;
    const cam = this.cameras.main;

    if (this.uiState.viewMode === 'chunk') {
      const rect = this.chunkRect();
      const pad = WORLD_TILE * 1.5;
      cam.setBounds(rect.x - pad, rect.y - pad, rect.w + pad * 2, rect.h + pad * 2);
      this.fitChunk();
      this.drawChunkMask();
    } else {
      const worldW = store.tilesX * WORLD_TILE;
      const worldH = store.tilesY * WORLD_TILE;
      cam.setBounds(-CAMERA_PAD, -CAMERA_PAD, worldW + CAMERA_PAD * 2, worldH + CAMERA_PAD * 2);
      this.chunkMaskGfx?.clear();
    }
    this.persistUi();
  }

  private fitChunk(): void {
    const cam = this.cameras.main;
    const rect = this.chunkRect();
    const zoom = Phaser.Math.Clamp(Math.min(cam.width / rect.w, cam.height / rect.h) * 0.94, MIN_ZOOM, MAX_ZOOM);
    cam.setZoom(zoom);
    cam.centerOn(rect.x + rect.w / 2, rect.y + rect.h / 2);
  }

  /** Dims everything outside the selected chunk so the focused screen pops out. */
  private drawChunkMask(): void {
    const store = this.store;
    const gfx = this.chunkMaskGfx;
    if (!store || !gfx) return;
    const rect = this.chunkRect();
    const minX = -CAMERA_PAD * 2;
    const minY = -CAMERA_PAD * 2;
    const maxX = store.tilesX * WORLD_TILE + CAMERA_PAD * 2;
    const maxY = store.tilesY * WORLD_TILE + CAMERA_PAD * 2;

    gfx.clear();
    gfx.fillStyle(0x05090b, 0.78);
    gfx.fillRect(minX, minY, rect.x - minX, maxY - minY);
    gfx.fillRect(rect.x + rect.w, minY, maxX - (rect.x + rect.w), maxY - minY);
    gfx.fillRect(rect.x, minY, rect.w, rect.y - minY);
    gfx.fillRect(rect.x, rect.y + rect.h, rect.w, maxY - (rect.y + rect.h));
    gfx.lineStyle(2, 0xf4a261, 0.9);
    gfx.strokeRect(rect.x, rect.y, rect.w, rect.h);
  }

  // ── Store events ────────────────────────────────────────────────────────

  private handleStoreChange(change: StoreChange): void {
    if (change.structure) {
      this.buildWorldObjects();
      this.appliedView = { mode: null, chunkX: -1, chunkY: -1 };
      this.syncViewMode();
      if (this.uiState.viewMode === 'world') this.fitView();
    } else if (change.cells) {
      const seen = new Set<string>();
      change.cells.forEach((cell) => {
        const key = `${cell.wx},${cell.wy}`;
        if (seen.has(key)) return;
        seen.add(key);
        this.refreshCell(cell.wx, cell.wy);
      });
    }
    if (!change.structure && (change.entities || change.spawn)) this.renderEntities();
    if (change.cells || change.entities || change.spawn || change.structure) this.ui?.requestMinimapRedraw();
    this.ui?.refreshHeader();
    this.refreshHoverStatus();
  }

  private handleUiStateChange(): void {
    if (this.uiState.tool === 'collision' && !this.uiState.showCollisions) {
      this.uiState.showCollisions = true;
      this.ui?.syncFromState();
    }
    this.syncViewMode();
    this.applyViewToggles();
    this.drawHover();
    this.persistUi();
  }

  // ── Pointer input ───────────────────────────────────────────────────────

  private registerPointerInput(): void {
    this.input.on(Phaser.Input.Events.POINTER_DOWN, (pointer: Phaser.Input.Pointer) => this.onPointerDown(pointer));
    this.input.on(Phaser.Input.Events.POINTER_MOVE, (pointer: Phaser.Input.Pointer) => this.onPointerMove(pointer));
    this.input.on(Phaser.Input.Events.POINTER_UP, (pointer: Phaser.Input.Pointer) => this.onPointerUp(pointer));
    this.input.on(Phaser.Input.Events.POINTER_UP_OUTSIDE, (pointer: Phaser.Input.Pointer) => this.onPointerUp(pointer));
    this.input.on(Phaser.Input.Events.GAME_OUT, () => {
      this.hovered = null;
      this.drawHover();
      this.ui?.setStatus(null);
    });
    this.input.on(
      Phaser.Input.Events.POINTER_WHEEL,
      (pointer: Phaser.Input.Pointer, _over: unknown, _dx: number, dy: number) => this.onWheel(pointer, dy),
    );
  }

  private screenToCell(screenX: number, screenY: number): CellCoord {
    const cam = this.cameras.main;
    const worldX = cam.midPoint.x + (screenX - cam.x - cam.width / 2) / cam.zoom;
    const worldY = cam.midPoint.y + (screenY - cam.y - cam.height / 2) / cam.zoom;
    return { x: Math.floor(worldX / WORLD_TILE), y: Math.floor(worldY / WORLD_TILE) };
  }

  private onPointerDown(pointer: Phaser.Input.Pointer): void {
    if (!this.store || pointer.x < PANEL_WIDTH) return;

    if (pointer.middleButtonDown() || (this.ui?.spaceHeld && pointer.leftButtonDown())) {
      this.panning = { lastX: pointer.x, lastY: pointer.y };
      return;
    }

    const cell = this.screenToCell(pointer.x, pointer.y);

    if (pointer.rightButtonDown()) {
      this.store.beginStroke();
      this.activeStroke = { erase: true, last: cell };
      this.applyEraseAt(cell.x, cell.y);
      return;
    }
    if (!pointer.leftButtonDown()) return;

    const tool = this.uiState.tool;
    if (tool === 'picker') {
      this.pickTileAt(cell.x, cell.y);
      return;
    }
    if (tool === 'fill') {
      this.fillAt(cell.x, cell.y);
      return;
    }
    if (tool === 'rect') {
      this.rectDrag = cell;
      this.drawRectPreview(cell);
      return;
    }

    this.store.beginStroke();
    this.activeStroke = { erase: false, last: cell };
    this.applyToolAt(cell.x, cell.y);
  }

  private onPointerMove(pointer: Phaser.Input.Pointer): void {
    if (this.panning) {
      const cam = this.cameras.main;
      cam.scrollX -= (pointer.x - this.panning.lastX) / cam.zoom;
      cam.scrollY -= (pointer.y - this.panning.lastY) / cam.zoom;
      this.panning = { lastX: pointer.x, lastY: pointer.y };
      return;
    }

    const cell = this.screenToCell(pointer.x, pointer.y);
    if (!this.hovered || this.hovered.x !== cell.x || this.hovered.y !== cell.y) {
      this.hovered = cell;
      this.drawHover();
      this.refreshHoverStatus();
    }

    if (this.activeStroke) {
      const last = this.activeStroke.last;
      if (last.x !== cell.x || last.y !== cell.y) {
        const erase = this.activeStroke.erase;
        this.lineCells(last.x, last.y, cell.x, cell.y, (x, y) => {
          if (erase) this.applyEraseAt(x, y);
          else this.applyToolAt(x, y);
        });
        this.activeStroke.last = cell;
      }
    }

    if (this.rectDrag) this.drawRectPreview(cell);
  }

  private onPointerUp(pointer: Phaser.Input.Pointer): void {
    if (this.panning) {
      this.panning = null;
      this.persistUi();
      return;
    }
    if (this.activeStroke) {
      this.store?.commitStroke();
      this.activeStroke = null;
      return;
    }
    if (this.rectDrag) {
      const end = this.screenToCell(pointer.x, pointer.y);
      this.applyRect(this.rectDrag, end);
      this.rectDrag = null;
      this.rectGfx?.clear();
    }
  }

  private onWheel(pointer: Phaser.Input.Pointer, dy: number): void {
    if (pointer.x < PANEL_WIDTH) return;
    const cam = this.cameras.main;
    const factor = dy > 0 ? 1 / 1.2 : 1.2;
    const zoom = Phaser.Math.Clamp(cam.zoom * factor, MIN_ZOOM, MAX_ZOOM);
    if (zoom === cam.zoom) return;

    // Zoom towards the cursor: keep the world point under the pointer fixed on screen.
    const viewX = pointer.x - cam.x - cam.width / 2;
    const viewY = pointer.y - cam.y - cam.height / 2;
    const worldX = cam.midPoint.x + viewX / cam.zoom;
    const worldY = cam.midPoint.y + viewY / cam.zoom;
    cam.setZoom(zoom);
    cam.centerOn(worldX - viewX / zoom, worldY - viewY / zoom);

    this.drawHover();
    this.refreshHoverStatus();
    this.persistUi();
  }

  // ── Tool application ────────────────────────────────────────────────────

  private forEachBrushCell(x: number, y: number, fn: (cx: number, cy: number) => void): void {
    const size = this.uiState.brushSize;
    const from = size === 3 ? -1 : 0;
    const to = size === 1 ? 0 : 1;
    for (let dy = from; dy <= to; dy += 1) {
      for (let dx = from; dx <= to; dx += 1) fn(x + dx, y + dy);
    }
  }

  private applyToolAt(x: number, y: number): void {
    const tool = this.uiState.tool;
    if (tool === 'brush') this.forEachBrushCell(x, y, (cx, cy) => this.paintTileCell(cx, cy));
    else if (tool === 'eraser') this.forEachBrushCell(x, y, (cx, cy) => this.eraseCell(cx, cy));
    else if (tool === 'collision') {
      this.forEachBrushCell(x, y, (cx, cy) => {
        if (this.isEditable(cx, cy)) this.store?.setCell('collision', cx, cy, true);
      });
    } else if (tool === 'entity') this.placeSelectedEntity(x, y);
    else if (tool === 'spawn' && this.isEditable(x, y)) this.store?.setSpawn(x, y);
  }

  private applyEraseAt(x: number, y: number): void {
    if (this.uiState.tool === 'collision') {
      this.forEachBrushCell(x, y, (cx, cy) => {
        if (this.isEditable(cx, cy)) this.store?.setCell('collision', cx, cy, false);
      });
      return;
    }
    this.forEachBrushCell(x, y, (cx, cy) => this.eraseCell(cx, cy));
  }

  private paintTileCell(x: number, y: number): void {
    const store = this.store;
    if (!store || !this.isEditable(x, y)) return;
    const { layer, tile, collisionMode } = this.uiState;
    if (tile === null) {
      if (layer === 'upper') store.setCell('upper', x, y, null);
    } else {
      store.setCell(layer, x, y, tile);
    }
    if (collisionMode !== 'keep') store.setCell('collision', x, y, collisionMode === 'set');
  }

  private eraseCell(x: number, y: number): void {
    const store = this.store;
    if (!store || !this.isEditable(x, y)) return;
    store.eraseEntitiesAt(x, y);
    store.setCell('upper', x, y, null);
    store.setCell('collision', x, y, false);
  }

  private placeSelectedEntity(x: number, y: number): void {
    const store = this.store;
    if (!store || !this.isEditable(x, y)) return;
    const sel = this.uiState.entity;
    if (sel.list === 'enemies') store.placeEntity({ list: 'enemies', type: sel.type, worldX: x, worldY: y });
    else if (sel.list === 'npcs') store.placeEntity({ list: 'npcs', type: sel.type, worldX: x, worldY: y });
    else if (sel.list === 'pickups') store.placeEntity({ list: 'pickups', type: sel.type, worldX: x, worldY: y });
    else {
      store.placeEntity({
        list: 'props', type: sel.type, worldX: x, worldY: y,
        ...(isDirectionalProp(sel.type) ? { dir: this.uiState.propDir } : {}),
      });
    }
  }

  private pickTileAt(x: number, y: number): void {
    const store = this.store;
    if (!store || !store.isInside(x, y)) return;
    const upper = store.readCell('upper', x, y) as number | null;
    if (upper !== null) {
      this.uiState.tile = upper;
      this.uiState.layer = 'upper';
    } else {
      this.uiState.tile = store.readCell('ground', x, y) as number;
      this.uiState.layer = 'ground';
    }
    this.uiState.tool = 'brush';
    this.uiState.tab = 'tiles';
    this.ui?.syncFromState();
    this.persistUi();
  }

  private fillAt(x: number, y: number): void {
    const store = this.store;
    if (!store || !store.isInside(x, y)) return;
    const { layer, tile, collisionMode } = this.uiState;
    if (tile === null && layer === 'ground') {
      this.ui?.toast('O chao nao pode ficar vazio — escolha um tile');
      return;
    }
    store.beginStroke();
    const filled = store.floodFill(layer, x, y, tile, this.editableBounds() ?? undefined);
    if (collisionMode !== 'keep') {
      filled.forEach((cell) => store.setCell('collision', cell.wx, cell.wy, collisionMode === 'set'));
    }
    store.commitStroke();
    if (filled.length > 0) this.ui?.toast(`Balde: ${filled.length} tiles`);
  }

  /** Rect corners ordered and, in chunk view, intersected with the editable chunk. */
  private clampRect(a: CellCoord, b: CellCoord): { x0: number; x1: number; y0: number; y1: number } | null {
    let x0 = Math.min(a.x, b.x);
    let x1 = Math.max(a.x, b.x);
    let y0 = Math.min(a.y, b.y);
    let y1 = Math.max(a.y, b.y);
    const bounds = this.editableBounds();
    if (bounds) {
      x0 = Math.max(x0, bounds.x0);
      x1 = Math.min(x1, bounds.x1);
      y0 = Math.max(y0, bounds.y0);
      y1 = Math.min(y1, bounds.y1);
      if (x0 > x1 || y0 > y1) return null;
    }
    return { x0, x1, y0, y1 };
  }

  private applyRect(a: CellCoord, b: CellCoord): void {
    const store = this.store;
    if (!store) return;
    const rect = this.clampRect(a, b);
    if (!rect) return;
    const { x0, x1, y0, y1 } = rect;
    store.beginStroke();
    for (let y = y0; y <= y1; y += 1) {
      for (let x = x0; x <= x1; x += 1) this.paintTileCell(x, y);
    }
    store.commitStroke();
  }

  private lineCells(x0: number, y0: number, x1: number, y1: number, fn: (x: number, y: number) => void): void {
    const dx = Math.abs(x1 - x0);
    const dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    let x = x0;
    let y = y0;
    for (;;) {
      fn(x, y);
      if (x === x1 && y === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x += sx; }
      if (e2 <= dx) { err += dx; y += sy; }
    }
  }

  // ── Overlays / status ───────────────────────────────────────────────────

  private drawHover(): void {
    const gfx = this.hoverGfx;
    if (!gfx) return;
    gfx.clear();
    const cell = this.hovered;
    if (!cell || !this.store) return;
    // In chunk view the outside is masked and read-only; only the picker still works there.
    if (!this.isEditable(cell.x, cell.y) && this.uiState.tool !== 'picker') return;

    const size = (this.uiState.tool === 'brush' || this.uiState.tool === 'eraser' || this.uiState.tool === 'collision')
      ? this.uiState.brushSize
      : 1;
    const from = size === 3 ? -1 : 0;
    const span = size === 1 ? 1 : size === 2 ? 2 : 3;
    gfx.lineStyle(Math.max(1, 2 / this.cameras.main.zoom), 0xf4a261, 0.95);
    gfx.strokeRect((cell.x + from) * WORLD_TILE, (cell.y + from) * WORLD_TILE, span * WORLD_TILE, span * WORLD_TILE);
  }

  private drawRectPreview(current: CellCoord): void {
    const gfx = this.rectGfx;
    const anchor = this.rectDrag;
    if (!gfx || !anchor) return;
    gfx.clear();
    const rect = this.clampRect(anchor, current);
    if (!rect) return;
    const { x0, x1, y0, y1 } = rect;
    gfx.lineStyle(Math.max(1, 2 / this.cameras.main.zoom), 0xf4a261, 1);
    gfx.fillStyle(0xf4a261, 0.12);
    gfx.fillRect(x0 * WORLD_TILE, y0 * WORLD_TILE, (x1 - x0 + 1) * WORLD_TILE, (y1 - y0 + 1) * WORLD_TILE);
    gfx.strokeRect(x0 * WORLD_TILE, y0 * WORLD_TILE, (x1 - x0 + 1) * WORLD_TILE, (y1 - y0 + 1) * WORLD_TILE);
  }

  private refreshHoverStatus(): void {
    const store = this.store;
    if (!store || !this.ui) return;
    const cell = this.hovered;
    if (!cell) {
      this.ui.setStatus(null);
      return;
    }
    const inside = store.isInside(cell.x, cell.y);
    this.ui.setStatus({
      tileX: cell.x,
      tileY: cell.y,
      inside,
      ground: inside ? (store.readCell('ground', cell.x, cell.y) as number) : 0,
      upper: inside ? (store.readCell('upper', cell.x, cell.y) as number | null) : null,
      collision: inside ? (store.readCell('collision', cell.x, cell.y) as boolean) : false,
      entities: inside ? store.entitiesAt(cell.x, cell.y).map((e) => e.type) : [],
      zoom: this.cameras.main.zoom,
    });
  }

  private syncCameraDerivedUi(): void {
    const cam = this.cameras.main;
    if (cam.scrollX === this.lastCamSync.scrollX && cam.scrollY === this.lastCamSync.scrollY && cam.zoom === this.lastCamSync.zoom) {
      return;
    }
    this.lastCamSync = { scrollX: cam.scrollX, scrollY: cam.scrollY, zoom: cam.zoom };
    const view = cam.worldView;
    this.ui?.updateMinimapViewport({
      x: view.x / WORLD_TILE,
      y: view.y / WORLD_TILE,
      w: view.width / WORLD_TILE,
      h: view.height / WORLD_TILE,
    });
  }

  // ── Camera helpers ──────────────────────────────────────────────────────

  private fitView(): void {
    const store = this.store;
    if (!store) return;
    if (this.uiState.viewMode === 'chunk') {
      this.fitChunk();
      this.persistUi();
      return;
    }
    const cam = this.cameras.main;
    const worldW = store.tilesX * WORLD_TILE;
    const worldH = store.tilesY * WORLD_TILE;
    const zoom = Phaser.Math.Clamp(Math.min(cam.width / worldW, cam.height / worldH) * 0.95, MIN_ZOOM, MAX_ZOOM);
    cam.setZoom(zoom);
    cam.centerOn(worldW / 2, worldH / 2);
    this.persistUi();
  }

  private centerOnTile(tileX: number, tileY: number): void {
    this.cameras.main.centerOn((tileX + 0.5) * WORLD_TILE, (tileY + 0.5) * WORLD_TILE);
    this.persistUi();
  }

  /** Minimap click: world view pans to the tile; chunk view jumps to that chunk. */
  private navigateTo(tileX: number, tileY: number): void {
    if (this.uiState.viewMode === 'chunk') {
      this.uiState.chunkX = Math.floor(tileX / CHUNK_COLUMNS);
      this.uiState.chunkY = Math.floor(tileY / CHUNK_ROWS);
      this.syncViewMode();
      return;
    }
    this.centerOnTile(tileX, tileY);
  }

  private handleResize(size: { width: number; height: number }): void {
    const { width, height } = size;
    this.cameras.main.setViewport(PANEL_WIDTH, 0, Math.max(1, width - PANEL_WIDTH), height);
  }

  // ── Actions ─────────────────────────────────────────────────────────────

  private requireValidStartPoint(): boolean {
    const errors = this.store?.startPointErrors() ?? ['Todo level precisa de um Ponto Inicial'];
    if (errors.length === 0) return true;
    this.uiState.tool = 'spawn';
    this.ui?.syncFromState();
    this.ui?.toast(errors[0], 3600);
    return false;
  }

  private async handleSave(): Promise<void> {
    const store = this.store;
    if (!store) return;
    if (!this.requireValidStartPoint()) return;
    try {
      // Persist UI first: writing public/world.json makes Vite reload the whole page.
      this.persistUi();
      store.world.meta.exportedAt = new Date().toISOString();
      const warnings = store.validate();
      await saveWorld(store.world, this.worldFileId);
      store.markSaved();
      this.ui?.toast(
        warnings.length > 0
          ? `Salvo com ${warnings.length} aviso(s) — veja em Mundo...`
          // O caminho é a única prova de QUAL arquivo levou a edição, e o subterrâneo não mora em
          // `levels/` — o toast dizia `public/levels/underworld.json`, que não existe.
          : `Salvo em ${worldFilePath(this.worldFileId)}`,
      );
    } catch (error) {
      this.ui?.toast(error instanceof Error ? error.message : 'Falha ao salvar');
    }
  }

  private handleReload(): void {
    if (this.store?.dirty && this.time.now > this.reloadArmedUntil) {
      this.reloadArmedUntil = this.time.now + 3000;
      this.ui?.toast('Ha alteracoes nao salvas — clique de novo para descartar');
      return;
    }
    this.persistUi();
    this.scene.restart();
  }

  private applyWorldSettings(settings: { name: string; chunksX: number; chunksY: number }): void {
    const store = this.store;
    if (!store) return;
    store.renameWorld(settings.name);
    const resized = store.world.meta.worldChunksX !== 5 || store.world.meta.worldChunksY !== 5;
    if (resized) store.resizeWorld(5, 5);
    this.ui?.refreshHeader();
    this.ui?.toast(resized ? 'Mundo fixado em 5x5 chunks' : 'Mundo atualizado');
  }

  /** Runs the real GameScene over the in-memory (possibly unsaved) world; ESC comes back. */
  private startPlaytest(): void {
    const store = this.store;
    if (!store) return;
    if (!this.requireValidStartPoint()) return;
    this.persistUi();
    setWorldData(store.snapshotWorld());
    // EM QUE ANDAR O P ENTRA. Sem isto o jogo assume a superfície, e testar o subterrâneo dava
    // duas coisas erradas de uma vez: a escada nascia virada para BAIXO (`isUnderground` escolhe a
    // arte e o sentido), e pisar nela chamava o `enterDungeon` — que RECARREGA o underworld.json
    // do disco, jogando fora a edição que ainda não foi salva. Com o andar certo, a escada sobe e
    // a viagem devolve o overworld, que é o que ela faz no jogo.
    setUnderground(this.isUnderworld);
    // O número vem do ARQUIVO aberto (level ou dungeon): testar a dungeon-3 pelo P é jogar o
    // level 3 ativo, com os mesmos botões flutuantes e o mesmo "reiniciar" do pause.
    if (this.registry.get('appMode') === 'lab') setActiveLevel(this.labFileNumber);
    this.scene.run(GameScene.key);
    this.scene.sleep();
  }

  /**
   * Trocar de ANDAR: uma navegação de verdade, pelo mesmo motivo do `openLabFile` — a cena inteira
   * (store, câmera, undo, objetos) nasce do arquivo, e trocar o arquivo por baixo dela seria
   * reconstruir tudo à mão em troca de nada. Cada andar guarda a própria câmera (`uiStateKey`), e
   * o `beforeunload` do painel é quem avisa se há edição não salva.
   */
  private openFloor(floor: WorldFloor): void {
    if (floor === this.worldFloor) return;
    this.persistUi();
    const url = new URL(window.location.href);
    if (floor === 'underworld') url.searchParams.set('under', '1');
    else url.searchParams.delete('under');
    url.searchParams.delete('play');
    window.location.assign(url.toString());
  }

  /** Full navigation is deliberate: public-file mutations trigger Vite reloads anyway. */
  private openLabFile(id: string): void {
    const match = /^(level|dungeon)-(\d+)$/u.exec(id);
    if (!match) return;
    this.persistUi();
    const url = new URL(window.location.href);
    // Um parâmetro por vez: `?level` e `?dungeon` juntos seriam dois arquivos disputando a cena.
    url.searchParams.delete('level');
    url.searchParams.delete('dungeon');
    url.searchParams.set(match[1], match[2]);
    url.searchParams.delete('play');
    window.location.assign(url.toString());
  }

  private handleWake(): void {
    this.ui?.setVisible(true);
    this.ui?.requestMinimapRedraw();
  }

  private handleSleep(): void {
    this.ui?.setVisible(false);
    this.activeStroke = null;
    this.rectDrag = null;
    this.panning = null;
  }

  // ── Persistence (survives the post-save Vite reload) ────────────────────

  private persistUi(): void {
    try {
      const cam = this.cameras.main;
      const persisted: PersistedUi = {
        state: this.uiState,
        cam: { centerX: cam.midPoint.x, centerY: cam.midPoint.y, zoom: cam.zoom },
      };
      window.sessionStorage.setItem(this.uiStateKey, JSON.stringify(persisted));
    } catch { /* ignore */ }
  }

  private restoreUi(): void {
    try {
      const raw = window.sessionStorage.getItem(this.uiStateKey);
      if (!raw) return;
      const persisted = JSON.parse(raw) as Partial<PersistedUi>;
      if (persisted.state && typeof persisted.state === 'object') {
        this.uiState = { ...this.uiState, ...persisted.state };
      }
    } catch { /* ignore */ }
  }

  private restoreCamera(): boolean {
    try {
      const raw = window.sessionStorage.getItem(this.uiStateKey);
      if (!raw) return false;
      const persisted = JSON.parse(raw) as Partial<PersistedUi>;
      if (!persisted.cam) return false;
      const cam = this.cameras.main;
      cam.setZoom(Phaser.Math.Clamp(persisted.cam.zoom, MIN_ZOOM, MAX_ZOOM));
      cam.centerOn(persisted.cam.centerX, persisted.cam.centerY);
      return true;
    } catch {
      return false;
    }
  }

  private renderSnapshot(): string {
    return JSON.stringify({
      mode: 'editor',
      loaded: Boolean(this.store),
      tool: this.uiState.tool,
      layer: this.uiState.layer,
      tile: this.uiState.tile,
      tab: this.uiState.tab,
      viewMode: this.uiState.viewMode,
      chunk: { cx: this.uiState.chunkX, cy: this.uiState.chunkY },
      dirty: this.store?.dirty ?? false,
      world: this.store
        ? { name: this.store.world.meta.name, chunksX: this.store.world.meta.worldChunksX, chunksY: this.store.world.meta.worldChunksY }
        : null,
      spawn: this.store?.spawn ?? null,
      zoom: this.cameras.main.zoom,
    });
  }
}
