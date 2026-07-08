import Phaser from 'phaser';

import {
  ASSET_KEYS,
  FONT_FAMILY,
  HUD_BACKGROUND_COLOR,
  HUD_HEALTH_MAX,
  HUD_HEARTS_SCALE,
  HUD_ITEM_SCALE,
  HUD_SLOT_SCALE,
  SCENE_DEPTHS,
  TEXT_RESOLUTION,
  ySortDepth,
} from '@/game/constants';
import type { BoardMetrics } from '@/game/shared/grid';
import type { ChunkManager } from '@/game/world/ChunkManager';
import type { WorldCamera } from './WorldCamera';

const LOW_GRASS_TILE = 0;
const FULL_HEART_FRAME = 4;
const EMPTY_HEART_FRAME = 0;
// How far obstacle tops (trees/walls) lift off the ground for the 2.5D "standing up" look.
const TREE_LIFT_FACTOR = 0.16;

type TileEntry = {
  ground: Phaser.GameObjects.Sprite;
  upper: Phaser.GameObjects.Sprite | null;
  shadow: Phaser.GameObjects.Ellipse | null;
  isObstacle: boolean;
};

export class GameBoardRenderer {
  private readonly tileSprites = new Map<string, TileEntry>();
  private readonly grassSprites = new Map<string, Phaser.GameObjects.Sprite>();
  private readonly hudBar: Phaser.GameObjects.Rectangle;
  private readonly hudGraphics: Phaser.GameObjects.Graphics;
  private readonly heartsSprites: Phaser.GameObjects.Sprite[];
  // Single held-item slot (the hero carries one item at a time): a frame plus the content
  // sprite that shows the current item (sword / key) and an optional fire overlay.
  private readonly itemSlotSprite: Phaser.GameObjects.Image;
  private readonly itemSlotContentSprite: Phaser.GameObjects.Sprite;
  private readonly swordFireOverlay: Phaser.GameObjects.Image;
  private swordFireTimer?: Phaser.Time.TimerEvent;
  private readonly coinIcon: Phaser.GameObjects.Image;
  private readonly keyIcon: Phaser.GameObjects.Image;
  // Safety indicator: campfire + "SEGURO" near a fire, blinking skull + "PERIGO" in the dark.
  private readonly safetyIcon: Phaser.GameObjects.Image;
  private readonly safetyLabel: Phaser.GameObjects.Text;
  private safetyBlinkTween?: Phaser.Tweens.Tween;
  private safetySafe: boolean | null = null;
  private readonly lifeLabel: Phaser.GameObjects.Text;
  private readonly rupeeLabel: Phaser.GameObjects.Text;
  private readonly keyLabel: Phaser.GameObjects.Text;
  private readonly bombLabel: Phaser.GameObjects.Text;
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
    this.itemSlotContentSprite = scene.add.sprite(0, 0, ASSET_KEYS.swordItemIcon)
      .setOrigin(0.5)
      .setVisible(false)
      .setDepth(SCENE_DEPTHS.uiLabel);
    this.swordFireOverlay = scene.add.image(0, 0, ASSET_KEYS.tinyFire0)
      .setOrigin(0.5)
      .setVisible(false)
      .setDepth(SCENE_DEPTHS.uiLabel + 1);

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
      resolution: TEXT_RESOLUTION,
    }).setDepth(SCENE_DEPTHS.uiLabel);

    this.safetyIcon = scene.add.image(0, 0, ASSET_KEYS.campfireFrame1)
      .setOrigin(0.5)
      .setDepth(SCENE_DEPTHS.uiLabel);
    this.safetyLabel = makeHudText('SEGURO', '#7fd97f').setOrigin(0, 0.5);
    this.setSafety(true);

    this.lifeLabel = makeHudText('-LIFE-', '#f8f8f8');
    this.rupeeLabel = makeHudText('x000', '#f8f8f8');
    this.keyLabel = makeHudText('x00', '#f8f8f8');
    this.bombLabel = makeHudText('x00', '#f8f8f8');
    this.mapLabel = makeHudText('MAP', '#f8f8f8');

    this.coinLabel = makeHudText('000', '#f8f8f8').setOrigin(0, 0.5);
    this.rupeeLabel.setOrigin(0, 0.5);
    this.keyLabel.setOrigin(0, 0.5);
    this.bombLabel.setOrigin(0, 0.5);
    this.lifeLabel.setOrigin(0, 0.5);
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

    for (let ty = range.minY; ty <= range.maxY; ty++) {
      for (let tx = range.minX; tx <= range.maxX; tx++) {
        const key = `${tx},${ty}`;
        nextKeys.add(key);
        const screen = camera.tileToScreen(tx, ty, tileSize);
        const screenX = screen.x;
        const screenY = screen.y;

        let entry = this.tileSprites.get(key);
        if (!entry) {
          entry = this.createTileEntry(tx, ty, tileSize, chunkManager);
          this.tileSprites.set(key, entry);
        }

        entry.ground
          .setPosition(screenX, screenY)
          .setDisplaySize(tileSize, tileSize);

        if (entry.upper) {
          // Obstacles lift up off the ground; flat decor (grass) stays put.
          const lift = entry.isObstacle ? Math.round(tileSize * TREE_LIFT_FACTOR) : 0;
          entry.upper
            .setPosition(screenX, screenY - lift)
            .setDisplaySize(tileSize, tileSize);
        }

        if (entry.shadow) {
          entry.shadow
            .setPosition(screenX, screenY + Math.round(tileSize * 0.30))
            .setDisplaySize(tileSize * 0.72, tileSize * 0.30);
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
        entry.shadow?.destroy();
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

  /**
   * Flip the HUD safety indicator: `true` = near a campfire (steady campfire + SEGURO),
   * `false` = out in the dark (blinking skull + PERIGO). Cheap to call every frame.
   */
  public setSafety(safe: boolean): void {
    if (safe === this.safetySafe) return;
    this.safetySafe = safe;

    this.safetyBlinkTween?.stop();
    this.safetyBlinkTween = undefined;
    this.safetyIcon.setAlpha(1);
    this.safetyLabel.setAlpha(1);

    if (safe) {
      this.safetyIcon.setTexture(ASSET_KEYS.campfireFrame1);
      this.safetyLabel.setText('SEGURO').setColor('#7fd97f');
    } else {
      this.safetyIcon.setTexture(ASSET_KEYS.undead);
      this.safetyLabel.setText('PERIGO').setColor('#ff5555');
      this.safetyBlinkTween = this.scene.tweens.add({
        targets: [this.safetyIcon, this.safetyLabel],
        alpha: 0.25,
        duration: 380,
        yoyo: true,
        repeat: -1,
      });
    }
  }

  public setHudItemTexture(textureKey: string | null, frame?: string | number): void {
    if (!textureKey) {
      this.itemSlotContentSprite.setVisible(false);
      return;
    }
    this.itemSlotContentSprite.setTexture(textureKey, frame).setVisible(true);
  }

  /**
   * Show the held item ablaze in the HUD slot: swap the slot content to its lit texture and
   * animate a small flame above it. Turning it off only removes the flame/tint — the caller
   * restores the correct item icon via setHudItemTexture.
   */
  public setHudItemFire(onFire: boolean, litTexture?: string, litTint?: number): void {
    if (onFire && litTexture) {
      this.itemSlotContentSprite.setTexture(litTexture, 0).setVisible(true);
      if (litTint !== undefined) this.itemSlotContentSprite.setTint(litTint);
      else this.itemSlotContentSprite.clearTint();
      this.swordFireOverlay.setVisible(true);
      let fi = 0;
      const frames = [ASSET_KEYS.tinyFire0, ASSET_KEYS.tinyFire1, ASSET_KEYS.tinyFire2] as const;
      this.swordFireTimer?.destroy();
      this.swordFireTimer = this.scene.time.addEvent({
        delay: 140,
        loop: true,
        callback: () => {
          fi = (fi + 1) % frames.length;
          this.swordFireOverlay.setTexture(frames[fi]);
        },
      });
    } else {
      this.swordFireTimer?.destroy();
      this.swordFireTimer = undefined;
      this.swordFireOverlay.setVisible(false);
      this.itemSlotContentSprite.clearTint();
    }
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

    const isObstacle = tile.upper !== null && tile.collision;

    let upper: Phaser.GameObjects.Sprite | null = null;
    if (tile.upper !== null) {
      // Obstacles join the Y-sort band so the hero can pass in front of / behind them;
      // flat decor stays below the player.
      const depth = tile.collision ? ySortDepth(worldY) : SCENE_DEPTHS.decorBelowPlayer;
      upper = this.scene.add
        .sprite(0, 0, ASSET_KEYS.forestTileset, tile.upper)
        .setOrigin(0.5)
        .setDisplaySize(tileSize, tileSize)
        .setDepth(depth);

      if (tile.upper === LOW_GRASS_TILE) {
        this.grassSprites.set(`${worldX},${worldY}`, upper);
      }
    }

    // Ground shadow that anchors lifted obstacles so they read as standing up.
    const shadow = isObstacle
      ? this.scene.add
        .ellipse(0, 0, tileSize, tileSize, 0x000000, 0.26)
        .setDepth(SCENE_DEPTHS.ground + 1)
      : null;

    return { ground, upper, shadow, isObstacle };
  }

  private renderHud(metrics: BoardMetrics): void {
    const hudH = metrics.offsetY;
    const pad = Math.max(4, Math.floor(metrics.tileSize * 0.13));
    // cap unit so text stays readable at any tileSize
    const unit = Math.max(7, Math.min(10, Math.floor(metrics.tileSize * 0.34)));
    const heartsH = Math.max(10, Math.floor(metrics.tileSize * HUD_HEARTS_SCALE));
    const slotSize = Math.max(18, Math.floor(metrics.tileSize * HUD_SLOT_SCALE));
    const itemSize = Math.max(12, Math.floor(metrics.tileSize * HUD_ITEM_SCALE));

    // ── Minimap (left) ─ player-centered radar of nearby chunks ───────────
    const mapW = Math.max(64, Math.floor(metrics.width * 0.18));
    const mapH = Math.max(32, Math.round(mapW * 0.5));
    const mapX = metrics.offsetX + pad;
    const mapY = Math.round((hudH - mapH) / 2);

    // ── Counters (coin / key / bomb) ────────────────────────────────────────
    const ctX = mapX + mapW + Math.max(8, Math.floor(metrics.tileSize * 0.48));
    const ctY1 = Math.round(hudH * 0.20);
    const ctY2 = Math.round(hudH * 0.50);
    const ctY3 = Math.round(hudH * 0.80);

    // ── Item slot (center) — the hero carries a single item at a time ────────
    const slotX = metrics.offsetX + Math.round(metrics.width * 0.60);
    const slotsY = Math.round(hudH * 0.58);

    // ── Hearts / LIFE (right) ───────────────────────────────────────────────
    const heartW = heartsH;
    const heartsBlockW = HUD_HEALTH_MAX * heartW;
    const lifeX = metrics.offsetX + metrics.width - heartsBlockW - pad;
    const lifeY = Math.round(hudH * 0.18);
    const heartsY = Math.round(hudH * 0.56);

    // ── Draw ────────────────────────────────────────────────────────────────
    this.hudBar
      .setPosition(metrics.offsetX, 0)
      .setSize(metrics.width, hudH);

    this.hudGraphics.clear();

    // bomb icon (circle + fuse)
    this.hudGraphics.lineStyle(1, 0xf8f8f8, 1);
    this.hudGraphics.strokeCircle(ctX, ctY3, Math.max(3, Math.floor(unit * 0.38)));
    this.hudGraphics.strokeLineShape(new Phaser.Geom.Line(
      ctX + Math.max(2, Math.floor(unit * 0.22)),
      ctY3 - Math.max(3, Math.floor(unit * 0.38)),
      ctX + Math.max(5, Math.floor(unit * 0.48)),
      ctY3 - Math.max(5, Math.floor(unit * 0.58)),
    ));

    this.coinIcon.setPosition(ctX, ctY1).setDisplaySize(unit, unit);
    this.keyIcon.setPosition(ctX, ctY2).setDisplaySize(unit, unit);

    this.rupeeLabel.setPosition(ctX + unit + 2, ctY1).setFontSize(`${unit}px`);
    this.keyLabel.setPosition(ctX + unit + 2, ctY2).setFontSize(`${unit}px`);
    this.bombLabel.setPosition(ctX + unit + 2, ctY3).setFontSize(`${unit}px`);

    // ── Safety indicator — between the counters and the item slot ───────────
    const safetyIconSize = Math.max(10, Math.floor(unit * 1.5));
    const safetyX = metrics.offsetX + Math.round(metrics.width * 0.38);
    const safetyY = Math.round(hudH * 0.58);
    this.safetyIcon.setPosition(safetyX, safetyY).setDisplaySize(safetyIconSize, safetyIconSize);
    this.safetyLabel
      .setPosition(safetyX + Math.ceil(safetyIconSize * 0.65) + 3, safetyY)
      .setFontSize(`${unit}px`);

    this.itemSlotSprite.setPosition(slotX, slotsY).setDisplaySize(slotSize, slotSize);
    this.itemSlotContentSprite.setPosition(slotX, slotsY).setDisplaySize(itemSize, itemSize);
    // Fire overlay floats at the blade tip (upper half of the slot)
    const fireOverlaySize = Math.floor(itemSize * 0.60);
    this.swordFireOverlay
      .setPosition(slotX, slotsY - Math.floor(itemSize * 0.38))
      .setDisplaySize(fireOverlaySize, fireOverlaySize);

    this.lifeLabel.setPosition(lifeX, lifeY).setFontSize(`${unit}px`);
    this.heartsSprites.forEach((s, i) => {
      s.setPosition(lifeX + i * heartW, heartsY).setDisplaySize(heartW, heartsH);
    });

    this.mapLabel.setVisible(false);
    this.coinLabel.setVisible(false);

    this.hudItemAnchor = { x: slotX, y: slotsY, size: itemSize };
    this.hudCoinAnchor = { x: ctX, y: ctY1 };
    this.hudMapBounds = {
      x: mapX + 3,
      y: mapY + 3,
      width: mapW - 6,
      height: mapH - 6,
    };
  }
}
