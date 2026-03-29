import type Phaser from 'phaser';

import { ITEM_FRAME_SIZE, SCENE_DEPTHS } from '@/game/constants';
import type { BoardMetrics, GridCell } from '@/game/shared/grid';
import { gridToWorld } from '@/game/shared/grid';

export abstract class ObjectBase {
  protected readonly sprite: Phaser.GameObjects.Sprite;
  private worldSizeMultiplier = 1;

  public constructor(
    protected readonly scene: Phaser.Scene,
    private readonly cell: GridCell,
    textureKey: string,
    frame?: number,
  ) {
    this.sprite = scene.add.sprite(0, 0, textureKey, frame)
      .setOrigin(0.5)
      .setDepth(SCENE_DEPTHS.object);
  }

  protected setWorldSizeMultiplier(multiplier: number): void {
    this.worldSizeMultiplier = multiplier;
  }

  public get position(): GridCell {
    return this.cell;
  }

  public get blocksMovement(): boolean {
    return false;
  }

  public render(metrics: BoardMetrics): void {
    const world = gridToWorld(this.cell.column, this.cell.row, metrics);
    const size = Math.max(ITEM_FRAME_SIZE, Math.floor(metrics.tileSize * 0.8 * this.worldSizeMultiplier));

    this.sprite
      .setPosition(world.x, world.y)
      .setDisplaySize(size, size)
      .setVisible(true);
  }

  public destroy(): void {
    this.sprite.destroy();
  }
}
