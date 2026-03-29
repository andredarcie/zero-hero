import Phaser from 'phaser';

import {
  ASSET_KEYS,
  BOARD_PANEL_PADDING,
  DEFAULT_GAME_HEIGHT,
  EDITOR_BUTTON_HEIGHT,
  EDITOR_BUTTON_WIDTH,
  EDITOR_EMPTY_TILE_LABEL,
  EDITOR_LEVEL_BUTTON_HEIGHT,
  EDITOR_LEVEL_LIST_MAX,
  EDITOR_NEW_LEVEL_FILE_NAME,
  EDITOR_PALETTE_COLUMNS,
  EDITOR_PALETTE_TILE_SIZE,
  EDITOR_PANEL_WIDTH,
  FONT_FAMILY,
  GRID_COLUMNS,
  GRID_ROWS,
  MIN_BOARD_TILE_SIZE,
  SCENE_DEPTHS,
  TILE_GAP,
  TIMINGS,
} from '@/game/constants';
import { registerSceneDebugHooks } from '@/game/debug/debugHooks';
import { EditorBoard } from '@/game/editor/EditorBoard';
import { createButton, createButtonLabel, createToast, defaultBottomButtonY } from '@/game/editor/EditorUi';
import { TilePalette } from '@/game/editor/TilePalette';
import { buildLevelExportJson, cloneLevelExport, createEmptyLevelState, type EditorLayer, type LevelExport, type LevelItemType, type LevelObjectType } from '@/game/levelEditor';
import { cloneLoadedLevel, listLevels, loadLevelByFileName, saveLevelByFileName, type LevelListEntry } from '@/game/levelApi';
import { resolveBoardCell } from '@/game/shared/grid';

type EditorMode = 'tile' | 'item' | 'object';

type BoardMetrics = {
  tileSize: number;
  offsetX: number;
  offsetY: number;
  width: number;
  height: number;
};

type PaletteMetrics = {
  tileSize: number;
  columns: number;
  rows: number;
  offsetX: number;
  offsetY: number;
  width: number;
  height: number;
};

type LevelButton = {
  fileName: string;
  background: Phaser.GameObjects.Rectangle;
  label: Phaser.GameObjects.Text;
};

type EditorSnapshot = {
  mode: 'editor';
  editorMode: EditorMode;
  selectedTile: number | null;
  selectedItemType: LevelItemType | null;
  selectedObjectType: LevelObjectType | null;
  selectedLayer: EditorLayer;
  collisionEnabled: boolean;
  hoveredCell: { column: number; row: number } | null;
  currentFileName: string | null;
  availableLevels: string[];
  dirty: boolean;
  level: LevelExport;
};

export class EditorScene extends Phaser.Scene {
  public static readonly key = 'editor';
  private static readonly modeSectionY = BOARD_PANEL_PADDING + 146;
  private static readonly levelSectionY = BOARD_PANEL_PADDING + 282;

  private boardMetrics: BoardMetrics = {
    tileSize: MIN_BOARD_TILE_SIZE,
    offsetX: 0,
    offsetY: 0,
    width: GRID_COLUMNS * MIN_BOARD_TILE_SIZE,
    height: GRID_ROWS * MIN_BOARD_TILE_SIZE,
  };
  private paletteMetrics: PaletteMetrics = {
    tileSize: 32,
    columns: EDITOR_PALETTE_COLUMNS,
    rows: 1,
    offsetX: 0,
    offsetY: 0,
    width: 0,
    height: 0,
  };
  private level = createEmptyLevelState();
  private selectedMode: EditorMode = 'tile';
  private selectedTile: number | null = 0;
  private selectedItemType: LevelItemType | null = 'key';
  private selectedObjectType: LevelObjectType | null = 'lookedDoor';
  private selectedLayer: EditorLayer = 'ground';
  private collisionEnabled = false;
  private hoveredCell: { column: number; row: number } | null = null;
  private currentFileName: string | null = null;
  private dirty = false;
  private availableLevels: LevelListEntry[] = [];
  private readonly levelButtons: LevelButton[] = [];
  private board?: EditorBoard;
  private tilePalette?: TilePalette;
  private statusText?: Phaser.GameObjects.Text;
  private modeTileButton?: Phaser.GameObjects.Rectangle;
  private modeItemButton?: Phaser.GameObjects.Rectangle;
  private modeObjectButton?: Phaser.GameObjects.Rectangle;
  private modeTileLabel?: Phaser.GameObjects.Text;
  private modeItemLabel?: Phaser.GameObjects.Text;
  private modeObjectLabel?: Phaser.GameObjects.Text;
  private itemSelectButton?: Phaser.GameObjects.Rectangle;
  private itemSelectLabel?: Phaser.GameObjects.Text;
  private objectSelectButton?: Phaser.GameObjects.Rectangle;
  private objectSelectLabel?: Phaser.GameObjects.Text;
  private layerGroundButton?: Phaser.GameObjects.Rectangle;
  private layerUpperButton?: Phaser.GameObjects.Rectangle;
  private layerGroundLabel?: Phaser.GameObjects.Text;
  private layerUpperLabel?: Phaser.GameObjects.Text;
  private collisionButton?: Phaser.GameObjects.Rectangle;
  private collisionLabel?: Phaser.GameObjects.Text;
  private saveButton?: Phaser.GameObjects.Rectangle;
  private saveLabel?: Phaser.GameObjects.Text;
  private exportButton?: Phaser.GameObjects.Rectangle;
  private exportLabel?: Phaser.GameObjects.Text;
  private clearButton?: Phaser.GameObjects.Rectangle;
  private clearLabel?: Phaser.GameObjects.Text;

