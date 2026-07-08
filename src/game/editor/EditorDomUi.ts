import type Phaser from 'phaser';

import { ASSET_KEYS, CHUNK_COLUMNS, CHUNK_ROWS, KEY_FRAMES, NPC_VISUALS } from '@/game/constants';
import type { EditorStore, TileLayerId } from '@/game/editor/EditorStore';
import type { NpcKind, PickupKind } from '@/game/world/ScreenContent';
import type { PropKind, WorldDialog } from '@/game/world/worldSchema';

// The editor shell is plain DOM layered over the Phaser canvas: the canvas renders the
// world viewport, this module renders everything else (tools, palettes, minimap, modals).
// DOM gives us scrolling, text inputs and tooltips that Phaser UI can't do well — and the
// editor is dev-only, so there is no shipping cost.

export const PANEL_WIDTH = 320;

export type ToolId = 'brush' | 'eraser' | 'rect' | 'fill' | 'picker' | 'collision' | 'entity' | 'spawn';
export type CollisionPaintMode = 'keep' | 'set' | 'clear';
// No "enemies" tab: enemies are not authored anymore — skulls spawn dynamically at runtime
// around the hero in the dark (see UndeadSpawnDirector).
export type PaletteTab = 'tiles' | 'npcs' | 'pickups' | 'props';

export type EntitySelection =
  | { list: 'npcs'; type: NpcKind }
  | { list: 'pickups'; type: PickupKind }
  | { list: 'props'; type: PropKind };

export type ViewMode = 'world' | 'chunk';

export type UiState = {
  tool: ToolId;
  layer: TileLayerId;
  tile: number | null;
  brushSize: 1 | 2 | 3;
  collisionMode: CollisionPaintMode;
  tab: PaletteTab;
  entity: EntitySelection;
  showGrid: boolean;
  showCollisions: boolean;
  showEntities: boolean;
  // Chunk view: camera locked and fitted to one chunk, edits confined to it.
  viewMode: ViewMode;
  chunkX: number;
  chunkY: number;
};

export type StatusInfo = {
  tileX: number;
  tileY: number;
  inside: boolean;
  ground: number;
  upper: number | null;
  collision: boolean;
  entities: string[];
  zoom: number;
};

export type EditorUiCallbacks = {
  onStateChange: () => void;
  onSave: () => void;
  onReload: () => void;
  onPlaytest: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onFitView: () => void;
  onNavigate: (tileX: number, tileY: number) => void;
  onWorldApply: (settings: { name: string; chunksX: number; chunksY: number }) => void;
  onDialogApply: (kind: NpcKind, dialog: WorldDialog) => void;
};

export const NPC_KINDS: readonly NpcKind[] = [
  'blackCat', 'mimic', 'astronaut', 'businessMan', 'radiationSuit', 'painter', 'salesman', 'poet', 'wizard', 'death',
];

const NPC_LABELS: Record<NpcKind, string> = {
  blackCat: 'Gato Preto',
  mimic: 'Mimico',
  astronaut: 'Astronauta',
  businessMan: 'Empresario',
  radiationSuit: 'Operario',
  painter: 'Pintor',
  salesman: 'Vendedor',
  poet: 'Poeta',
  wizard: 'Mago',
  death: 'Morte',
};

const PICKUP_DEFS: ReadonlyArray<{ type: PickupKind; label: string; key: string; frame?: number }> = [
  { type: 'heart', label: 'Coracao', key: ASSET_KEYS.hudHearts, frame: 0 },
  { type: 'sword', label: 'Espada', key: ASSET_KEYS.swordItem, frame: 0 },
  { type: 'key', label: 'Chave', key: ASSET_KEYS.keyItem, frame: KEY_FRAMES.pickup },
  { type: 'axe', label: 'Machado', key: ASSET_KEYS.axeIcon },
  { type: 'bomb', label: 'Bomba', key: ASSET_KEYS.bombItem, frame: 0 },
  { type: 'lavaBoots', label: 'Botas de Lava', key: ASSET_KEYS.lavaBootsIcon },
  { type: 'pickaxe', label: 'Picareta', key: ASSET_KEYS.pickaxeIcon },
  { type: 'scythe', label: 'Foice', key: ASSET_KEYS.scytheIcon },
  { type: 'wood', label: 'Madeira', key: ASSET_KEYS.woodItem },
];

const PROP_DEFS: ReadonlyArray<{ type: PropKind; label: string; key: string; frame?: number }> = [
  { type: 'campfire', label: 'Fogueira', key: ASSET_KEYS.campfireFrame1 },
  { type: 'dryBush', label: 'Mato Seco', key: ASSET_KEYS.dryBush },
  { type: 'lockedDoor', label: 'Porta', key: ASSET_KEYS.lookedDoorObject },
  { type: 'dryTree', label: 'Arvore Seca', key: ASSET_KEYS.dryTree, frame: 0 },
  { type: 'rock', label: 'Pedra', key: ASSET_KEYS.rock },
  { type: 'tallGrass', label: 'Mato Alto', key: ASSET_KEYS.tallGrassWind0 },
  { type: 'lava', label: 'Lava', key: ASSET_KEYS.lavaFloor },
];

const TOOL_DEFS: ReadonlyArray<{ id: ToolId; label: string; kbd: string; hint: string }> = [
  { id: 'brush', label: 'Pincel', kbd: 'B', hint: 'Pinta tiles na camada ativa' },
  { id: 'eraser', label: 'Borracha', kbd: 'E', hint: 'Limpa camada superior, colisao e entidades' },
  { id: 'rect', label: 'Retangulo', kbd: 'R', hint: 'Arraste para preencher uma area' },
  { id: 'fill', label: 'Balde', kbd: 'F', hint: 'Preenche a regiao contigua com o tile' },
  { id: 'picker', label: 'Conta-gotas', kbd: 'I', hint: 'Copia o tile sob o cursor' },
  { id: 'collision', label: 'Colisao', kbd: 'C', hint: 'Pinta colisao (botao direito limpa)' },
  { id: 'entity', label: 'Entidade', kbd: '2-4', hint: 'Coloca a entidade escolhida na paleta' },
  { id: 'spawn', label: 'Spawn', kbd: 'S', hint: 'Define onde o jogador nasce' },
];

const TAB_DEFS: ReadonlyArray<{ id: PaletteTab; label: string; kbd: string }> = [
  { id: 'tiles', label: 'Tiles', kbd: '1' },
  { id: 'npcs', label: 'NPCs', kbd: '2' },
  { id: 'pickups', label: 'Itens', kbd: '3' },
  { id: 'props', label: 'Props', kbd: '4' },
];

const ENTITY_DOT_COLOR: Record<EntitySelection['list'], string> = {
  npcs: '#4488ff',
  pickups: '#33cc77',
  props: '#ffaa33',
};

