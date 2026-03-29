import Phaser from 'phaser';
import level01Data from '../../../levels/level_01.json';

import { ANIMATION_KEYS, ASSET_KEYS, GAMEPLAY_HERO_MAX_SIZE, GAMEPLAY_HERO_SCALE, HERO_FRAMES, HUD_RESERVED_ROWS, MIN_BOARD_TILE_SIZE, SCENE_DEPTHS, TIMINGS } from '@/game/constants';
import { registerSceneDebugHooks } from '@/game/debug/debugHooks';
import { isBlockedLevelCell, listBlockedCells, normalizeLevel, resolveSpawnCell } from '@/game/maps/levelRuntime';
import { type LevelExport, type LevelItemExport } from '@/game/levelEditor';
import { ItemBase } from '@/game/items/ItemBase';
import { KeyItem } from '@/game/items/KeyItem';
import { GameBoardRenderer } from '@/game/runtime/GameBoardRenderer';
import { PlayerMovementController } from '@/game/runtime/PlayerMovementController';
import { animateGrassRustle } from '@/game/runtime/RuntimeEffects';
import { createBoardMetrics, type BoardMetrics, type GridCell } from '@/game/shared/grid';

type GameSnapshot = {
  mode: 'playing';
  camera: { width: number; height: number };
  grid: {
    columns: number;
    rows: number;
    tileSize: number;
    offsetX: number;
    offsetY: number;
    characterSize: number;
  };
  map: {
    groundLayer: number[][];
    upperLayer: Array<Array<number | null>>;
    blockedCells: Array<{ column: number; row: number }>;
    items: Array<{ type: string; column: number; row: number; collected: boolean }>;
    levelName: string;
  };
  player: {
    x: number;
    y: number;
    column: number;
    row: number;
    frame: number;
    moving: boolean;
    width: number;
    height: number;
    item: string | null;
  };
  note: string;
};

export class GameScene extends Phaser.Scene {
  public static readonly key = 'game';

  private readonly level: LevelExport = normalizeLevel(level01Data as LevelExport);
  private readonly spawnCell: GridCell = resolveSpawnCell(this.level);
  private boardMetrics: BoardMetrics = {
    columns: this.level.meta.columns,
    rows: this.level.meta.rows,
    tileSize: MIN_BOARD_TILE_SIZE,
    offsetX: 0,
    offsetY: 0,
    width: this.level.meta.columns * MIN_BOARD_TILE_SIZE,
    height: this.level.meta.rows * MIN_BOARD_TILE_SIZE,
    characterSize: MIN_BOARD_TILE_SIZE,
  };
  private boardRenderer?: GameBoardRenderer;
  private player?: Phaser.GameObjects.Sprite;
  private movementController?: PlayerMovementController;
  private playerCell: GridCell = this.spawnCell;
  private readonly items: ItemBase[] = [];
  private collectedItem: ItemBase | null = null;

  public constructor() {
    super(GameScene.key);
  }

  public create(): void {
    this.cameras.main.setBackgroundColor('#1d3557');
    this.boardRenderer = new GameBoardRenderer(this, this.level);
    this.items.push(...this.level.items.map((item) => this.createItem(item)).filter((item): item is ItemBase => item !== null));
    this.player = this.add.sprite(0, 0, ASSET_KEYS.hero, HERO_FRAMES.idleDown)
      .setDisplaySize(this.boardMetrics.characterSize, this.boardMetrics.characterSize)
      .setOrigin(0.5)
      .setDepth(SCENE_DEPTHS.player);

    this.createAnimations();
    this.movementController = new PlayerMovementController(
      this,
      this.player,
      (column, row) => isBlockedLevelCell(this.level, column, row),
      (column, row) => animateGrassRustle(this, this.boardRenderer?.getGrassSprite(column, row), this.boardMetrics),
    );

    this.scale.on(Phaser.Scale.Events.RESIZE, this.handleResize, this);
    this.handleResize({ width: this.scale.width, height: this.scale.height });
    registerSceneDebugHooks(this, () => this.renderSnapshot());
  }