  public constructor() {
    super(EditorScene.key);
  }

  public create(): void {
    this.cameras.main.setBackgroundColor('#102027');
    this.board = new EditorBoard(this);
    this.createUi();
    this.tilePalette = new TilePalette(this, (tile) => {
      this.selectedTile = tile;
      this.tilePalette?.refreshSelection(this.selectedTile);
      this.refreshStatus();
    });
    this.registerInput();
    this.scale.on(Phaser.Scale.Events.RESIZE, this.handleResize, this);
    this.handleResize({ width: this.scale.width, height: this.scale.height });
    this.refreshBoard();
    this.refreshStatus();
    this.refreshLayerButtons();
    this.refreshModeButtons();
    this.refreshEntityButtons();
    registerSceneDebugHooks(this, () => this.renderSnapshot());
    void this.refreshLevelList(true);
  }

  public shutdown(): void {
    this.scale.off(Phaser.Scale.Events.RESIZE, this.handleResize, this);
  }

  private createUi(): void {
    this.add.text(BOARD_PANEL_PADDING, BOARD_PANEL_PADDING, 'Editor de mapas', {
      color: '#f1faee',
      fontFamily: FONT_FAMILY,
      fontSize: '20px',
    }).setDepth(SCENE_DEPTHS.ui);

    this.add.text(BOARD_PANEL_PADDING, BOARD_PANEL_PADDING + 28, 'Rota: /editor | listar, editar e salvar em /levels', {
      color: '#9fc7c9',
      fontFamily: FONT_FAMILY,
      fontSize: '12px',
    }).setDepth(SCENE_DEPTHS.ui);

    this.statusText = this.add.text(BOARD_PANEL_PADDING, BOARD_PANEL_PADDING + 60, '', {
      color: '#f1faee',
      fontFamily: FONT_FAMILY,
      fontSize: '12px',
      lineSpacing: 3,
      wordWrap: { width: EDITOR_PANEL_WIDTH - (BOARD_PANEL_PADDING * 2) },
    }).setDepth(SCENE_DEPTHS.ui);

    this.add.text(BOARD_PANEL_PADDING, EditorScene.modeSectionY, 'Modo de edicao', {
      color: '#a8dadc',
      fontFamily: FONT_FAMILY,
      fontSize: '12px',
    }).setDepth(SCENE_DEPTHS.ui);

    this.modeTileButton = createButton(this, BOARD_PANEL_PADDING, EditorScene.modeSectionY + 22, 84, EDITOR_BUTTON_HEIGHT, () => {
      this.selectedMode = 'tile';
      this.refreshModeButtons();
      this.refreshEntityButtons();
      this.refreshStatus();
    });
    this.modeTileLabel = createButtonLabel(this, BOARD_PANEL_PADDING + 42, EditorScene.modeSectionY + 37, 'Tile');

    this.modeItemButton = createButton(this, BOARD_PANEL_PADDING + 92, EditorScene.modeSectionY + 22, 84, EDITOR_BUTTON_HEIGHT, () => {
      this.selectedMode = 'item';
      this.refreshModeButtons();
      this.refreshEntityButtons();
      this.refreshStatus();
    });
    this.modeItemLabel = createButtonLabel(this, BOARD_PANEL_PADDING + 134, EditorScene.modeSectionY + 37, 'Item');

    this.modeObjectButton = createButton(this, BOARD_PANEL_PADDING + 184, EditorScene.modeSectionY + 22, 104, EDITOR_BUTTON_HEIGHT, () => {
      this.selectedMode = 'object';
      this.refreshModeButtons();
      this.refreshEntityButtons();
      this.refreshStatus();
    });
    this.modeObjectLabel = createButtonLabel(this, BOARD_PANEL_PADDING + 236, EditorScene.modeSectionY + 37, 'Objeto');

    this.itemSelectButton = createButton(this, BOARD_PANEL_PADDING, EditorScene.modeSectionY + 58, EDITOR_PANEL_WIDTH - (BOARD_PANEL_PADDING * 2), EDITOR_BUTTON_HEIGHT, () => {
      this.cycleItemSelection();
    });
    this.itemSelectLabel = createButtonLabel(this, EDITOR_PANEL_WIDTH / 2, EditorScene.modeSectionY + 73, '');

    this.objectSelectButton = createButton(this, BOARD_PANEL_PADDING, EditorScene.modeSectionY + 94, EDITOR_PANEL_WIDTH - (BOARD_PANEL_PADDING * 2), EDITOR_BUTTON_HEIGHT, () => {
      this.cycleObjectSelection();
    });
    this.objectSelectLabel = createButtonLabel(this, EDITOR_PANEL_WIDTH / 2, EditorScene.modeSectionY + 109, '');

    this.add.text(BOARD_PANEL_PADDING, EditorScene.levelSectionY, 'Levels em /levels', {
      color: '#a8dadc',
      fontFamily: FONT_FAMILY,
      fontSize: '12px',
    }).setDepth(SCENE_DEPTHS.ui);

    this.add.text(BOARD_PANEL_PADDING, BOARD_PANEL_PADDING + 412, 'Camada', {
      color: '#a8dadc',
      fontFamily: FONT_FAMILY,
      fontSize: '12px',
    }).setDepth(SCENE_DEPTHS.ui);

    this.layerGroundButton = createButton(this, BOARD_PANEL_PADDING, BOARD_PANEL_PADDING + 434, EDITOR_BUTTON_WIDTH, EDITOR_BUTTON_HEIGHT, () => {
      this.selectedLayer = 'ground';
      this.refreshLayerButtons();
      this.refreshStatus();
    });
    this.layerGroundLabel = createButtonLabel(this, BOARD_PANEL_PADDING + EDITOR_BUTTON_WIDTH / 2, BOARD_PANEL_PADDING + 449, 'Chao');

    this.layerUpperButton = createButton(this, BOARD_PANEL_PADDING + EDITOR_BUTTON_WIDTH + 12, BOARD_PANEL_PADDING + 434, EDITOR_BUTTON_WIDTH, EDITOR_BUTTON_HEIGHT, () => {
      this.selectedLayer = 'upper';
      this.refreshLayerButtons();
      this.refreshStatus();
    });
    this.layerUpperLabel = createButtonLabel(this, BOARD_PANEL_PADDING + EDITOR_BUTTON_WIDTH + 12 + EDITOR_BUTTON_WIDTH / 2, BOARD_PANEL_PADDING + 449, 'Superior');

    this.add.text(BOARD_PANEL_PADDING, BOARD_PANEL_PADDING + 480, 'Colisao', {
      color: '#a8dadc',
      fontFamily: FONT_FAMILY,
      fontSize: '12px',
    }).setDepth(SCENE_DEPTHS.ui);

    this.collisionButton = createButton(this, BOARD_PANEL_PADDING, BOARD_PANEL_PADDING + 502, EDITOR_PANEL_WIDTH - (BOARD_PANEL_PADDING * 2), EDITOR_BUTTON_HEIGHT, () => {
      this.collisionEnabled = !this.collisionEnabled;
      this.refreshLayerButtons();
      this.refreshStatus();
    });
    this.collisionLabel = createButtonLabel(this, EDITOR_PANEL_WIDTH / 2, BOARD_PANEL_PADDING + 517, '');

    this.add.text(BOARD_PANEL_PADDING, BOARD_PANEL_PADDING + 550, 'Tiles do forest_tile_set', {
      color: '#a8dadc',
      fontFamily: FONT_FAMILY,
      fontSize: '12px',
    }).setDepth(SCENE_DEPTHS.ui);

    this.saveButton = createButton(this, BOARD_PANEL_PADDING, defaultBottomButtonY.save, EDITOR_PANEL_WIDTH - (BOARD_PANEL_PADDING * 2), EDITOR_BUTTON_HEIGHT, () => {
      void this.handleSave();
    });
    this.saveLabel = createButtonLabel(this, EDITOR_PANEL_WIDTH / 2, DEFAULT_GAME_HEIGHT - 89, 'Salvar arquivo');

    this.exportButton = createButton(this, BOARD_PANEL_PADDING, defaultBottomButtonY.export, EDITOR_PANEL_WIDTH - (BOARD_PANEL_PADDING * 2), EDITOR_BUTTON_HEIGHT, () => {
      void this.handleExport();
    });
    this.exportLabel = createButtonLabel(this, EDITOR_PANEL_WIDTH / 2, DEFAULT_GAME_HEIGHT - 53, 'Copiar JSON');

    this.clearButton = createButton(this, BOARD_PANEL_PADDING, defaultBottomButtonY.clear, EDITOR_PANEL_WIDTH - (BOARD_PANEL_PADDING * 2), EDITOR_BUTTON_HEIGHT, () => {
      this.level = cloneLevelExport(createEmptyLevelState());
      this.currentFileName = EDITOR_NEW_LEVEL_FILE_NAME;
      this.dirty = true;
      this.refreshBoard();
      this.refreshStatus();
      this.refreshLevelButtons();
    });
    this.clearLabel = createButtonLabel(this, EDITOR_PANEL_WIDTH / 2, DEFAULT_GAME_HEIGHT - 17, 'Novo mapa');
  }

