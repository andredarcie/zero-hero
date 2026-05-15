import type Phaser from 'phaser';

import {
  ASSET_KEYS,
  FONT_FAMILY,
  HUD_BACKGROUND_COLOR,
  HUD_HEALTH_MAX,
  HUD_HEARTS_SCALE,
  HUD_ITEM_SCALE,
  HUD_INNER_PADDING_SCALE,
  HUD_SLOT_SCALE,
  SCENE_DEPTHS,
} from '@/game/constants';
import type { BoardMetrics } from '@/game/shared/grid';
import type { ChunkManager } from '@/game/world/ChunkManager';
import type { WorldCamera } from './WorldCamera';

const LOW_GRASS_TILE = 0;
const FULL_HEART_FRAME = 4;
const EMPTY_HEART_FRAME = 0;

type TileEntry = {
  ground: Phaser.GameObjects.Sprite;
  upper: Phaser.GameObjects.Sprite | null;
};

export class GameBoardRenderer {
  private readonly tileSprites = new Map<string, TileEntry>();
  private readonly grassSprites = new Map<string, Phaser.GameObjects.Sprite>();
  private readonly hudBar: Phaser.GameObjects.Rectangle;
  private readonly heartsSprites: Phaser.GameObjects.Sprite[];
  private readonly itemSlotSprite: Phaser.GameObjects.Image;
  private readonly itemSlotContentSprite: Phaser.GameObjects.Image;
  private readonly coinIcon: Phaser.GameObjects.Image;
  private readonly coinLabel: Phaser.GameObjects.Text;
  private hudItemAnchor = { x: 0, y: 0, size: 0 };
  private hudCoinAnchor = { x: 0, y: 0 };
  private lastHudMetrics?: BoardMetrics;

  public constructor(private readonly scene: Phaser.Scene) {
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

    this.coinIcon = scene.add.image(0, 0, ASSET_KEYS.coin)
      .setOrigin(0.5)
      .setDepth(SCENE_DEPTHS.uiLabel);

    this.coinLabel = scene.add.text(0, 0, '0', {
      fontFamily: FONT_FAMILY,
      fontSize: '8px',
      color: '#ffd700',
      stroke: '#000000',
      strokeThickness: 2,
      resolution: window.devicePixelRatio,
    })
      .setOrigin(0, 0.5)
      .setDepth(SCENE_DEPTHS.uiLabel);
  }

  public render(metrics: BoardMetrics): void {
    this.lastHudMetrics = metrics;
    this.renderHud(metrics);
  }

  public setMaxHearts(newMax: number): void {
    while (this.heartsSprites.length < newMax) {
      this.heartsSprites.push(
        this.scene.add
          .sprite(0, 0, ASSET_KEYS.hudHearts, EMPTY_HEART_FRAME)
          .setOrigin(0, 0.5)
          .setDepth(SCENE_DEPTHS.uiLabel),
      );
    }
    if (this.lastHudMetrics) this.renderHud(this.lastHudMetrics);
  }

  public updateWorld(camera: WorldCamera, chunkManager: ChunkManager, tileSize: number): void {
    const range = camera.getVisibleRange(tileSize);
    const nextKeys = new Set<string>();

    for (let ty = range.minY; ty <= range.maxY; ty++) {
      for (let tx = range.minX; tx <= range.maxX; tx++) {
        const key = `${tx},${ty}`;
        nextKeys.add(key);

        const screen = camera.tileToScreen(tx, ty, tileSize);

        let entry = this.tileSprites.get(key);
        if (!entry) {
          entry = this.createTileEntry(tx, ty, tileSize, chunkManager);
          this.tileSprites.set(key, entry);
        }

        entry.ground
          .setPosition(screen.x, screen.y)
          .setDisplaySize(tileSize, tileSize);

        if (entry.upper) {
          entry.upper
            .setPosition(screen.x, screen.y)
            .setDisplaySize(tileSize, tileSize);
        }
      }
    }

    for (const [key, entry] of this.tileSprites) {
      if (!nextKeys.has(key)) {
        entry.ground.destroy();
        if (entry.upper) {
          entry.upper.destroy();
          this.grassSprites.delete(key);
        }
        this.tileSprites.delete(key);
      }
    }
  }

  public getGrassSprite(worldX: number, worldY: number): Phaser.GameObjects.Sprite | undefined {
    return this.grassSprites.get(`${worldX},${worldY}`);
  }

  public getHudCoinAnchor(): { x: number; y: number } {
    return { ...this.hudCoinAnchor };
  }

  public setCoinCount(count: number, scene: Phaser.Scene): void {
    this.coinLabel.setText(String(count));
    scene.tweens.killTweensOf(this.coinLabel);
    this.coinLabel.setScale(1);
    scene.tweens.add({
      targets: this.coinLabel,
      scaleX: 1.6,
      scaleY: 1.6,
      duration: 80,
      yoyo: true,
      ease: 'Power2.easeOut',
    });
  }

  public setHealth(current: number): void {
    this.heartsSprites.forEach((sprite, i) => {
      sprite.setFrame(i < current ? FULL_HEART_FRAME : EMPTY_HEART_FRAME);
    });
  }

  public setHudItemTexture(textureKey: string | null): void {
    if (!textureKey) {
      this.itemSlotContentSprite.setVisible(false);
      return;
    }
    this.itemSlotContentSprite.setTexture(textureKey).setVisible(true);
  }

  public getHudItemAnchor(): { x: number; y: number; size: number } {
    return { ...this.hudItemAnchor };
  }

  private createTileEntry(
    worldX: number,
    worldY: number,
    tileSize: number,
    chunkManager: ChunkManager,
  ): TileEntry {
    const tile = chunkManager.getTile(worldX, worldY);

    const ground = this.scene.add
      .sprite(0, 0, ASSET_KEYS.forestTileset, tile.ground)
      .setOrigin(0.5)
      .setDisplaySize(tileSize, tileSize)
      .setDepth(SCENE_DEPTHS.ground);

    let upper: Phaser.GameObjects.Sprite | null = null;
    if (tile.upper !== null) {
      const depth = tile.collision ? SCENE_DEPTHS.upper : SCENE_DEPTHS.decorBelowPlayer;
      upper = this.scene.add
        .sprite(0, 0, ASSET_KEYS.forestTileset, tile.upper)
        .setOrigin(0.5)
        .setDisplaySize(tileSize, tileSize)
        .setDepth(depth);

      if (tile.upper === LOW_GRASS_TILE) {
        this.grassSprites.set(`${worldX},${worldY}`, upper);
      }
    }

    return { ground, upper };
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

    const coinSize = Math.max(8, Math.floor(metrics.tileSize * HUD_HEARTS_SCALE));
    const coinX = metrics.offsetX + hudPadding + (HUD_HEALTH_MAX * coinSize) + hudPadding;
    const coinY = hudY + (hudHeight / 2);

    this.coinIcon
      .setPosition(coinX, coinY)
      .setDisplaySize(coinSize, coinSize);

    this.coinLabel
      .setPosition(coinX + Math.floor(coinSize * 0.7), coinY)
      .setFontSize(`${Math.max(8, Math.floor(metrics.tileSize * 0.45))}px`);

    this.hudCoinAnchor = { x: coinX, y: coinY };
  }
}
