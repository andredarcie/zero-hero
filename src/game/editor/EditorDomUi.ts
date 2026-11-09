import type * as Engine from '@/game/engine';

import { CHUNK_COLUMNS, CHUNK_ROWS } from '@/game/constants';
import type { EditorStore } from '@/game/editor/EditorStore';

import type { NpcKind } from '@/game/world/ScreenContent';
import type {
  PropDir, PropKind, WorldDialog,
} from '@/game/world/worldSchema';
import {
  worldFilePath,
  type WorldFileId,
} from '@/game/worldApi';

import { createCanvas } from '@/game/platform/platform';
import { EditorModals, NPC_KINDS } from './EditorModals';
import { EditorMinimap, PANEL_WIDTH, type EntitySelection } from './EditorMinimap';
import { EditorPanels, PICKUP_DEFS, PROP_DEFS } from './EditorPanels';
import { EditorKeys, type PaletteTab, type UiState } from './EditorKeys';
import { EditorToolbar, TOOL_DEFS } from './EditorToolbar';
export { isDirectionalProp } from './EditorKeys';
export type { ToolId, PaletteTab, UiState } from './EditorKeys';
export type { CollisionPaintMode, ReliefPaintMode, ViewMode } from './EditorPanels';
export { PANEL_WIDTH } from './EditorMinimap';
export type { EntitySelection } from './EditorMinimap';
export { NPC_KINDS } from './EditorModals';

// The editor shell is plain DOM layered over the 2D canvas: the canvas renders the
// world viewport, this module renders everything else (tools, palettes, minimap, modals).
// DOM gives us scrolling, text inputs and tooltips that canvas UI can't do well — and the
// editor is dev-only, so there is no shipping cost.

export type StatusInfo = {
  tileX: number;
  tileY: number;
  inside: boolean;
  ground: number;
  upper: number | null;
  collision: boolean;
  relief: number;
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
  /** O arquivo aberto agora. E o que o Salvar escreve, entao e o que os botoes prometem. */
  worldFile: WorldFileId;
};

// …e destes, quais tem a ARTE dividida em um frame por direcao. Sao duas perguntas diferentes e
// junta-las quebrou a caixa de ferramentas na primeira tentativa: os frames dela sao as poses da
// tampa, entao desenhar `frame = dir` no tabuleiro punha a caixa aberta e forjando num mapa
// parado. Quem nao tem frames de direcao ganha uma marca de proa no chip (ver EditorScene).
const DIR_FRAME_PROPS: ReadonlySet<PropKind> = new Set<PropKind>();

export const hasDirectionFrames = (type: PropKind): boolean => DIR_FRAME_PROPS.has(type);

/** O nome da direcao, pro editor poder dizer pra onde a peca esta virada. */
export const PROP_DIR_LABEL: Record<PropDir, string> = { 0: 'Norte', 1: 'Leste', 2: 'Sul', 3: 'Oeste' };