const WAVE_OPTIONS: OscillatorType[] = ['sine', 'square', 'triangle', 'sawtooth'];

const STYLE_ID = 'zh-editor-style';

const CSS = `
#zh-editor-root { position: fixed; inset: 0; pointer-events: none; z-index: 10; font-family: 'Trebuchet MS', 'Segoe UI', sans-serif; color: #dfe9ec; }
#zh-editor-root * { box-sizing: border-box; }
#zh-editor-root .zh-panel { pointer-events: auto; position: absolute; top: 0; left: 0; bottom: 0; width: ${PANEL_WIDTH}px; background: #0c1418; border-right: 1px solid #22343c; display: flex; flex-direction: column; overflow-y: auto; overflow-x: hidden; }
#zh-editor-root .zh-panel::-webkit-scrollbar { width: 8px; }
#zh-editor-root .zh-panel::-webkit-scrollbar-thumb { background: #24404b; border-radius: 4px; }

#zh-editor-root .zh-header { padding: 10px 12px 6px; }
#zh-editor-root .zh-title { font-family: 'Press Start 2P', monospace; font-size: 13px; color: #f4a261; letter-spacing: 1px; display: flex; align-items: center; gap: 8px; }
#zh-editor-root .zh-dirty { width: 9px; height: 9px; border-radius: 50%; background: #35525d; flex: none; }
#zh-editor-root .zh-dirty.on { background: #ffb057; box-shadow: 0 0 6px #ffb057; }
#zh-editor-root .zh-subtitle { margin-top: 5px; font-size: 11px; color: #7fa3ab; }

#zh-editor-root .zh-actions { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px; padding: 6px 12px; }
#zh-editor-root button.zh-btn { pointer-events: auto; background: #16272e; color: #cfe3e8; border: 1px solid #2b4551; border-radius: 4px; padding: 6px 4px; font-size: 11px; cursor: pointer; font-family: inherit; }
#zh-editor-root button.zh-btn:hover:not(:disabled) { background: #1f3742; border-color: #3d6b7a; }
#zh-editor-root button.zh-btn:disabled { opacity: 0.35; cursor: default; }
#zh-editor-root button.zh-btn.primary { background: #f4a261; border-color: #f4a261; color: #10202a; font-weight: 700; }
#zh-editor-root button.zh-btn.primary:hover { background: #ffb87b; }
#zh-editor-root button.zh-btn.active { background: #f4a261; border-color: #ffd59e; color: #10202a; font-weight: 700; }

#zh-editor-root .zh-section { padding: 4px 12px 6px; }
#zh-editor-root .zh-label { font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: #6d949d; margin: 6px 0 4px; }
#zh-editor-root .zh-tools { display: grid; grid-template-columns: repeat(4, 1fr); gap: 4px; }
#zh-editor-root .zh-tools .zh-btn { display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 5px 2px; }
#zh-editor-root .zh-tools .zh-kbd { font-size: 9px; color: #6d949d; }
#zh-editor-root .zh-tools .zh-btn.active .zh-kbd { color: #3c2a12; }

#zh-editor-root .zh-seg { display: flex; gap: 4px; }
#zh-editor-root .zh-seg .zh-btn { flex: 1; }
#zh-editor-root .zh-checks { display: flex; gap: 10px; flex-wrap: wrap; font-size: 11px; padding: 2px 0; }
#zh-editor-root .zh-checks label { display: flex; align-items: center; gap: 4px; cursor: pointer; color: #a9c6cc; }

#zh-editor-root .zh-tabs { display: flex; gap: 2px; padding: 4px 12px 0; }
#zh-editor-root .zh-tabs .zh-btn { flex: 1; border-radius: 4px 4px 0 0; border-bottom: none; padding: 5px 2px; font-size: 10px; }
#zh-editor-root .zh-palette { margin: 0 12px; border: 1px solid #2b4551; border-radius: 0 0 4px 4px; background: #101d23; padding: 6px; display: flex; flex-wrap: wrap; gap: 4px; min-height: 84px; max-height: 210px; overflow-y: auto; }
#zh-editor-root .zh-cell { width: 40px; height: 40px; border: 1px solid #2b4551; border-radius: 3px; background: #16272e; cursor: pointer; display: flex; align-items: center; justify-content: center; padding: 0; position: relative; }
#zh-editor-root .zh-cell:hover { border-color: #f4a261; }
#zh-editor-root .zh-cell.selected { border: 2px solid #f4a261; box-shadow: 0 0 6px rgba(244, 162, 97, 0.6); }
#zh-editor-root .zh-cell img { width: 32px; height: 32px; image-rendering: pixelated; }
#zh-editor-root .zh-cell .zh-x { color: #f1faee; font-family: 'Press Start 2P', monospace; font-size: 14px; }
#zh-editor-root .zh-cell .zh-dot { position: absolute; right: 2px; bottom: 2px; width: 7px; height: 7px; border-radius: 50%; }

#zh-editor-root .zh-minimap { margin: 8px 12px 4px; position: relative; }
#zh-editor-root .zh-minimap canvas { display: block; border: 1px solid #2b4551; border-radius: 4px; image-rendering: pixelated; cursor: crosshair; background: #05090b; width: 100%; }

#zh-editor-root .zh-status { margin-top: auto; padding: 8px 12px 10px; font-size: 11px; line-height: 1.55; color: #9dbcc3; border-top: 1px solid #1a2c34; white-space: pre-line; }
#zh-editor-root .zh-status b { color: #dfe9ec; font-weight: 600; }

#zh-editor-root .zh-toasts { position: absolute; top: 10px; right: 12px; display: flex; flex-direction: column; gap: 6px; align-items: flex-end; pointer-events: none; }
#zh-editor-root .zh-toast { background: #17323b; color: #f1faee; border: 1px solid #2b4551; border-radius: 4px; padding: 7px 12px; font-size: 12px; opacity: 0; transform: translateY(-6px); transition: opacity 160ms, transform 160ms; max-width: 380px; }
#zh-editor-root .zh-toast.show { opacity: 1; transform: none; }

#zh-editor-root .zh-modal-backdrop { pointer-events: auto; position: absolute; inset: 0; background: rgba(2, 6, 8, 0.72); display: flex; align-items: center; justify-content: center; }
#zh-editor-root .zh-modal { background: #0e1a20; border: 1px solid #2b4551; border-radius: 6px; width: min(760px, calc(100vw - 40px)); max-height: calc(100vh - 60px); display: flex; flex-direction: column; box-shadow: 0 12px 40px rgba(0,0,0,0.6); }
#zh-editor-root .zh-modal-head { display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; border-bottom: 1px solid #1a2c34; }
#zh-editor-root .zh-modal-head h2 { margin: 0; font-family: 'Press Start 2P', monospace; font-size: 12px; color: #f4a261; }
#zh-editor-root .zh-modal-body { padding: 14px 16px; overflow-y: auto; font-size: 12px; line-height: 1.6; }
#zh-editor-root .zh-modal-foot { padding: 10px 16px; border-top: 1px solid #1a2c34; display: flex; justify-content: flex-end; gap: 8px; }
#zh-editor-root .zh-field { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
#zh-editor-root .zh-field > span { width: 130px; flex: none; color: #8fb2ba; font-size: 11px; }
#zh-editor-root input[type=text], #zh-editor-root input[type=number], #zh-editor-root select, #zh-editor-root textarea { background: #101d23; border: 1px solid #2b4551; color: #dfe9ec; border-radius: 4px; padding: 5px 8px; font-size: 12px; font-family: inherit; width: 100%; }
#zh-editor-root input[type=color] { background: #101d23; border: 1px solid #2b4551; border-radius: 4px; height: 28px; width: 60px; padding: 2px; }
#zh-editor-root .zh-dialog-grid { display: grid; grid-template-columns: 170px 1fr; gap: 14px; }
#zh-editor-root .zh-npc-list { display: flex; flex-direction: column; gap: 4px; max-height: 420px; overflow-y: auto; }
#zh-editor-root .zh-npc-list .zh-btn { display: flex; align-items: center; gap: 8px; text-align: left; }
#zh-editor-root .zh-npc-list img { width: 22px; height: 22px; image-rendering: pixelated; flex: none; }
#zh-editor-root .zh-line-row { display: flex; gap: 6px; margin-bottom: 6px; align-items: center; }
#zh-editor-root .zh-line-row select { width: 96px; flex: none; }
#zh-editor-root .zh-line-row .zh-btn { padding: 4px 7px; flex: none; }
#zh-editor-root .zh-help-table { width: 100%; border-collapse: collapse; }
#zh-editor-root .zh-help-table td { padding: 3px 8px 3px 0; border-bottom: 1px solid #14232b; }
#zh-editor-root .zh-help-table td:first-child { color: #f4a261; white-space: nowrap; font-family: monospace; }
#zh-editor-root kbd { background: #16272e; border: 1px solid #2b4551; border-radius: 3px; padding: 1px 5px; font-size: 10px; }

#zh-editor-root .zh-loading { pointer-events: auto; position: absolute; inset: 0; background: #0a1013; display: flex; align-items: center; justify-content: center; font-family: 'Press Start 2P', monospace; font-size: 13px; color: #f4a261; }
`;