  private registerInput(): void {
    this.input.on(Phaser.Input.Events.POINTER_MOVE, (pointer: Phaser.Input.Pointer) => {
      this.hoveredCell = this.resolveBoardCell(pointer.worldX, pointer.worldY);
      this.board?.refreshHover(this.boardMetrics, this.hoveredCell);
    });

    this.input.on(Phaser.Input.Events.POINTER_DOWN, (pointer: Phaser.Input.Pointer) => {
      const cell = this.resolveBoardCell(pointer.worldX, pointer.worldY);
      if (cell) {
        this.paintCell(cell.column, cell.row);
      }
    });

    this.input.keyboard?.on('keydown-G', () => { this.selectedLayer = 'ground'; this.refreshLayerButtons(); this.refreshStatus(); });
    this.input.keyboard?.on('keydown-U', () => { this.selectedLayer = 'upper'; this.refreshLayerButtons(); this.refreshStatus(); });
    this.input.keyboard?.on('keydown-C', () => { this.collisionEnabled = !this.collisionEnabled; this.refreshLayerButtons(); this.refreshStatus(); });
    this.input.keyboard?.on('keydown-T', () => { this.selectedMode = 'tile'; this.refreshModeButtons(); this.refreshEntityButtons(); this.refreshStatus(); });
    this.input.keyboard?.on('keydown-I', () => { this.selectedMode = 'item'; this.refreshModeButtons(); this.refreshEntityButtons(); this.refreshStatus(); });
    this.input.keyboard?.on('keydown-O', () => { this.selectedMode = 'object'; this.refreshModeButtons(); this.refreshEntityButtons(); this.refreshStatus(); });
    this.input.keyboard?.on('keydown-J', () => { this.cycleItemSelection(); });
    this.input.keyboard?.on('keydown-K', () => { this.cycleObjectSelection(); });
    this.input.keyboard?.on('keydown-E', () => { void this.handleExport(); });
    this.input.keyboard?.on('keydown-S', () => { void this.handleSave(); });
  }

