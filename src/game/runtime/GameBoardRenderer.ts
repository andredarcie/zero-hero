import Phaser from 'phaser';

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
const HEARTS_PER_ROW = 8;

type TileEntry = {
  ground: Phaser.GameObjects.Sprite;
  upper: Phaser.GameObjects.Sprite | null;
};

export class GameBoardRenderer {
  private readonly tileSprites = new Map<string, TileEntry>();
  private readonly grassSprites = new Map<string, Phaser.GameObjects.Sprite>();
  private readonly hudBar: Phaser.GameObjects.Rectangle;
  private readonly hudGraphics: Phaser.GameObjects.Graphics;
  private readonly heartsSprites: Phaser.GameObjects.Sprite[];
  private readonly itemSlotSprite: Phaser.GameObjects.Image;
  private readonly swordSlotSprite: Phaser.GameObjects.Image;
  private readonly itemSlotContentSprite: Phaser.GameObjects.Image;
  private readonly swordSlotContentSprite: Phaser.GameObjects.Image;
  private readonly coinIcon: Phaser.GameObjects.Image;
  private readonly keyIcon: Phaser.GameObjects.Image;
  private readonly lifeLabel: Phaser.GameObjects.Text;
  private readonly rupeeLabel: Phaser.GameObjects.Text;
  private readonly keyLabel: Phaser.GameObjects.Text;
  private readonly bombLabel: Phaser.GameObjects.Text;
  private readonly bLabel: Phaser.GameObjects.Text;
  private readonly aLabel: Phaser.GameObjects.Text;
  private readonly mapLabel: Phaser.GameObjects.Text;
  private readonly coinLabel: Phaser.GameObjects.Text;
  private hudItemAnchor = { x: 0, y: 0, size: 0 };
  private hudCoinAnchor = { x: 0, y: 0 };
  private hudMapBounds = { x: 0, y: 0, width: 0, height: 0 };
  private lastHudMetrics?: BoardMetrics;