export class EditorDomUi {
  private readonly root: HTMLDivElement;
  private readonly panel: HTMLDivElement;
  private readonly toasts: HTMLDivElement;
  private readonly modalRoot: HTMLDivElement;
  private readonly loading: HTMLDivElement;
  private readonly statusEl: HTMLDivElement;
  private readonly dirtyEl: HTMLSpanElement;
  private readonly subtitleEl: HTMLDivElement;
  private readonly undoBtn: HTMLButtonElement;
  private readonly redoBtn: HTMLButtonElement;
  private readonly toolButtons = new Map<ToolId, HTMLButtonElement>();
  private readonly tabButtons = new Map<PaletteTab, HTMLButtonElement>();
  private readonly paletteEl: HTMLDivElement;
  private optionsEl: HTMLDivElement;

  private readonly minimapCanvas: HTMLCanvasElement;
  private minimapBase: HTMLCanvasElement;
  private minimapScale = 2;
  private minimapRedrawQueued = false;
  private viewportRect: { x: number; y: number; w: number; h: number } | null = null;

  private readonly iconCache = new Map<string, string>();
  private suspended = false;
  private lastStatus: StatusInfo | null = null;

  public spaceHeld = false;

  private readonly handleKeyDown = (event: KeyboardEvent): void => this.onKeyDown(event);
  private readonly handleKeyUp = (event: KeyboardEvent): void => this.onKeyUp(event);
  private readonly handleBeforeUnload = (event: BeforeUnloadEvent): void => {
    if (this.store.dirty) event.preventDefault();
  };

  public constructor(
    private readonly scene: Phaser.Scene,
    private readonly store: EditorStore,
    private readonly state: UiState,
    private readonly cb: EditorUiCallbacks,
  ) {
    if (!document.getElementById(STYLE_ID)) {
      const style = document.createElement('style');
      style.id = STYLE_ID;
      style.textContent = CSS;
      document.head.appendChild(style);
    }

    this.root = document.createElement('div');
    this.root.id = 'zh-editor-root';

    this.panel = document.createElement('div');
    this.panel.className = 'zh-panel';
    this.root.appendChild(this.panel);

    const header = document.createElement('div');
    header.className = 'zh-header';
    const title = document.createElement('div');
    title.className = 'zh-title';
    title.textContent = 'ZERO ENGINE';
    this.dirtyEl = document.createElement('span');
    this.dirtyEl.className = 'zh-dirty';
    this.dirtyEl.title = 'Alteracoes nao salvas';
    title.appendChild(this.dirtyEl);
    this.subtitleEl = document.createElement('div');
    this.subtitleEl.className = 'zh-subtitle';
    header.append(title, this.subtitleEl);
    this.panel.appendChild(header);

    // Primary actions
    const actions = document.createElement('div');
    actions.className = 'zh-actions';
    actions.append(
      this.button('Salvar', 'Salvar em public/world.json (Ctrl+S)', () => this.cb.onSave(), 'primary'),
      this.button('&#9654; Testar', 'Joga o mundo em edicao sem salvar (P) — ESC volta', () => this.cb.onPlaytest()),
      this.button('Recarregar', 'Descarta e recarrega do world.json', () => this.cb.onReload()),
      this.button('Mundo&#8230;', 'Nome, tamanho e validacao do mundo', () => this.openWorldModal()),
      this.button('Dialogos&#8230;', 'Editor de dialogos dos NPCs', () => this.openDialogModal()),
      this.button('Ajuda (?)', 'Atalhos e controles', () => this.openHelpModal()),
    );
    this.undoBtn = this.button('&#8630; Desfazer', 'Ctrl+Z', () => this.cb.onUndo());
    this.redoBtn = this.button('&#8631; Refazer', 'Ctrl+Y', () => this.cb.onRedo());
    actions.append(this.undoBtn, this.redoBtn, this.button('Enquadrar', 'Centraliza o mundo na tela (0)', () => this.cb.onFitView()));
    this.panel.appendChild(actions);

    // Tools
    const toolSection = document.createElement('div');
    toolSection.className = 'zh-section';
    toolSection.appendChild(this.sectionLabel('Ferramentas'));
    const tools = document.createElement('div');
    tools.className = 'zh-tools';
    TOOL_DEFS.forEach((def) => {
      const btn = this.button(def.label, `${def.hint}`, () => {
        this.state.tool = def.id;
        this.changed();
      });
      const kbd = document.createElement('span');
      kbd.className = 'zh-kbd';
      kbd.textContent = def.kbd;
      btn.appendChild(kbd);
      this.toolButtons.set(def.id, btn);
      tools.appendChild(btn);
    });
    toolSection.appendChild(tools);
    this.panel.appendChild(toolSection);

    // Contextual options (rebuilt on sync)
    this.optionsEl = document.createElement('div');
    this.optionsEl.className = 'zh-section';
    this.panel.appendChild(this.optionsEl);

    // Palette tabs + grid
    const tabs = document.createElement('div');
    tabs.className = 'zh-tabs';
    TAB_DEFS.forEach((def) => {
      const btn = this.button(def.label, `Paleta de ${def.label.toLowerCase()} (${def.kbd})`, () => {
        this.selectTab(def.id);
      });
      this.tabButtons.set(def.id, btn);
      tabs.appendChild(btn);
    });
    this.panel.appendChild(tabs);

    this.paletteEl = document.createElement('div');
    this.paletteEl.className = 'zh-palette';
    this.panel.appendChild(this.paletteEl);

    // Minimap
    const minimapWrap = document.createElement('div');
    minimapWrap.className = 'zh-minimap';
    this.minimapCanvas = document.createElement('canvas');
    minimapWrap.appendChild(this.minimapCanvas);
    this.panel.appendChild(minimapWrap);
    this.minimapBase = document.createElement('canvas');
    this.bindMinimapInput();

    // Status
    this.statusEl = document.createElement('div');
    this.statusEl.className = 'zh-status';
    this.panel.appendChild(this.statusEl);

    // Toasts + modal root + loading
    this.toasts = document.createElement('div');
    this.toasts.className = 'zh-toasts';
    this.root.appendChild(this.toasts);
    this.modalRoot = document.createElement('div');
    this.root.appendChild(this.modalRoot);
    this.loading = document.createElement('div');
    this.loading.className = 'zh-loading';
    this.loading.textContent = 'Carregando mundo...';
    this.root.appendChild(this.loading);

    document.body.appendChild(this.root);
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    window.addEventListener('beforeunload', this.handleBeforeUnload);

    this.syncFromState();
    this.refreshHeader();
    this.requestMinimapRedraw();
  }

