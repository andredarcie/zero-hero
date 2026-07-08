import Phaser from 'phaser';

import { ASSET_KEYS, DRY_TREE_FRAME_COUNT, ySortDepth } from '@/game/constants';
import type { WorldCamera } from '@/game/runtime/WorldCamera';

// A dry tree ("árvore seca") blocks its tile until the hero chops it down with the axe.
// Each chop advances one frame of the woods.png sheet — the tree visibly shrinks stage by
// stage — and the last frame is a passable stump. Collision is owned here (see `blocking`)
// and resolved at runtime, exactly like DryBushObject.

const STUMP_FRAME = DRY_TREE_FRAME_COUNT - 1;

export class DryTreeObject {
  public readonly worldX: number;
  public readonly worldY: number;

  private readonly scene: Phaser.Scene;
  private readonly sprite: Phaser.GameObjects.Sprite;
  private stage = 0;

  public constructor(scene: Phaser.Scene, worldX: number, worldY: number) {
    this.scene = scene;
    this.worldX = worldX;
    this.worldY = worldY;
    this.sprite = scene.add
      .sprite(0, 0, ASSET_KEYS.dryTree, 0)
      .setOrigin(0.5)
      .setDepth(ySortDepth(worldY));
  }

  /** The tile is impassable until the tree is chopped down to its stump. */
  public get blocking(): boolean {
    return this.stage < STUMP_FRAME;
  }

  /** One axe chop: shrink a stage. Returns true if the chop landed (tree still standing). */
  public chop(): boolean {
    if (!this.blocking) return false;
    this.stage += 1;
    this.sprite.setFrame(this.stage);

    // Recoil so the hit reads: quick sideways shudder plus a squash on the new stage.
    this.scene.tweens.killTweensOf(this.sprite);
    this.sprite.setAngle(0);
    this.scene.tweens.add({
      targets: this.sprite,
      angle: { from: -7, to: 7 },
      duration: 55,
      yoyo: true,
      repeat: 1,
      ease: 'Sine.easeInOut',
      onComplete: () => this.sprite.setAngle(0),
    });
    return true;
  }

  /** Brief shake for a bump without the axe, so it reads as solid. */
  public shake(): void {
    if (!this.blocking) return;
    this.scene.tweens.killTweensOf(this.sprite);
    this.scene.tweens.add({
      targets: this.sprite,
      angle: { from: -4, to: 4 },
      duration: 60,
      yoyo: true,
      repeat: 1,
      ease: 'Sine.easeInOut',
      onComplete: () => this.sprite.setAngle(0),
    });
  }

  public render(tileSize: number, camera: WorldCamera): void {
    const screen = camera.tileToScreen(this.worldX, this.worldY, tileSize);
    const size = Math.max(12, Math.floor(tileSize * 0.95));
    this.sprite.setPosition(screen.x, screen.y).setDepth(ySortDepth(this.worldY));
    if (this.sprite.displayWidth !== size) this.sprite.setDisplaySize(size, size);
  }

  public destroy(): void {
    this.scene.tweens.killTweensOf(this.sprite);
    this.sprite.destroy();
  }
}