  private handleResize(gameSize: Phaser.Structs.Size | { width: number; height: number }): void {
    const { width, height } = gameSize;
    this.boardMetrics = this.calculateBoardMetrics(width, height);
    this.paletteMetrics = this.calculatePaletteMetrics(height);
    this.board?.layout(this.boardMetrics);
    this.tilePalette?.render(this.paletteMetrics, this.selectedTile);
    this.layoutBottomButtons(height);
    this.refreshBoard();
    this.board?.refreshHover(this.boardMetrics, this.hoveredCell);
    this.refreshStatus();
    this.refreshLayerButtons();
    this.refreshModeButtons();
    this.refreshEntityButtons();
    this.refreshLevelButtons();
  }

  private calculateBoardMetrics(width: number, height: number): BoardMetrics {
    const availableWidth = Math.max(200, width - EDITOR_PANEL_WIDTH - (BOARD_PANEL_PADDING * 2));
    const availableHeight = Math.max(200, height - (BOARD_PANEL_PADDING * 2));
    const tileSize = Math.max(MIN_BOARD_TILE_SIZE, Math.floor(Math.min(availableWidth / GRID_COLUMNS, availableHeight / GRID_ROWS)));
    const boardWidth = tileSize * GRID_COLUMNS;
    const boardHeight = tileSize * GRID_ROWS;

    return {
      tileSize,
      offsetX: EDITOR_PANEL_WIDTH + Math.max(BOARD_PANEL_PADDING, Math.floor((availableWidth - boardWidth) / 2) + BOARD_PANEL_PADDING),
      offsetY: Math.max(BOARD_PANEL_PADDING, Math.floor((height - boardHeight) / 2)),
      width: boardWidth,
      height: boardHeight,
    };
  }

