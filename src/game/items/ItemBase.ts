import type Phaser from 'phaser';

import {
  ASSET_KEYS,
  ITEM_FLOAT_AMPLITUDE,
  ITEM_FLOAT_SPEED,
  ITEM_FRAME_SIZE,
  ITEM_SCALE_PULSE,
  SCENE_DEPTHS,
  TIMINGS,
} from '@/game/constants';
import type { BoardMetrics, GridCell } from '@/game/shared/grid';
import { gridToWorld } from '@/game/shared/grid';

export abstract class ItemBase {
  protected readonly sprite: Phaser.GameObjects.Sprite;
  private readonly shadow: Phaser.GameObjects.Image;
  private collected = false;
  private collecting = false;
  private worldSizeMultiplier = 1;
  private readonly floatOffsetSeed: number;

  public constructor(
    protected readonly scene: Phaser.Scene,
    private readonly cell: GridCell,
    private readonly worldTextureKey: string,
    private readonly hudTextureKey: string,
    worldFrame?: number,
  ) {
    this.floatOffsetSeed = ((cell.column * 31) + (cell.row * 17)) * 0.35;
    this.shadow = scene.add.image(0, 0, ASSET_KEYS.itemShadow)
      .setOrigin(0.5)
      .setDepth(SCENE_DEPTHS.decorBelowPlayer);
    this.sprite = scene.add.sprite(0, 0, worldTextureKey, worldFrame)
      .setOrigin(0.5)
      .setDepth(SCENE_DEPTHS.item);
  }

  protected setWorldSizeMultiplier(multiplier: number): void {
    this.worldSizeMultiplier = multiplier;
  }

  public get position(): GridCell {
    return this.cell;
  }

  public get hudTexture(): string {
    return this.hudTextureKey;
  }

  public get isCollected(): boolean {
    return this.collected;
  }

  public get isCollecting(): boolean {
    return this.collecting;
  }

  public render(metrics: BoardMetrics): void {
    if (this.collecting) {
      return;
    }

    const world = gridToWorld(this.cell.column, this.cell.row, metrics);
    const size = Math.max(ITEM_FRAME_SIZE, Math.floor(metrics.tileSize * 0.6 * this.worldSizeMultiplier));
    const time = this.scene.time.now + this.floatOffsetSeed;
    const bob = Math.sin(time * ITEM_FLOAT_SPEED) * Math.max(2, Math.floor(metrics.tileSize * (ITEM_FLOAT_AMPLITUDE / 24)));
    const pulse = 1 + (Math.sin((time * ITEM_FLOAT_SPEED) + 1.2) * ITEM_SCALE_PULSE);
    const shimmer = 0.82 + (Math.sin((time * ITEM_FLOAT_SPEED * 1.35) + 0.6) * 0.18);
    const shadowWidth = Math.max(10, Math.floor(size * 0.78));
    const shadowHeight = Math.max(4, Math.floor(size * 0.26));
    const shadowScale = 1 - (Math.max(-1, bob) / Math.max(10, metrics.tileSize * 1.8));

    this.shadow
      .setPosition(world.x, world.y + Math.floor(metrics.tileSize * 0.24))
      .setDisplaySize(shadowWidth * shadowScale, shadowHeight)
      .setAlpha(0.45)
      .setVisible(!this.collected);
    this.sprite
      .setPosition(world.x, world.y + bob)
      .setDisplaySize(size * pulse, size * pulse)
      .setAlpha(shimmer)
      .setVisible(!this.collected);
  }

  public collectToHud(target: { x: number; y: number; size: number }): Promise<void> {
    this.collecting = true;
    this.collected = false;
    this.sprite
      .setVisible(true)
      .setAlpha(1);
    this.shadow.setVisible(false);
    this.sprite.setDepth(SCENE_DEPTHS.uiOverlay);

    return new Promise((resolve) => {
      this.scene.tweens.add({
        targets: this.sprite,
        x: target.x,
        y: target.y,
        displayWidth: target.size,
        displayHeight: target.size,
        ease: 'Cubic.easeInOut',
        duration: TIMINGS.moveDurationMs * 2,
        onComplete: () => {
          this.collecting = false;
          this.collected = true;
          this.sprite
            .setVisible(false)
            .setAlpha(1)
            .setDepth(SCENE_DEPTHS.item);
          resolve();
        },
      });
    });
  }

  public dropAt(cell: GridCell, metrics: BoardMetrics): void {
    this.cell.column = cell.column;
    this.cell.row = cell.row;
    this.collecting = false;
    this.collected = false;
    this.shadow.setVisible(true);
    this.sprite
      .setDepth(SCENE_DEPTHS.item)
      .setAlpha(1);
    this.render(metrics);
  }

  public destroy(): void {
    this.shadow.destroy();
    this.sprite.destroy();
  }
}