const RELIEF_LABEL: Readonly<Record<number, string>> = {
  1: 'planalto', 2: 'escada sobe N', 3: 'escada sobe L', 4: 'escada sobe S', 5: 'escada sobe O',
};

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
#zh-editor-root .zh-palette { margin: 0 12px; border: 1px solid #2b4551; border-radius: 0 0 4px 4px; background: #101d23; padding: 6px; display: flex; flex-wrap: wrap; gap: 4px; min-height: 84px; max-height: 280px; overflow-y: auto; }
/* flex-basis 100% so a section title takes a whole row of the wrapping palette grid. */
#zh-editor-root .zh-group { flex: 0 0 100%; margin: 4px 0 0; color: #8ecae6; font-family: 'Press Start 2P', monospace; font-size: 8px; letter-spacing: 0.5px; border-bottom: 1px solid #2b4551; padding-bottom: 3px; }
#zh-editor-root .zh-group:first-child { margin-top: 0; }
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
#zh-editor-root .zh-var-row { display: grid; grid-template-columns: minmax(150px, 1fr) auto auto auto; gap: 8px; align-items: center; margin-bottom: 7px; }
#zh-editor-root .zh-var-row code { color: #d8eef2; overflow: hidden; text-overflow: ellipsis; }
#zh-editor-root .zh-var-empty { color: #6d949d; margin: 6px 0 12px; }
#zh-editor-root .zh-chunk-catalog-head { display: grid; grid-template-columns: 72px minmax(0, 1fr) auto; gap: 10px; align-items: center; padding: 9px; margin-bottom: 12px; border: 1px solid #29414b; background: #101d23; }
#zh-editor-root .zh-chunk-preview { width: 72px; height: 54px; object-fit: cover; image-rendering: pixelated; background: #05090b; border: 1px solid #2b4551; }
#zh-editor-root .zh-chunk-description { min-height: 72px; resize: vertical; }
#zh-editor-root .zh-chunk-create { margin-top: 16px; padding-top: 14px; border-top: 1px solid #1f3540; }
#zh-editor-root .zh-deck { margin-bottom: 14px; padding-bottom: 12px; border-bottom: 1px solid #1f3540; }
#zh-editor-root .zh-deck-head { display: flex; align-items: center; gap: 8px; margin-bottom: 7px; }
#zh-editor-root .zh-deck-count { flex: 1; color: #8ecae6; font-family: 'Press Start 2P', monospace; font-size: 9px; }
#zh-editor-root .zh-deck-list { max-height: 218px; overflow-y: auto; border: 1px solid #29414b; background: #0c1519; }
#zh-editor-root .zh-deck-row { display: grid; grid-template-columns: 18px minmax(0, 1fr) auto; gap: 8px; align-items: center; padding: 5px 8px; border-bottom: 1px solid #14232b; cursor: pointer; }
#zh-editor-root .zh-deck-row:last-child { border-bottom: 0; }
#zh-editor-root .zh-deck-row:hover { background: #12222a; }
#zh-editor-root .zh-deck-row.is-editing { background: #16303a; }
#zh-editor-root .zh-deck-row.is-off .zh-deck-name { color: #55707a; text-decoration: line-through; }
#zh-editor-root .zh-deck-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #dfe9ec; }
#zh-editor-root .zh-deck-tag { color: #6d949d; font-size: 9px; margin-left: 6px; }
#zh-editor-root .zh-deck-tag.npc { color: #f4a261; }
#zh-editor-root .zh-deck-cost { color: #ffd479; font-family: 'Press Start 2P', monospace; font-size: 9px; white-space: nowrap; }
#zh-editor-root .zh-deck-row input { margin: 0; accent-color: #66d9ef; }
#zh-editor-root .zh-help-table { width: 100%; border-collapse: collapse; }
#zh-editor-root .zh-help-table td { padding: 3px 8px 3px 0; border-bottom: 1px solid #14232b; }
#zh-editor-root .zh-help-table td:first-child { color: #f4a261; white-space: nowrap; font-family: monospace; }
#zh-editor-root kbd { background: #16272e; border: 1px solid #2b4551; border-radius: 3px; padding: 1px 5px; font-size: 10px; }