  private calculatePaletteMetrics(height: number): PaletteMetrics {
    const texture = this.textures.get(ASSET_KEYS.forestTileset);
    const frameCount = Math.max(1, texture.frameTotal - 1);
    const rows = Math.ceil((frameCount + 1) / EDITOR_PALETTE_COLUMNS);
    const tileSize = EDITOR_PALETTE_TILE_SIZE;
    const width = (EDITOR_PALETTE_COLUMNS * tileSize) + ((EDITOR_PALETTE_COLUMNS - 1) * TILE_GAP);
    const contentHeight = (rows * tileSize) + ((rows - 1) * TILE_GAP);

    return {
      tileSize,
      columns: EDITOR_PALETTE_COLUMNS,
      rows,
      offsetX: BOARD_PANEL_PADDING,
      offsetY: Math.min(BOARD_PANEL_PADDING + 562, height - contentHeight - 132),
      width,
      height: contentHeight,
    };
  }

  private layoutBottomButtons(height: number): void {
    this.saveButton?.setPosition(BOARD_PANEL_PADDING, height - 104);
    this.saveLabel?.setPosition(EDITOR_PANEL_WIDTH / 2, height - 89);
    this.exportButton?.setPosition(BOARD_PANEL_PADDING, height - 68);
    this.exportLabel?.setPosition(EDITOR_PANEL_WIDTH / 2, height - 53);
    this.clearButton?.setPosition(BOARD_PANEL_PADDING, height - 32);
    this.clearLabel?.setPosition(EDITOR_PANEL_WIDTH / 2, height - 17);
  }

  private refreshBoard(): void {
    this.board?.render(this.level, this.boardMetrics);
  }

  private refreshStatus(): void {
    const hoverText = this.hoveredCell ? `Cursor: (${this.hoveredCell.column}, ${this.hoveredCell.row})` : 'Cursor: fora do mapa';
    const tileLabel = this.selectedTile === null ? EDITOR_EMPTY_TILE_LABEL : `Tile ${this.selectedTile}`;

    this.statusText?.setText([
      `Arquivo: ${this.currentFileName ?? 'nenhum'}`,
      `Level: ${this.level.meta.name}`,
      `Alteracoes pendentes: ${this.dirty ? 'sim' : 'nao'}`,
      `Modo ativo: ${this.selectedMode === 'tile' ? 'tile' : this.selectedMode === 'item' ? 'item' : 'objeto'}`,
      `Tile ativo: ${tileLabel}`,
      `Item ativo: ${this.selectedItemType ?? 'limpar'}`,
      `Objeto ativo: ${this.selectedObjectType ?? 'limpar'}`,
      `Camada ativa: ${this.selectedLayer === 'ground' ? 'chao' : 'superior'}`,
      `Colisao ao pintar: ${this.collisionEnabled ? 'ligada' : 'desligada'}`,
      hoverText,
      'Atalhos: T tile | I item | O objeto | J item | K objeto | G/U camada | C colisao | S salvar | E copiar',
    ]);
  }

