import type Phaser from 'phaser';

import {
  ASSET_KEYS,
  HUD_BACKGROUND_COLOR,
  HUD_HEALTH_MAX,
  HUD_HEARTS_SCALE,
  HUD_ITEM_SCALE,
  HUD_INNER_PADDING_SCALE,
  HUD_SLOT_SCALE,
  SCENE_DEPTHS,
} from '@/game/constants';
import type { LevelExport } from '@/game/levelEditor';
import type { BoardMetrics } from '@/game/shared/grid';
import { toCellKey } from '@/game/shared/grid';

const LOW_GRASS_TILE = 0;
const FULL_HEART_FRAME = 4;

export class GameBoardRenderer {
  private readonly grassSprites = new Map<string, Phaser.GameObjects.Sprite>();
  private readonly groundLayer: Phaser.GameObjects.Layer;
  private readonly decorBelowPlayerLayer: Phaser.GameObjects.Layer;
  private readonly upperLayer: Phaser.GameObjects.Layer;
  private readonly gridGraphics: Phaser.GameObjects.Graphics;
  private readonly hudBar: Phaser.GameObjects.Rectangle;
  private readonly heartsSprites: Phaser.GameObjects.Sprite[];
  private readonly itemSlotSprite: Phaser.GameObjects.Image;
  private readonly itemSlotContentSprite: Phaser.GameObjects.Image;
  private hudItemAnchor = { x: 0, y: 0, size: 0 };

  public constructor(
    private readonly scene: Phaser.Scene,
    private readonly level: LevelExport,
  ) {
    this.groundLayer = scene.add.layer().setDepth(SCENE_DEPTHS.ground);
    this.decorBelowPlayerLayer = scene.add.layer().setDepth(SCENE_DEPTHS.decorBelowPlayer);
    this.gridGraphics = scene.add.graphics().setDepth(SCENE_DEPTHS.grid);
    this.upperLayer = scene.add.layer().setDepth(SCENE_DEPTHS.upper);
    this.hudBar = scene.add.rectangle(0, 0, 1, 1, HUD_BACKGROUND_COLOR, 1)
      .setOrigin(0)
      .setDepth(SCENE_DEPTHS.ui);
    this.heartsSprites = Array.from({ length: HUD_HEALTH_MAX }, () => scene.add
      .sprite(0, 0, ASSET_KEYS.hudHearts, FULL_HEART_FRAME)
      .setOrigin(0, 0.5)
      .setDepth(SCENE_DEPTHS.uiLabel));
    this.itemSlotSprite = scene.add.image(0, 0, ASSET_KEYS.hudSlot)
      .setOrigin(1, 0.5)
      .setDepth(SCENE_DEPTHS.uiLabel);
    this.itemSlotContentSprite = scene.add.image(0, 0, ASSET_KEYS.keyItemIcon)
      .setOrigin(0.5)
      .setVisible(false)
      .setDepth(SCENE_DEPTHS.uiLabel);
  }

  public render(metrics: BoardMetrics): void {
    this.renderHud(metrics);
    this.drawMap(metrics);
    this.drawGrid(metrics);
  }

  public getGrassSprite(column: number, row: number): Phaser.GameObjects.Sprite | undefined {
    return this.grassSprites.get(toCellKey(column, row));
  }

  public setHudItemTexture(textureKey: string | null): void {
    if (!textureKey) {
      this.itemSlotContentSprite.setVisible(false);
      return;
    }

    this.itemSlotContentSprite
      .setTexture(textureKey)
      .setVisible(true);
  }

  public getHudItemAnchor(): { x: number; y: number; size: number } {
    return { ...this.hudItemAnchor };
  }

  private drawGrid(metrics: BoardMetrics): void {
    this.gridGraphics.clear();
    this.gridGraphics.lineStyle(1, 0x264653, 0.35);

    for (let column = 0; column <= metrics.columns; column += 1) {
      const x = metrics.offsetX + (column * metrics.tileSize);
      this.gridGraphics.lineBetween(x, metrics.offsetY, x, metrics.offsetY + metrics.height);
    }

    for (let row = 0; row <= metrics.rows; row += 1) {
      const y = metrics.offsetY + (row * metrics.tileSize);
      this.gridGraphics.lineBetween(metrics.offsetX, y, metrics.offsetX + metrics.width, y);
    }
  }

  private drawMap(metrics: BoardMetrics): void {
    this.groundLayer.removeAll(true);
    this.decorBelowPlayerLayer.removeAll(true);
    this.upperLayer.removeAll(true);
    this.grassSprites.clear();

    for (let row = 0; row < metrics.rows; row += 1) {
      for (let column = 0; column < metrics.columns; column += 1) {
        const x = metrics.offsetX + (column * metrics.tileSize);
        const y = metrics.offsetY + (row * metrics.tileSize);
        const groundTile = this.level.layers.ground[row]?.[column] ?? this.level.layers.ground[0]?.[0] ?? 0;
        const upperTile = this.level.layers.upper[row]?.[column] ?? null;

        this.groundLayer.add(this.scene.add.sprite(x, y, ASSET_KEYS.forestTileset, groundTile)
          .setOrigin(0)
          .setDisplaySize(metrics.tileSize, metrics.tileSize));

        if (upperTile === null) {
          continue;
        }

        const upperSprite = this.scene.add.sprite(x, y, ASSET_KEYS.forestTileset, upperTile)
          .setOrigin(0)
          .setDisplaySize(metrics.tileSize, metrics.tileSize);

        if (!this.level.collisions.upper[row]?.[column]) {
          this.decorBelowPlayerLayer.add(upperSprite);

          if (upperTile === LOW_GRASS_TILE) {
            this.grassSprites.set(toCellKey(column, row), upperSprite);
          }

          continue;
        }

        this.upperLayer.add(upperSprite);
      }
    }
  }

  private renderHud(metrics: BoardMetrics): void {
    const hudHeight = metrics.tileSize;
    const hudY = metrics.offsetY - hudHeight;
    const hudPadding = Math.floor(metrics.tileSize * HUD_INNER_PADDING_SCALE);
    const heartsHeight = Math.max(8, Math.floor(metrics.tileSize * HUD_HEARTS_SCALE));
    const heartWidth = heartsHeight;
    const slotSize = Math.max(12, Math.floor(metrics.tileSize * HUD_SLOT_SCALE));
    const itemSize = Math.max(10, Math.floor(metrics.tileSize * HUD_ITEM_SCALE));
    const slotX = metrics.offsetX + metrics.width - hudPadding;
    const slotY = hudY + (hudHeight / 2);

    this.hudBar
      .setPosition(metrics.offsetX, hudY)
      .setSize(metrics.width, hudHeight);

    this.heartsSprites.forEach((heartSprite, index) => {
      heartSprite
        .setPosition(metrics.offsetX + hudPadding + (index * heartWidth), hudY + (hudHeight / 2))
        .setDisplaySize(heartWidth, heartsHeight);
    });

    this.itemSlotSprite
      .setPosition(slotX, slotY)
      .setDisplaySize(slotSize, slotSize);

    this.itemSlotContentSprite
      .setPosition(slotX - (slotSize / 2), slotY)
      .setDisplaySize(itemSize, itemSize);

    this.hudItemAnchor = {
      x: slotX - (slotSize / 2),
      y: slotY,
      size: itemSize,
    };
  }
}