#zh-editor-root .zh-loading { pointer-events: auto; position: absolute; inset: 0; background: #0a1013; display: flex; align-items: center; justify-content: center; font-family: 'Press Start 2P', monospace; font-size: 13px; color: #f4a261; }
`;

export class EditorDomUi {
  private readonly root: HTMLDivElement;
  public readonly panel: HTMLDivElement;
  private readonly toasts: HTMLDivElement;
  public readonly modalRoot: HTMLDivElement;
  private readonly loading: HTMLDivElement;
  private readonly statusEl: HTMLDivElement;
  /** O título, as ações, as ferramentas e as abas (ver EditorToolbar). */
  private readonly toolbar: EditorToolbar;
  public readonly paletteEl: HTMLDivElement;
  public optionsEl: HTMLDivElement;

  public readonly minimapCanvas: HTMLCanvasElement;
  public minimapBase: HTMLCanvasElement;

  private readonly iconCache = new Map<string, string>();
  public suspended = false;
  private lastStatus: StatusInfo | null = null;

  public spaceHeld = false;

  private readonly handleKeyDown = (event: KeyboardEvent): void => this.keys.onKeyDown(event);
  private readonly handleKeyUp = (event: KeyboardEvent): void => this.keys.onKeyUp(event);
  private readonly handleBeforeUnload = (event: BeforeUnloadEvent): void => {
    if (this.store.dirty) event.preventDefault();
  };
  /** As janelas: mundo, falas e ajuda. (ver EditorModals) */
  public readonly modals = new EditorModals(this);
  /** O minimapa. (ver EditorMinimap) */
  public readonly minimap: EditorMinimap = new EditorMinimap(this);
  /** Os painéis de vista, opções e paleta. (ver EditorPanels) */
  private readonly panels = new EditorPanels(this);
  /** Os atalhos. (ver EditorKeys) */
  private readonly keys = new EditorKeys(this);

  public constructor(
    public readonly scene: Engine.Scene,
    public readonly store: EditorStore,
    public readonly state: UiState,
    public readonly cb: EditorUiCallbacks,
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

    this.toolbar = new EditorToolbar(this);
    this.panel.append(this.toolbar.header, this.toolbar.actions, this.toolbar.tools);

    // Contextual options (rebuilt on sync)
    this.optionsEl = document.createElement('div');
    this.optionsEl.className = 'zh-section';
    this.panel.appendChild(this.optionsEl);

    // Palette tabs + grid
    this.panel.appendChild(this.toolbar.tabs);

    this.paletteEl = document.createElement('div');
    this.paletteEl.className = 'zh-palette';
    this.panel.appendChild(this.paletteEl);

    // Minimap
    const minimapWrap = document.createElement('div');
    minimapWrap.className = 'zh-minimap';
    this.minimapCanvas = createCanvas();
    minimapWrap.appendChild(this.minimapCanvas);
    this.panel.appendChild(minimapWrap);
    this.minimapBase = createCanvas();
    this.minimap.bindMinimapInput();

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
    this.minimap.requestMinimapRedraw();
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

  public button(html: string, tooltip: string, onClick: () => void, extraClass = ''): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.className = `zh-btn ${extraClass}`.trim();
    btn.innerHTML = html;
    btn.title = tooltip;
    btn.addEventListener('click', onClick);
    return btn;
  }

  public sectionLabel(text: string): HTMLDivElement {
    const label = document.createElement('div');
    label.className = 'zh-label';
    label.textContent = text;
    return label;
  }

  public changed(): void {
    this.cb.onStateChange();
    this.syncFromState();
  }

  public selectTab(tab: PaletteTab): void {
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

  public icon(key: string, frame?: number): string {
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
    this.toolbar.toolButtons.forEach((btn, id) => btn.classList.toggle('active', this.state.tool === id));
    this.toolbar.tabButtons.forEach((btn, id) => btn.classList.toggle('active', this.state.tab === id));
    this.panels.renderOptions();
    this.panels.renderPalette();
    this.renderStatus();
  }

  /** O arquivo que o Salvar vai escrever — o mesmo que o toast anuncia depois. */
  public saveTargetPath(): string {
    return worldFilePath(this.cb.worldFile);
  }

  public refreshHeader(): void {
    const meta = this.store.world.meta;
    this.toolbar.subtitleEl.textContent = `${meta.name} — ${meta.worldChunksX}x${meta.worldChunksY} chunks (${this.store.tilesX}x${this.store.tilesY} tiles)`;
    this.toolbar.dirtyEl.classList.toggle('on', this.store.dirty);
    this.toolbar.undoBtn.disabled = !this.store.canUndo;
    this.toolbar.redoBtn.disabled = !this.store.canRedo;
  }

  public navChunk(dx: number, dy: number): void {
    const meta = this.store.world.meta;
    this.state.chunkX = Math.max(0, Math.min(meta.worldChunksX - 1, this.state.chunkX + dx));
    this.state.chunkY = Math.max(0, Math.min(meta.worldChunksY - 1, this.state.chunkY + dy));
    this.changed();
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
      : this.state.tool === 'relief'
        ? ({ high: 'planalto', peak: 'cume', stair: 'escada' } as const)[this.state.reliefMode]
      : this.state.tool === 'spawn'
        ? `(${this.store.spawn.worldX}, ${this.store.spawn.worldY})`
      : this.state.tile === null ? 'limpar' : `tile ${this.state.tile}`;
    const lines: string[] = [];
    const viewSuffix = this.state.viewMode === 'chunk' ? ` — visao chunk (${this.state.chunkX}, ${this.state.chunkY})` : '';
    lines.push(`<b>${toolDef?.label ?? this.state.tool}</b> — ${selection} — camada ${this.state.layer === 'ground' ? 'chao' : 'superior'}${viewSuffix}`);
    if (info && info.inside) {
      const cx = Math.floor(info.tileX / CHUNK_COLUMNS);
      const cy = Math.floor(info.tileY / CHUNK_ROWS);
      lines.push(`Tile (${info.tileX}, ${info.tileY}) — chunk (${cx}, ${cy}) — zoom ${Math.round(info.zoom * 100)}%`);
      const upper = info.upper === null ? '-' : String(info.upper);
      lines.push(`chao ${info.ground} | sup ${upper} | colisao ${info.collision ? 'sim' : 'nao'}${info.relief ? ` | serra ${RELIEF_LABEL[info.relief] ?? info.relief}` : ''}${info.entities.length ? ` | ${info.entities.join(', ')}` : ''}`);
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

  // ── Keyboard ────────────────────────────────────────────────────────────

  // ── Modals ──────────────────────────────────────────────────────────────

}