  public constructor(private readonly scene: Phaser.Scene) {
    this.hudBar = scene.add.rectangle(0, 0, 1, 1, HUD_BACKGROUND_COLOR, 1)
      .setOrigin(0)
      .setDepth(SCENE_DEPTHS.ui);
    this.hudGraphics = scene.add.graphics().setDepth(SCENE_DEPTHS.uiOverlay);
    this.heartsSprites = Array.from({ length: HUD_HEALTH_MAX }, () => scene.add
      .sprite(0, 0, ASSET_KEYS.hudHearts, FULL_HEART_FRAME)
      .setOrigin(0, 0.5)
      .setDepth(SCENE_DEPTHS.uiLabel));
    this.itemSlotSprite = scene.add.image(0, 0, ASSET_KEYS.hudSlot)
      .setOrigin(0.5)
      .setDepth(SCENE_DEPTHS.uiLabel);
    this.swordSlotSprite = scene.add.image(0, 0, ASSET_KEYS.hudSlot)
      .setOrigin(0.5)
      .setDepth(SCENE_DEPTHS.uiLabel);
    this.itemSlotContentSprite = scene.add.image(0, 0, ASSET_KEYS.keyItemIcon)
      .setOrigin(0.5)
      .setVisible(false)
      .setDepth(SCENE_DEPTHS.uiLabel);
    this.swordSlotContentSprite = scene.add.image(0, 0, ASSET_KEYS.swordItemIcon)
      .setOrigin(0.5)
      .setVisible(false)
      .setDepth(SCENE_DEPTHS.uiLabel);

    this.coinIcon = scene.add.image(0, 0, ASSET_KEYS.coin)
      .setOrigin(0.5)
      .setDepth(SCENE_DEPTHS.uiLabel);
    this.keyIcon = scene.add.image(0, 0, ASSET_KEYS.keyItemIcon)
      .setOrigin(0.5)
      .setDepth(SCENE_DEPTHS.uiLabel);

    const makeHudText = (text: string, color = '#f8f8f8'): Phaser.GameObjects.Text => scene.add.text(0, 0, text, {
      fontFamily: FONT_FAMILY,
      fontSize: '8px',
      color,
      resolution: window.devicePixelRatio,
    }).setDepth(SCENE_DEPTHS.uiLabel);

    this.lifeLabel = makeHudText('-LIFE-', '#f8f8f8');
    this.rupeeLabel = makeHudText('x000', '#f8f8f8');
    this.keyLabel = makeHudText('x00', '#f8f8f8');
    this.bombLabel = makeHudText('x00', '#f8f8f8');
    this.bLabel = makeHudText('B', '#f8f8f8');
    this.aLabel = makeHudText('A', '#f8f8f8');
    this.mapLabel = makeHudText('MAP', '#f8f8f8');

    this.coinLabel = makeHudText('000', '#f8f8f8').setOrigin(0, 0.5);
    this.rupeeLabel.setOrigin(0, 0.5);
    this.keyLabel.setOrigin(0, 0.5);
    this.bombLabel.setOrigin(0, 0.5);
    this.lifeLabel.setOrigin(0, 0.5);
    this.bLabel.setOrigin(0.5);
    this.aLabel.setOrigin(0.5);
    this.mapLabel.setOrigin(0.5, 0);
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
    const left = camera.screenCenterX - (camera.viewportColumns * tileSize) / 2;
    const top = camera.screenCenterY - (camera.viewportRows * tileSize) / 2;
    const baseX = Math.round(left + ((range.minX - camera.screenOriginX) + 0.5) * tileSize);
    const baseY = Math.round(top + ((range.minY - camera.screenOriginY) + 0.5) * tileSize);

    for (let ty = range.minY; ty <= range.maxY; ty++) {
      const screenY = baseY + ((ty - range.minY) * tileSize);
      for (let tx = range.minX; tx <= range.maxX; tx++) {
        const key = `${tx},${ty}`;
        nextKeys.add(key);
        const screenX = baseX + ((tx - range.minX) * tileSize);

        let entry = this.tileSprites.get(key);
        if (!entry) {
          entry = this.createTileEntry(tx, ty, tileSize, chunkManager);
          this.tileSprites.set(key, entry);
        }

        entry.ground
          .setPosition(screenX, screenY)
          .setDisplaySize(tileSize, tileSize);

        if (entry.upper) {
          entry.upper
            .setPosition(screenX, screenY)
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

  public getHudMapBounds(): { x: number; y: number; width: number; height: number } {
    return { ...this.hudMapBounds };
  }

  public setCoinCount(count: number, scene: Phaser.Scene): void {
    const formatted = String(count).padStart(3, '0');
    this.rupeeLabel.setText(`x${formatted}`);
    this.coinLabel.setText(formatted);
    scene.tweens.killTweensOf(this.rupeeLabel);
    this.rupeeLabel.setScale(1);
    scene.tweens.add({
      targets: this.rupeeLabel,
      scaleX: 1.15,
      scaleY: 1.15,
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
      this.swordSlotContentSprite.setVisible(false);
      return;
    }
    this.swordSlotContentSprite.setTexture(textureKey).setVisible(true);
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
    const hudHeight = metrics.offsetY;
    const hudY = metrics.offsetY - hudHeight;
    const hudPadding = Math.max(6, Math.floor(metrics.tileSize * HUD_INNER_PADDING_SCALE));
    const unit = Math.max(8, Math.floor(metrics.tileSize * 0.44));
    const heartsHeight = Math.max(8, Math.floor(metrics.tileSize * HUD_HEARTS_SCALE));
    const heartWidth = heartsHeight;
    const slotSize = Math.max(16, Math.floor(metrics.tileSize * HUD_SLOT_SCALE));
    const itemSize = Math.max(10, Math.floor(metrics.tileSize * HUD_ITEM_SCALE));
    const mapPanelWidth = Math.max(82, Math.floor(metrics.width * 0.25));
    const mapPanelHeight = Math.max(50, hudHeight - (hudPadding * 2));
    const mapX = metrics.offsetX + hudPadding;
    const mapY = hudY + hudPadding;
    const countersX = mapX + mapPanelWidth + Math.max(12, Math.floor(metrics.tileSize * 0.82));
    const firstCounterY = hudY + Math.floor(hudHeight * 0.26);
    const secondCounterY = hudY + Math.floor(hudHeight * 0.49);
    const thirdCounterY = hudY + Math.floor(hudHeight * 0.72);
    const itemCenterX = metrics.offsetX + Math.floor(metrics.width * 0.58);
    const itemRowY = hudY + Math.floor(hudHeight * 0.58);
    const bSlotX = itemCenterX - Math.floor(slotSize * 0.85);
    const aSlotX = itemCenterX + Math.floor(slotSize * 0.85);
    const slotLabelY = itemRowY - Math.floor(slotSize * 0.95);
    const lifeLabelX = metrics.offsetX + metrics.width - Math.max(126, Math.floor(metrics.width * 0.28));
    const lifeLabelY = hudY + Math.floor(hudHeight * 0.28);
    const heartsStartX = lifeLabelX;
    const heartsStartY = hudY + Math.floor(hudHeight * 0.57);

    this.hudBar
      .setPosition(metrics.offsetX, hudY)
      .setSize(metrics.width, hudHeight);

    this.hudGraphics.clear();
    this.hudGraphics.lineStyle(2, 0xf8f8f8, 1);
    this.hudGraphics.strokeRect(mapX, mapY, mapPanelWidth, mapPanelHeight);
    this.hudGraphics.fillStyle(0x000000, 1);
    this.hudGraphics.fillRect(mapX + 2, mapY + 2, mapPanelWidth - 4, mapPanelHeight - 4);

    this.coinIcon
      .setPosition(countersX, firstCounterY)
      .setDisplaySize(unit, unit);
    this.keyIcon
      .setPosition(countersX, secondCounterY)
      .setDisplaySize(unit, unit);

    this.hudGraphics.lineStyle(2, 0xf8f8f8, 1);
    this.hudGraphics.strokeCircle(countersX, thirdCounterY, Math.max(4, Math.floor(unit * 0.34)));
    this.hudGraphics.strokeLineShape(new Phaser.Geom.Line(
      countersX + Math.max(3, Math.floor(unit * 0.18)),
      thirdCounterY - Math.max(4, Math.floor(unit * 0.34)),
      countersX + Math.max(7, Math.floor(unit * 0.42)),
      thirdCounterY - Math.max(7, Math.floor(unit * 0.54)),
    ));

    this.rupeeLabel
      .setPosition(countersX + unit, firstCounterY)
      .setFontSize(`${unit}px`);
    this.keyLabel
      .setPosition(countersX + unit, secondCounterY)
      .setFontSize(`${unit}px`);
    this.bombLabel
      .setPosition(countersX + unit, thirdCounterY)
      .setFontSize(`${unit}px`);

    this.heartsSprites.forEach((heartSprite, index) => {
      const row = Math.floor(index / HEARTS_PER_ROW);
      const column = index % HEARTS_PER_ROW;
      heartSprite
        .setPosition(heartsStartX + (column * heartWidth), heartsStartY + (row * Math.floor(heartsHeight * 0.9)))
        .setDisplaySize(heartWidth, heartsHeight);
    });

    this.itemSlotSprite
      .setPosition(bSlotX, itemRowY)
      .setDisplaySize(slotSize, slotSize);
    this.swordSlotSprite
      .setPosition(aSlotX, itemRowY)
      .setDisplaySize(slotSize, slotSize);

    this.itemSlotContentSprite
      .setPosition(bSlotX, itemRowY)
      .setDisplaySize(itemSize, itemSize);
    this.swordSlotContentSprite
      .setPosition(aSlotX, itemRowY)
      .setDisplaySize(itemSize, itemSize);

    this.bLabel
      .setPosition(bSlotX, slotLabelY)
      .setFontSize(`${unit}px`);
    this.aLabel
      .setPosition(aSlotX, slotLabelY)
      .setFontSize(`${unit}px`);

    this.lifeLabel
      .setPosition(lifeLabelX, lifeLabelY)
      .setFontSize(`${unit}px`);

    this.hudItemAnchor = {
      x: bSlotX,
      y: itemRowY,
      size: itemSize,
    };

    this.mapLabel.setVisible(false);
    this.coinLabel.setVisible(false);

    this.hudCoinAnchor = { x: countersX, y: firstCounterY };
    this.hudMapBounds = {
      x: mapX + 4,
      y: mapY + 4,
      width: mapPanelWidth - 8,
      height: mapPanelHeight - 8,
    };
  }
}