  public destroy(): void {
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    window.removeEventListener('beforeunload', this.handleBeforeUnload);
    this.root.remove();
  }

  public setLoading(loading: boolean): void {
    this.loading.style.display = loading ? 'flex' : 'none';
  }

  /** Hidden while a live playtest runs; also mutes all editor keyboard shortcuts. */
  public setVisible(visible: boolean): void {
    this.suspended = !visible;
    this.root.style.display = visible ? 'block' : 'none';
    if (!visible) this.spaceHeld = false;
  }

  public isModalOpen(): boolean {
    return this.modalRoot.childElementCount > 0;
  }

  // ── Small builders ──────────────────────────────────────────────────────

  private button(html: string, tooltip: string, onClick: () => void, extraClass = ''): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.className = `zh-btn ${extraClass}`.trim();
    btn.innerHTML = html;
    btn.title = tooltip;
    btn.addEventListener('click', onClick);
    return btn;
  }

  private sectionLabel(text: string): HTMLDivElement {
    const label = document.createElement('div');
    label.className = 'zh-label';
    label.textContent = text;
    return label;
  }

  private changed(): void {
    this.cb.onStateChange();
    this.syncFromState();
  }

  private selectTab(tab: PaletteTab): void {
    this.state.tab = tab;
    if (tab !== 'tiles') {
      this.state.tool = 'entity';
      const first = this.firstEntityOfTab(tab);
      if (first && this.state.entity.list !== first.list) this.state.entity = first;
    } else if (this.state.tool === 'entity') {
      this.state.tool = 'brush';
    }
    this.changed();
  }

  private firstEntityOfTab(tab: PaletteTab): EntitySelection | null {
    if (tab === 'npcs') return { list: 'npcs', type: NPC_KINDS[0] };
    if (tab === 'pickups') return { list: 'pickups', type: PICKUP_DEFS[0].type };
    if (tab === 'props') return { list: 'props', type: PROP_DEFS[0].type };
    return null;
  }

  private icon(key: string, frame?: number): string {
    const cacheKey = `${key}#${frame ?? ''}`;
    let url = this.iconCache.get(cacheKey);
    if (!url) {
      try {
        url = this.scene.textures.getBase64(key, frame);
      } catch {
        url = '';
      }
      this.iconCache.set(cacheKey, url);
    }
    return url;
  }

  // ── State sync ──────────────────────────────────────────────────────────

  public syncFromState(): void {
    this.toolButtons.forEach((btn, id) => btn.classList.toggle('active', this.state.tool === id));
    this.tabButtons.forEach((btn, id) => btn.classList.toggle('active', this.state.tab === id));
    this.renderOptions();
    this.renderPalette();
    this.renderStatus();
  }

  public refreshHeader(): void {
    const meta = this.store.world.meta;
    this.subtitleEl.textContent = `${meta.name} — ${meta.worldChunksX}x${meta.worldChunksY} chunks (${this.store.tilesX}x${this.store.tilesY} tiles)`;
    this.dirtyEl.classList.toggle('on', this.store.dirty);
    this.undoBtn.disabled = !this.store.canUndo;
    this.redoBtn.disabled = !this.store.canRedo;
  }

  private navChunk(dx: number, dy: number): void {
    const meta = this.store.world.meta;
    this.state.chunkX = Math.max(0, Math.min(meta.worldChunksX - 1, this.state.chunkX + dx));
    this.state.chunkY = Math.max(0, Math.min(meta.worldChunksY - 1, this.state.chunkY + dy));
    this.changed();
  }

  private renderViewControls(): void {
    this.optionsEl.appendChild(this.sectionLabel('Visao'));
    const seg = document.createElement('div');
    seg.className = 'zh-seg';
    const modes: Array<{ id: ViewMode; label: string; hint: string }> = [
      { id: 'world', label: 'Mundo', hint: 'Mundo inteiro com pan e zoom livres (M alterna)' },
      { id: 'chunk', label: 'Chunk', hint: 'Foca e edita um chunk por vez (M alterna, setas navegam)' },
    ];
    modes.forEach((mode) => {
      const btn = this.button(mode.label, mode.hint, () => {
        this.state.viewMode = mode.id;
        this.changed();
      });
      btn.classList.toggle('active', this.state.viewMode === mode.id);
      seg.appendChild(btn);
    });
    this.optionsEl.appendChild(seg);

    if (this.state.viewMode === 'chunk') {
      const nav = document.createElement('div');
      nav.className = 'zh-seg';
      nav.style.marginTop = '4px';
      const label = document.createElement('span');
      label.style.cssText = 'flex:1;display:flex;align-items:center;justify-content:center;font-size:11px;color:#a9c6cc;white-space:nowrap;';
      label.textContent = `Chunk (${this.state.chunkX}, ${this.state.chunkY})`;
      const arrow = (html: string, hint: string, dx: number, dy: number): HTMLButtonElement => {
        const btn = this.button(html, hint, () => this.navChunk(dx, dy));
        btn.style.flex = '0 0 40px';
        return btn;
      };
      nav.append(
        arrow('&#9664;', 'Chunk a esquerda (seta)', -1, 0),
        arrow('&#9650;', 'Chunk acima (seta)', 0, -1),
        arrow('&#9660;', 'Chunk abaixo (seta)', 0, 1),
        arrow('&#9654;', 'Chunk a direita (seta)', 1, 0),
        label,
      );
      this.optionsEl.appendChild(nav);
    }
  }

  private renderOptions(): void {
    this.optionsEl.innerHTML = '';
    this.renderViewControls();
    this.optionsEl.appendChild(this.sectionLabel('Opcoes'));

    const isTileTool = this.state.tool === 'brush' || this.state.tool === 'rect' || this.state.tool === 'fill' || this.state.tool === 'picker';
    if (isTileTool) {
      const layerSeg = document.createElement('div');
      layerSeg.className = 'zh-seg';
      (['ground', 'upper'] as const).forEach((layer) => {
        const btn = this.button(layer === 'ground' ? 'Chao' : 'Superior', 'Camada ativa (Tab alterna)', () => {
          this.state.layer = layer;
          this.changed();
        });
        btn.classList.toggle('active', this.state.layer === layer);
        layerSeg.appendChild(btn);
      });
      this.optionsEl.appendChild(layerSeg);

      const collSeg = document.createElement('div');
      collSeg.className = 'zh-seg';
      collSeg.style.marginTop = '4px';
      const modes: Array<{ id: CollisionPaintMode; label: string; hint: string }> = [
        { id: 'keep', label: 'Colisao: manter', hint: 'Pintar tiles nao mexe na colisao' },
        { id: 'set', label: 'marcar', hint: 'Cada tile pintado vira colisao' },
        { id: 'clear', label: 'limpar', hint: 'Cada tile pintado remove colisao' },
      ];
      modes.forEach((mode) => {
        const btn = this.button(mode.label, mode.hint, () => {
          this.state.collisionMode = mode.id;
          this.changed();
        });
        btn.classList.toggle('active', this.state.collisionMode === mode.id);
        collSeg.appendChild(btn);
      });
      this.optionsEl.appendChild(collSeg);
    }

    if (this.state.tool === 'brush' || this.state.tool === 'eraser' || this.state.tool === 'collision') {
      const brushSeg = document.createElement('div');
      brushSeg.className = 'zh-seg';
      brushSeg.style.marginTop = '4px';
      ([1, 2, 3] as const).forEach((size) => {
        const btn = this.button(`${size}x${size}`, 'Tamanho do pincel ( [ e ] )', () => {
          this.state.brushSize = size;
          this.changed();
        });
        btn.classList.toggle('active', this.state.brushSize === size);
        brushSeg.appendChild(btn);
      });
      this.optionsEl.appendChild(brushSeg);
    }

    const checks = document.createElement('div');
    checks.className = 'zh-checks';
    checks.style.marginTop = '6px';
    const toggles: Array<{ label: string; key: 'showGrid' | 'showCollisions' | 'showEntities'; kbd: string }> = [
      { label: 'Grade', key: 'showGrid', kbd: 'G' },
      { label: 'Colisoes', key: 'showCollisions', kbd: 'V' },
      { label: 'Entidades', key: 'showEntities', kbd: 'T' },
    ];
    toggles.forEach((toggle) => {
      const label = document.createElement('label');
      label.title = `Atalho: ${toggle.kbd}`;
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = this.state[toggle.key];
      input.addEventListener('change', () => {
        this.state[toggle.key] = input.checked;
        this.changed();
      });
      label.append(input, document.createTextNode(toggle.label));
      checks.appendChild(label);
    });
    this.optionsEl.appendChild(checks);
  }

  private renderPalette(): void {
    this.paletteEl.innerHTML = '';
    const tab = this.state.tab;

    if (tab === 'tiles') {
      const texture = this.scene.textures.get(ASSET_KEYS.forestTileset);
      const frameCount = Math.max(1, texture.frameTotal - 1);
      this.paletteEl.appendChild(this.tileCell(null));
      for (let frame = 0; frame < frameCount; frame += 1) this.paletteEl.appendChild(this.tileCell(frame));
      return;
    }

    const addEntityCell = (sel: EntitySelection, label: string, key: string, frame?: number): void => {
      const cell = document.createElement('button');
      cell.className = 'zh-cell';
      cell.title = label;
      const selected = this.state.tool === 'entity'
        && this.state.entity.list === sel.list && this.state.entity.type === sel.type;
      cell.classList.toggle('selected', selected);
      const img = document.createElement('img');
      img.src = this.icon(key, frame);
      img.alt = label;
      const dot = document.createElement('span');
      dot.className = 'zh-dot';
      dot.style.background = ENTITY_DOT_COLOR[sel.list];
      cell.append(img, dot);
      cell.addEventListener('click', () => {
        this.state.entity = sel;
        this.state.tool = 'entity';
        this.changed();
      });
      this.paletteEl.appendChild(cell);
    };

    if (tab === 'npcs') {
      NPC_KINDS.forEach((kind) => {
        const visual = NPC_VISUALS[kind];
        addEntityCell({ list: 'npcs', type: kind }, NPC_LABELS[kind], visual.key, visual.frame);
      });
    } else if (tab === 'pickups') {
      PICKUP_DEFS.forEach((def) => addEntityCell({ list: 'pickups', type: def.type }, def.label, def.key, def.frame));
    } else {
      PROP_DEFS.forEach((def) => addEntityCell({ list: 'props', type: def.type }, def.label, def.key, def.frame));
    }
  }

  private tileCell(frame: number | null): HTMLButtonElement {
    const cell = document.createElement('button');
    cell.className = 'zh-cell';
    cell.title = frame === null ? 'Limpar (camada superior)' : `Tile ${frame}`;
    cell.classList.toggle('selected', this.state.tile === frame);
    if (frame === null) {
      const x = document.createElement('span');
      x.className = 'zh-x';
      x.textContent = 'X';
      cell.appendChild(x);
    } else {
      const img = document.createElement('img');
      img.src = this.icon(ASSET_KEYS.forestTileset, frame);
      img.alt = `tile ${frame}`;
      cell.appendChild(img);
    }
    cell.addEventListener('click', () => {
      this.state.tile = frame;
      if (this.state.tool !== 'brush' && this.state.tool !== 'rect' && this.state.tool !== 'fill') this.state.tool = 'brush';
      this.changed();
    });
    return cell;
  }

  // ── Status bar ──────────────────────────────────────────────────────────

  public setStatus(info: StatusInfo | null): void {
    this.lastStatus = info;
    this.renderStatus();
  }

  private renderStatus(): void {
    const info = this.lastStatus;
    const toolDef = TOOL_DEFS.find((def) => def.id === this.state.tool);
    const selection = this.state.tool === 'entity'
      ? `${this.state.entity.list}:${this.state.entity.type}`
      : this.state.tile === null ? 'limpar' : `tile ${this.state.tile}`;
    const lines: string[] = [];
    const viewSuffix = this.state.viewMode === 'chunk' ? ` — visao chunk (${this.state.chunkX}, ${this.state.chunkY})` : '';
    lines.push(`<b>${toolDef?.label ?? this.state.tool}</b> — ${selection} — camada ${this.state.layer === 'ground' ? 'chao' : 'superior'}${viewSuffix}`);
    if (info && info.inside) {
      const cx = Math.floor(info.tileX / CHUNK_COLUMNS);
      const cy = Math.floor(info.tileY / CHUNK_ROWS);
      lines.push(`Tile (${info.tileX}, ${info.tileY}) — chunk (${cx}, ${cy}) — zoom ${Math.round(info.zoom * 100)}%`);
      const upper = info.upper === null ? '-' : String(info.upper);
      lines.push(`chao ${info.ground} | sup ${upper} | colisao ${info.collision ? 'sim' : 'nao'}${info.entities.length ? ` | ${info.entities.join(', ')}` : ''}`);
    } else {
      lines.push(info ? `Fora do mundo — zoom ${Math.round(info.zoom * 100)}%` : 'Cursor fora do mapa');
      lines.push('Direito apaga, roda = zoom, meio/espaco = mover');
    }
    this.statusEl.innerHTML = lines.join('<br>');
  }

  // ── Toasts ──────────────────────────────────────────────────────────────

  public toast(message: string, durationMs = 2400): void {
    const el = document.createElement('div');
    el.className = 'zh-toast';
    el.textContent = message;
    this.toasts.appendChild(el);
    window.requestAnimationFrame(() => el.classList.add('show'));
    window.setTimeout(() => {
      el.classList.remove('show');
      window.setTimeout(() => el.remove(), 220);
    }, durationMs);
  }

  // ── Minimap ─────────────────────────────────────────────────────────────

  public requestMinimapRedraw(): void {
    if (this.minimapRedrawQueued) return;
    this.minimapRedrawQueued = true;
    window.requestAnimationFrame(() => {
      this.minimapRedrawQueued = false;
      this.redrawMinimapBase();
      this.compositeMinimap();
    });
  }

  public updateMinimapViewport(rect: { x: number; y: number; w: number; h: number }): void {
    this.viewportRect = rect;
    this.compositeMinimap();
  }

  private redrawMinimapBase(): void {
    const tilesX = this.store.tilesX;
    const tilesY = this.store.tilesY;
    this.minimapScale = Math.max(1, Math.min(4, Math.floor((PANEL_WIDTH - 26) / tilesX)));
    const scale = this.minimapScale;
    this.minimapBase.width = tilesX * scale;
    this.minimapBase.height = tilesY * scale;
    const ctx = this.minimapBase.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#05090b';
    ctx.fillRect(0, 0, this.minimapBase.width, this.minimapBase.height);

    const texture = this.scene.textures.get(ASSET_KEYS.forestTileset);
    const source = texture.getSourceImage() as CanvasImageSource;

    for (let wy = 0; wy < tilesY; wy += 1) {
      for (let wx = 0; wx < tilesX; wx += 1) {
        const ground = this.store.readCell('ground', wx, wy) as number;
        const groundFrame = texture.get(ground);
        ctx.drawImage(source, groundFrame.cutX, groundFrame.cutY, groundFrame.width, groundFrame.height, wx * scale, wy * scale, scale, scale);
        const upper = this.store.readCell('upper', wx, wy) as number | null;
        if (upper !== null) {
          const upperFrame = texture.get(upper);
          ctx.drawImage(source, upperFrame.cutX, upperFrame.cutY, upperFrame.width, upperFrame.height, wx * scale, wy * scale, scale, scale);
        }
      }
    }

    // Chunk seams, entity dots and the player spawn read better than raw terrain alone.
    ctx.strokeStyle = 'rgba(255,255,255,0.10)';
    ctx.lineWidth = 1;
    for (let cx = 1; cx < this.store.world.meta.worldChunksX; cx += 1) {
      ctx.beginPath();
      ctx.moveTo(cx * CHUNK_COLUMNS * scale + 0.5, 0);
      ctx.lineTo(cx * CHUNK_COLUMNS * scale + 0.5, this.minimapBase.height);
      ctx.stroke();
    }
    for (let cy = 1; cy < this.store.world.meta.worldChunksY; cy += 1) {
      ctx.beginPath();
      ctx.moveTo(0, cy * CHUNK_ROWS * scale + 0.5);
      ctx.lineTo(this.minimapBase.width, cy * CHUNK_ROWS * scale + 0.5);
      ctx.stroke();
    }

    const dot = Math.max(2, scale);
    this.store.allEntities().forEach((entity) => {
      // Legacy authored enemies (no palette tab anymore) still show as red dots so the
      // author can find and erase them.
      ctx.fillStyle = entity.list === 'enemies' ? '#ff5566' : ENTITY_DOT_COLOR[entity.list];
      ctx.fillRect(entity.worldX * scale, entity.worldY * scale, dot, dot);
    });
    const spawn = this.store.spawn;
    ctx.fillStyle = '#00e0ff';
    ctx.fillRect(spawn.worldX * scale - 1, spawn.worldY * scale - 1, dot + 2, dot + 2);
  }

  private compositeMinimap(): void {
    this.minimapCanvas.width = this.minimapBase.width;
    this.minimapCanvas.height = this.minimapBase.height;
    const ctx = this.minimapCanvas.getContext('2d');
    if (!ctx || this.minimapBase.width === 0) return;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.minimapBase, 0, 0);
    if (this.viewportRect) {
      const scale = this.minimapScale;
      ctx.strokeStyle = '#f4a261';
      ctx.lineWidth = 2;
      ctx.strokeRect(
        this.viewportRect.x * scale + 1,
        this.viewportRect.y * scale + 1,
        this.viewportRect.w * scale - 2,
        this.viewportRect.h * scale - 2,
      );
    }
  }

  private bindMinimapInput(): void {
    let dragging = false;
    const navigate = (event: MouseEvent): void => {
      const bounds = this.minimapCanvas.getBoundingClientRect();
      const scaleX = this.minimapCanvas.width / bounds.width;
      const scaleY = this.minimapCanvas.height / bounds.height;
      const tileX = Math.floor(((event.clientX - bounds.left) * scaleX) / this.minimapScale);
      const tileY = Math.floor(((event.clientY - bounds.top) * scaleY) / this.minimapScale);
      this.cb.onNavigate(tileX, tileY);
    };
    this.minimapCanvas.addEventListener('mousedown', (event) => {
      dragging = true;
      navigate(event);
    });
    window.addEventListener('mousemove', (event) => {
      if (dragging) navigate(event);
    });
    window.addEventListener('mouseup', () => {
      dragging = false;
    });
  }

  // ── Keyboard ────────────────────────────────────────────────────────────

  private isTypingTarget(event: KeyboardEvent): boolean {
    const target = event.target as HTMLElement | null;
    if (!target) return false;
    const tag = target.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
  }

  private onKeyDown(event: KeyboardEvent): void {
    if (this.suspended) return;

    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
      event.preventDefault();
      this.cb.onSave();
      return;
    }
    if (this.isTypingTarget(event)) return;

    if (event.key === 'Escape' && this.isModalOpen()) {
      this.closeModal();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      if (event.shiftKey) this.cb.onRedo();
      else this.cb.onUndo();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') {
      event.preventDefault();
      this.cb.onRedo();
      return;
    }
    if (event.ctrlKey || event.metaKey || event.altKey || this.isModalOpen()) return;

    if (event.code === 'Space') {
      this.spaceHeld = true;
      event.preventDefault();
      return;
    }

    const key = event.key.toLowerCase();
    const toolByKey: Record<string, ToolId> = { b: 'brush', e: 'eraser', r: 'rect', f: 'fill', i: 'picker', c: 'collision', s: 'spawn' };
    if (toolByKey[key]) {
      this.state.tool = toolByKey[key];
      this.changed();
      return;
    }
    const tabByKey: Record<string, PaletteTab> = { 1: 'tiles', 2: 'npcs', 3: 'pickups', 4: 'props' };
    if (tabByKey[key]) {
      this.selectTab(tabByKey[key]);
      return;
    }
    if (key === 'm') {
      this.state.viewMode = this.state.viewMode === 'world' ? 'chunk' : 'world';
      this.changed();
      return;
    }
    if (this.state.viewMode === 'chunk' && key.startsWith('arrow')) {
      event.preventDefault();
      if (key === 'arrowleft') this.navChunk(-1, 0);
      else if (key === 'arrowright') this.navChunk(1, 0);
      else if (key === 'arrowup') this.navChunk(0, -1);
      else this.navChunk(0, 1);
      return;
    }
    if (key === 'g') { this.state.showGrid = !this.state.showGrid; this.changed(); return; }
    if (key === 'v') { this.state.showCollisions = !this.state.showCollisions; this.changed(); return; }
    if (key === 't') { this.state.showEntities = !this.state.showEntities; this.changed(); return; }
    if (key === 'p') { this.cb.onPlaytest(); return; }
    if (key === '0') { this.cb.onFitView(); return; }
    if (key === 'tab') {
      event.preventDefault();
      this.state.layer = this.state.layer === 'ground' ? 'upper' : 'ground';
      this.changed();
      return;
    }
    if (key === '[') {
      this.state.brushSize = Math.max(1, this.state.brushSize - 1) as UiState['brushSize'];
      this.changed();
      return;
    }
    if (key === ']') {
      this.state.brushSize = Math.min(3, this.state.brushSize + 1) as UiState['brushSize'];
      this.changed();
    }
  }

  private onKeyUp(event: KeyboardEvent): void {
    if (event.code === 'Space') this.spaceHeld = false;
  }

  // ── Modals ──────────────────────────────────────────────────────────────

  private closeModal(): void {
    this.modalRoot.innerHTML = '';
  }

  private modalShell(titleText: string): { body: HTMLDivElement; foot: HTMLDivElement } {
    this.closeModal();
    const backdrop = document.createElement('div');
    backdrop.className = 'zh-modal-backdrop';
    backdrop.addEventListener('mousedown', (event) => {
      if (event.target === backdrop) this.closeModal();
    });
    const modal = document.createElement('div');
    modal.className = 'zh-modal';
    const head = document.createElement('div');
    head.className = 'zh-modal-head';
    const title = document.createElement('h2');
    title.textContent = titleText;
    const close = this.button('&#10005;', 'Fechar (ESC)', () => this.closeModal());
    head.append(title, close);
    const body = document.createElement('div');
    body.className = 'zh-modal-body';
    const foot = document.createElement('div');
    foot.className = 'zh-modal-foot';
    modal.append(head, body, foot);
    backdrop.appendChild(modal);
    this.modalRoot.appendChild(backdrop);
    return { body, foot };
  }

  private field(labelText: string, input: HTMLElement): HTMLDivElement {
    const row = document.createElement('div');
    row.className = 'zh-field';
    const span = document.createElement('span');
    span.textContent = labelText;
    row.append(span, input);
    return row;
  }

  public openWorldModal(): void {
    const { body, foot } = this.modalShell('Mundo');
    const meta = this.store.world.meta;

    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.value = meta.name;
    const chunksXInput = document.createElement('input');
    chunksXInput.type = 'number';
    chunksXInput.min = '1';
    chunksXInput.max = '32';
    chunksXInput.value = String(meta.worldChunksX);
    const chunksYInput = document.createElement('input');
    chunksYInput.type = 'number';
    chunksYInput.min = '1';
    chunksYInput.max = '32';
    chunksYInput.value = String(meta.worldChunksY);

    body.append(
      this.field('Nome', nameInput),
      this.field('Chunks (largura)', chunksXInput),
      this.field('Chunks (altura)', chunksYInput),
    );

    const stats = this.store.stats();
    const statsEl = document.createElement('p');
    statsEl.innerHTML = `Cada chunk tem ${CHUNK_COLUMNS}x${CHUNK_ROWS} tiles.<br>`
      + `NPCs: <b>${stats.npcs}</b> — Itens: <b>${stats.pickups}</b> — Props: <b>${stats.props}</b>`;
    body.appendChild(statsEl);

    const warnings = this.store.validate();
    if (warnings.length > 0) {
      const warnEl = document.createElement('p');
      warnEl.style.color = '#ffb057';
      warnEl.innerHTML = `&#9888; ${warnings.join('<br>&#9888; ')}`;
      body.appendChild(warnEl);
    }

    const note = document.createElement('p');
    note.style.color = '#6d949d';
    note.textContent = 'Redimensionar corta chunks fora do novo tamanho e limpa o historico de desfazer.';
    body.appendChild(note);

    foot.append(
      this.button('Cancelar', '', () => this.closeModal()),
      this.button('Aplicar', '', () => {
        this.cb.onWorldApply({
          name: nameInput.value,
          chunksX: Number(chunksXInput.value),
          chunksY: Number(chunksYInput.value),
        });
        this.closeModal();
      }, 'primary'),
    );
  }

  public openDialogModal(initialKind: NpcKind = NPC_KINDS[0]): void {
    const { body, foot } = this.modalShell('Dialogos dos NPCs');
    let currentKind = initialKind;
    let working: WorldDialog = this.store.getDialog(currentKind);

    const grid = document.createElement('div');
    grid.className = 'zh-dialog-grid';
    const listEl = document.createElement('div');
    listEl.className = 'zh-npc-list';
    const formEl = document.createElement('div');
    grid.append(listEl, formEl);
    body.appendChild(grid);

    const renderList = (): void => {
      listEl.innerHTML = '';
      NPC_KINDS.forEach((kind) => {
        const visual = NPC_VISUALS[kind];
        const btn = this.button('', NPC_LABELS[kind], () => {
          currentKind = kind;
          working = this.store.getDialog(kind);
          renderList();
          renderForm();
        });
        btn.classList.toggle('active', kind === currentKind);
        const img = document.createElement('img');
        img.src = this.icon(visual.key, visual.frame);
        const span = document.createElement('span');
        span.textContent = NPC_LABELS[kind];
        btn.append(img, span);
        listEl.appendChild(btn);
      });
    };

    const renderForm = (): void => {
      formEl.innerHTML = '';

      const nameInput = document.createElement('input');
      nameInput.type = 'text';
      nameInput.value = working.npcName;
      nameInput.addEventListener('input', () => { working.npcName = nameInput.value; });

      const colorInput = document.createElement('input');
      colorInput.type = 'color';
      colorInput.value = working.npcColorHex;
      colorInput.addEventListener('input', () => { working.npcColorHex = colorInput.value; });

      const freqInput = document.createElement('input');
      freqInput.type = 'number';
      freqInput.min = '60';
      freqInput.max = '2000';
      freqInput.value = String(working.voice.freq);
      freqInput.addEventListener('input', () => { working.voice.freq = Number(freqInput.value) || working.voice.freq; });

      const waveSelect = document.createElement('select');
      WAVE_OPTIONS.forEach((wave) => {
        const option = document.createElement('option');
        option.value = wave;
        option.textContent = wave;
        option.selected = working.voice.wave === wave;
        waveSelect.appendChild(option);
      });
      waveSelect.addEventListener('change', () => { working.voice.wave = waveSelect.value as OscillatorType; });

      formEl.append(
        this.field('Nome exibido', nameInput),
        this.field('Cor do nome', colorInput),
        this.field('Voz (freq Hz)', freqInput),
        this.field('Voz (onda)', waveSelect),
        this.sectionLabel('Falas (npc fala, narrador descreve)'),
      );

      const linesEl = document.createElement('div');
      formEl.appendChild(linesEl);

      const renderLines = (): void => {
        linesEl.innerHTML = '';
        working.lines.forEach((line, index) => {
          const row = document.createElement('div');
          row.className = 'zh-line-row';

          const speakerSelect = document.createElement('select');
          (['npc', 'narrator'] as const).forEach((speaker) => {
            const option = document.createElement('option');
            option.value = speaker;
            option.textContent = speaker === 'npc' ? 'NPC' : 'Narrador';
            option.selected = line.speaker === speaker;
            speakerSelect.appendChild(option);
          });
          speakerSelect.addEventListener('change', () => { line.speaker = speakerSelect.value as 'npc' | 'narrator'; });

          const textInput = document.createElement('input');
          textInput.type = 'text';
          textInput.value = line.text;
          textInput.addEventListener('input', () => { line.text = textInput.value; });

          const up = this.button('&#8593;', 'Mover para cima', () => {
            if (index === 0) return;
            [working.lines[index - 1], working.lines[index]] = [working.lines[index], working.lines[index - 1]];
            renderLines();
          });
          const down = this.button('&#8595;', 'Mover para baixo', () => {
            if (index >= working.lines.length - 1) return;
            [working.lines[index + 1], working.lines[index]] = [working.lines[index], working.lines[index + 1]];
            renderLines();
          });
          const del = this.button('&#10005;', 'Remover fala', () => {
            working.lines.splice(index, 1);
            renderLines();
          });

          row.append(speakerSelect, textInput, up, down, del);
          linesEl.appendChild(row);
        });

        const add = this.button('+ Adicionar fala', '', () => {
          working.lines.push({ speaker: 'npc', text: '' });
          renderLines();
        });
        add.style.marginTop = '4px';
        linesEl.appendChild(add);
      };
      renderLines();
    };

    renderList();
    renderForm();

    foot.append(
      this.button('Fechar', '', () => this.closeModal()),
      this.button('Aplicar neste NPC', 'Grava as falas editadas no mundo (salve depois com Ctrl+S)', () => {
        working.lines = working.lines.filter((line) => line.text.trim().length > 0);
        this.cb.onDialogApply(currentKind, working);
        working = this.store.getDialog(currentKind);
        this.toast(`Dialogo de ${NPC_LABELS[currentKind]} aplicado`);
      }, 'primary'),
    );
  }

  public openHelpModal(): void {
    const { body, foot } = this.modalShell('Ajuda — controles');
    const rows: Array<[string, string]> = [
      ['Botao esquerdo', 'Usa a ferramenta ativa'],
      ['Botao direito', 'Apaga (entidades, tile superior e colisao; na ferramenta Colisao, so colisao)'],
      ['Botao do meio / Espaco + arrastar', 'Move a camera'],
      ['Roda do mouse', 'Zoom no cursor'],
      ['B / E / R / F / I / C / S', 'Pincel, Borracha, Retangulo, Balde, Conta-gotas, Colisao, Spawn'],
      ['1..5', 'Abas: Tiles, Inimigos, NPCs, Itens, Props'],
      ['Tab', 'Alterna camada chao/superior'],
      ['[ e ]', 'Tamanho do pincel'],
      ['M', 'Alterna visao mundo / chunk'],
      ['Setas', 'Na visao chunk: muda o chunk selecionado'],
      ['G / V / T', 'Mostrar grade / colisoes / entidades'],
      ['Ctrl+Z / Ctrl+Y', 'Desfazer / refazer'],
      ['Ctrl+S', 'Salvar world.json'],
      ['P', 'Testar o mundo em edicao (ESC volta ao editor)'],
      ['0', 'Enquadrar o mundo na tela'],
    ];
    const table = document.createElement('table');
    table.className = 'zh-help-table';
    rows.forEach(([keys, description]) => {
      const tr = document.createElement('tr');
      const td1 = document.createElement('td');
      td1.textContent = keys;
      const td2 = document.createElement('td');
      td2.textContent = description;
      tr.append(td1, td2);
      table.appendChild(tr);
    });
    body.appendChild(table);
    foot.appendChild(this.button('Fechar', '', () => this.closeModal(), 'primary'));
  }
}