  private refreshLayerButtons(): void {
    this.updateButtonState(this.layerGroundButton, this.layerGroundLabel, this.selectedLayer === 'ground');
    this.updateButtonState(this.layerUpperButton, this.layerUpperLabel, this.selectedLayer === 'upper');
    this.updateButtonState(this.collisionButton, this.collisionLabel, this.collisionEnabled, this.collisionEnabled ? 'Com colisao' : 'Sem colisao');
  }

  private updateButtonState(button: Phaser.GameObjects.Rectangle | undefined, label: Phaser.GameObjects.Text | undefined, active: boolean, text?: string): void {
    if (!button || !label) {
      return;
    }

    button.setFillStyle(active ? 0xf4a261 : 0xa8dadc, 1);
    label.setColor(active ? '#102027' : '#081014');
    if (text) {
      label.setText(text);
    }
  }

  private refreshModeButtons(): void {
    this.updateButtonState(this.modeTileButton, this.modeTileLabel, this.selectedMode === 'tile');
    this.updateButtonState(this.modeItemButton, this.modeItemLabel, this.selectedMode === 'item');
    this.updateButtonState(this.modeObjectButton, this.modeObjectLabel, this.selectedMode === 'object');
  }

  private refreshEntityButtons(): void {
    this.updateButtonState(this.itemSelectButton, this.itemSelectLabel, this.selectedMode === 'item', `Item: ${this.selectedItemType ?? 'limpar'}`);
    this.updateButtonState(this.objectSelectButton, this.objectSelectLabel, this.selectedMode === 'object', `Objeto: ${this.selectedObjectType ?? 'limpar'}`);
  }