  public shutdown(): void {
    this.scale.off(Phaser.Scale.Events.RESIZE, this.handleResize, this);
    this.items.forEach((item) => item.destroy());
  }

  public update(): void {
    if (!this.movementController) {
      return;
    }

    this.playerCell = this.movementController.update(this.playerCell, this.boardMetrics);
    this.tryCollectItemAtPlayerPosition();
  }

  private handleResize(gameSize: Phaser.Structs.Size | { width: number; height: number }): void {
    const { width, height } = gameSize;
    this.cameras.main.setViewport(0, 0, width, height);
    this.boardMetrics = createBoardMetrics(width, height, {
      columns: this.level.meta.columns,
      rows: this.level.meta.rows,
      minTileSize: MIN_BOARD_TILE_SIZE,
      characterScale: GAMEPLAY_HERO_SCALE,
      maxCharacterSize: GAMEPLAY_HERO_MAX_SIZE,
      reservedTopRows: HUD_RESERVED_ROWS,
    });

    this.boardRenderer?.render(this.boardMetrics);
    this.items.forEach((item) => item.render(this.boardMetrics));
    this.boardRenderer?.setHudItemTexture(this.collectedItem?.hudTexture ?? null);
    this.player?.setDisplaySize(this.boardMetrics.characterSize, this.boardMetrics.characterSize);
    if (this.movementController) {
      this.playerCell = this.movementController.syncPlayerToGrid(this.playerCell, this.boardMetrics);
    }
  }

  private createItem(item: LevelItemExport): ItemBase | null {
    switch (item.type) {
      case 'key':
        return new KeyItem(this, { column: item.column, row: item.row });
      default:
        return null;
    }
  }

  private tryCollectItemAtPlayerPosition(): void {
    if (this.collectedItem) {
      return;
    }

    const item = this.items.find((entry) => (
      !entry.isCollected
      && entry.position.column === this.playerCell.column
      && entry.position.row === this.playerCell.row
    ));

    if (!item) {
      return;
    }

    item.collect();
    this.collectedItem = item;
    this.boardRenderer?.setHudItemTexture(item.hudTexture);
  }

  private createAnimations(): void {
    if (this.anims.exists(ANIMATION_KEYS.heroWalk)) {
      return;
    }

    this.anims.create({
      key: ANIMATION_KEYS.heroWalk,
      frames: this.anims.generateFrameNumbers(ASSET_KEYS.hero, {
        start: HERO_FRAMES.walkStart,
        end: HERO_FRAMES.walkEnd,
      }),
      frameRate: TIMINGS.walkFrameRate,
      repeat: -1,
    });
  }

  private renderSnapshot(): string {
    const snapshot: GameSnapshot = {
      mode: 'playing',
      camera: {
        width: this.scale.width,
        height: this.scale.height,
      },
      grid: {
        columns: this.boardMetrics.columns,
        rows: this.boardMetrics.rows,
        tileSize: this.boardMetrics.tileSize,
        offsetX: this.boardMetrics.offsetX,
        offsetY: this.boardMetrics.offsetY,
        characterSize: this.boardMetrics.characterSize,
      },
      map: {
        groundLayer: this.level.layers.ground,
        upperLayer: this.level.layers.upper,
        blockedCells: listBlockedCells(this.level),
        items: this.items.map((item) => ({
          type: item.constructor.name,
          column: item.position.column,
          row: item.position.row,
          collected: item.isCollected,
        })),
        levelName: this.level.meta.name,
      },
      player: {
        x: Number(this.player?.x.toFixed(2) ?? 0),
        y: Number(this.player?.y.toFixed(2) ?? 0),
        column: this.playerCell.column,
        row: this.playerCell.row,
        frame: Number(this.player?.frame.name ?? HERO_FRAMES.idleDown),
        moving: this.movementController?.moving ?? false,
        width: this.boardMetrics.characterSize,
        height: this.boardMetrics.characterSize,
        item: this.collectedItem?.constructor.name ?? null,
      },
      note: 'Origin at top-left. Player moves one cell at a time inside the grid.',
    };

    return JSON.stringify(snapshot);
  }
}
