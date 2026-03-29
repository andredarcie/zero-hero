import type Phaser from 'phaser';

import { SCENE_DEPTHS } from '@/game/constants';
import type { BoardMetrics, GridCell } from '@/game/shared/grid';
import { gridToWorld } from '@/game/shared/grid';

export abstract class ItemBase {
  protected readonly sprite: Phaser.GameObjects.Image;
  private collected = false;

  public constructor(
    protected readonly scene: Phaser.Scene,
    private readonly cell: GridCell,
    private readonly worldTextureKey: string,
    private readonly hudTextureKey: string,
  ) {
    this.sprite = scene.add.image(0, 0, worldTextureKey)
      .setOrigin(0.5)
      .setDepth(SCENE_DEPTHS.item);
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

  public render(metrics: BoardMetrics): void {
    const world = gridToWorld(this.cell.column, this.cell.row, metrics);
    const size = Math.max(12, Math.floor(metrics.tileSize * 0.6));

    this.sprite
      .setPosition(world.x, world.y)
      .setDisplaySize(size, size)
      .setVisible(!this.collected);
  }

  public collect(): void {
    this.collected = true;
    this.sprite.setVisible(false);
  }

  public destroy(): void {
    this.sprite.destroy();
  }
}