  private refreshLevelButtons(): void {
    this.levelButtons.forEach((button) => {
      button.background.destroy();
      button.label.destroy();
    });
    this.levelButtons.length = 0;

    this.availableLevels.slice(0, EDITOR_LEVEL_LIST_MAX).forEach((entry, index) => {
      const x = BOARD_PANEL_PADDING;
      const y = EditorScene.levelSectionY + 24 + (index * (EDITOR_LEVEL_BUTTON_HEIGHT + 6));
      const active = entry.fileName === this.currentFileName;
      const background = this.add.rectangle(x, y, EDITOR_PANEL_WIDTH - (BOARD_PANEL_PADDING * 2), EDITOR_LEVEL_BUTTON_HEIGHT, active ? 0xf4a261 : 0x17323b, 1)
        .setOrigin(0)
        .setDepth(SCENE_DEPTHS.uiOverlay)
        .setStrokeStyle(1, 0x40646d, 1)
        .setInteractive({ useHandCursor: true })
        .on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, () => { void this.loadLevel(entry.fileName); });
      const label = this.add.text(x + 8, y + 5, `${entry.fileName} | ${entry.levelName}`, {
        color: active ? '#081014' : '#f1faee',
        fontFamily: FONT_FAMILY,
        fontSize: '11px',
        wordWrap: { width: EDITOR_PANEL_WIDTH - (BOARD_PANEL_PADDING * 2) - 16 },
      }).setDepth(SCENE_DEPTHS.uiLabel);

      this.levelButtons.push({ fileName: entry.fileName, background, label });
    });
  }

  private paintCell(column: number, row: number): void {
    if (this.selectedMode === 'item') {
      this.level.items = this.level.items.filter((item) => !(item.column === column && item.row === row));
      if (this.selectedItemType) {
        this.level.items.push({ type: this.selectedItemType, column, row });
      }

      this.dirty = true;
      this.refreshBoard();
      this.refreshStatus();
      return;
    }

    if (this.selectedMode === 'object') {
      this.level.objects = this.level.objects.filter((object) => !(object.column === column && object.row === row));
      if (this.selectedObjectType) {
        this.level.objects.push({ type: this.selectedObjectType, column, row });
      }

      this.dirty = true;
      this.refreshBoard();
      this.refreshStatus();
      return;
    }

    if (this.selectedLayer === 'ground') {
      if (this.selectedTile !== null) {
        this.level.layers.ground[row][column] = this.selectedTile;
      }
      this.level.collisions.ground[row][column] = this.collisionEnabled;
    } else {
      this.level.layers.upper[row][column] = this.selectedTile;
      this.level.collisions.upper[row][column] = this.collisionEnabled;
    }

    this.dirty = true;
    this.refreshBoard();
    this.refreshStatus();
  }

  private cycleItemSelection(): void {
    const itemTypes: Array<LevelItemType | null> = ['key', 'sword', null];
    const currentIndex = itemTypes.findIndex((itemType) => itemType === this.selectedItemType);
    this.selectedItemType = itemTypes[(currentIndex + 1) % itemTypes.length];
    this.refreshEntityButtons();
    this.refreshStatus();
  }

  private cycleObjectSelection(): void {
    const objectTypes: Array<LevelObjectType | null> = ['lookedDoor', null];
    const currentIndex = objectTypes.findIndex((objectType) => objectType === this.selectedObjectType);
    this.selectedObjectType = objectTypes[(currentIndex + 1) % objectTypes.length];
    this.refreshEntityButtons();
    this.refreshStatus();
  }

  private resolveBoardCell(worldX: number, worldY: number): { column: number; row: number } | null {
    return resolveBoardCell(worldX, worldY, this.boardMetrics);
  }

  private async refreshLevelList(autoLoadFirst = false): Promise<void> {
    try {
      this.availableLevels = await listLevels();
      this.refreshLevelButtons();

      if (!autoLoadFirst) {
        return;
      }

      if (this.availableLevels[0]) {
        await this.loadLevel(this.availableLevels[0].fileName);
      } else {
        this.currentFileName = EDITOR_NEW_LEVEL_FILE_NAME;
        this.level = cloneLevelExport(createEmptyLevelState());
        this.dirty = true;
        this.refreshStatus();
      }
    } catch (error) {
      this.showToast(error instanceof Error ? error.message : 'Falha ao listar levels');
    }
  }

  private async loadLevel(fileName: string): Promise<void> {
    try {
      this.level = cloneLoadedLevel(await loadLevelByFileName(fileName));
      this.currentFileName = fileName;
      this.dirty = false;
      this.refreshBoard();
      this.refreshStatus();
      this.refreshLevelButtons();
      this.showToast(`Level carregado: ${fileName}`);
    } catch (error) {
      this.showToast(error instanceof Error ? error.message : 'Falha ao carregar level');
    }
  }

  private async handleSave(): Promise<void> {
    const fileName = this.currentFileName ?? EDITOR_NEW_LEVEL_FILE_NAME;
    this.currentFileName = fileName;

    try {
      this.level = cloneLoadedLevel(await saveLevelByFileName(fileName, this.level));
      this.dirty = false;
      await this.refreshLevelList(false);
      this.refreshStatus();
      this.refreshLevelButtons();
      this.showToast(`Arquivo salvo: ${fileName}`);
    } catch (error) {
      this.showToast(error instanceof Error ? error.message : 'Falha ao salvar level');
    }
  }

  private async handleExport(): Promise<void> {
    const payload = buildLevelExportJson(this.level);

    try {
      await window.navigator.clipboard.writeText(payload);
      this.showToast('JSON copiado para a area de transferencia');
    } catch {
      this.showToast('Falha ao copiar. O JSON esta em window.last_exported_level_json');
    }

    window.last_exported_level_json = payload;
  }

  private showToast(message: string): void {
    const toast = createToast(this, this.boardMetrics.offsetX, this.boardMetrics.offsetY - 12, message);

    this.tweens.add({
      targets: toast,
      alpha: 0,
      delay: TIMINGS.toastFadeDelayMs,
      duration: TIMINGS.toastFadeDurationMs,
      onComplete: () => toast.destroy(),
    });
  }

  private renderSnapshot(): string {
    return JSON.stringify({
      mode: 'editor',
      editorMode: this.selectedMode,
      selectedTile: this.selectedTile,
      selectedItemType: this.selectedItemType,
      selectedObjectType: this.selectedObjectType,
      selectedLayer: this.selectedLayer,
      collisionEnabled: this.collisionEnabled,
      hoveredCell: this.hoveredCell,
      currentFileName: this.currentFileName,
      availableLevels: this.availableLevels.map((entry) => entry.fileName),
      dirty: this.dirty,
      level: this.level,
    } satisfies EditorSnapshot);
  }
}
