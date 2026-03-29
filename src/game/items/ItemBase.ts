import type Phaser from 'phaser';

import { ITEM_FRAME_SIZE, SCENE_DEPTHS, TIMINGS } from '@/game/constants';
import type { BoardMetrics, GridCell } from '@/game/shared/grid';
import { gridToWorld } from '@/game/shared/grid';

export abstract class ItemBase {
  protected readonly sprite: Phaser.GameObjects.Image;
  private collected = false;
  private collecting = false;

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

  protected setSourceFrameSize(width: number, height: number): void {
    this.sprite.setCrop(0, 0, width, height);
    this.sprite.setSize(width, height);
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
    const size = Math.max(ITEM_FRAME_SIZE, Math.floor(metrics.tileSize * 0.6));

    this.sprite
      .setPosition(world.x, world.y)
      .setDisplaySize(size, size)
      .setVisible(!this.collected);
  }

  public collectToHud(target: { x: number; y: number; size: number }): Promise<void> {
    this.collecting = true;
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
          this.sprite.setVisible(false);
          resolve();
        },
      });
    });
  }

  public destroy(): void {
    this.sprite.destroy();
  }
}
