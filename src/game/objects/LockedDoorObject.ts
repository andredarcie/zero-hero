import Phaser from 'phaser';

import { ASSET_KEYS, ySortDepth } from '@/game/constants';
import type { WorldCamera } from '@/game/runtime/WorldCamera';

// A locked door prop. It blocks its tile until the hero bumps it while holding a key, which
// opens it for good. Like DryBushObject, its collision lives here (see `blocking`) and is
// resolved at runtime, not baked into the collision grid. Uses the existing locked_door tile.
export class LockedDoorObject {
  public readonly worldX: number;
  public readonly worldY: number;

  private readonly scene: Phaser.Scene;
  private readonly sprite: Phaser.GameObjects.Image;
  private open = false;

  public constructor(scene: Phaser.Scene, worldX: number, worldY: number) {
    this.scene = scene;
    this.worldX = worldX;
    this.worldY = worldY;
    this.sprite = scene.add
      .image(0, 0, ASSET_KEYS.lookedDoorObject)
      .setOrigin(0.5)
      .setDepth(ySortDepth(worldY));
  }

  /** The tile is impassable while the door is shut. */
  public get blocking(): boolean {
    return !this.open;
  }

  public get isOpen(): boolean {
    return this.open;
  }

  /** Open the door (key consumed by the caller); only a shut door can open. */
  public unlock(): boolean {
    if (this.open) return false;
    this.open = true;
    // Swing open: lift and fade to a faint frame so the doorway reads as passable.
    this.scene.tweens.killTweensOf(this.sprite);
    this.scene.tweens.add({
      targets: this.sprite,
      scaleX: this.sprite.scaleX * 0.2,
      alpha: 0.25,
      duration: 260,
      ease: 'Back.easeIn',
    });
    return true;
  }

  /** Brief shake so bumping the shut door (without a key) reads as a solid obstacle. */
  public shake(): void {
    if (this.open) return;
    this.scene.tweens.killTweensOf(this.sprite);
    this.scene.tweens.add({
      targets: this.sprite,
      angle: { from: -5, to: 5 },
      duration: 55,
      yoyo: true,
      repeat: 2,
      ease: 'Sine.easeInOut',
      onComplete: () => this.sprite.setAngle(0),
    });
  }

  public render(tileSize: number, camera: WorldCamera): void {
    const screen = camera.tileToScreen(this.worldX, this.worldY, tileSize);
    const size = Math.max(12, Math.floor(tileSize * 0.98));
    this.sprite.setPosition(screen.x, screen.y).setDepth(ySortDepth(this.worldY));
    // Only size when it changes, so the open tween's scaleX isn't clobbered each frame.
    if (this.sprite.displayWidth !== size) this.sprite.setDisplaySize(size, size);
  }

  public destroy(): void {
    this.scene.tweens.killTweensOf(this.sprite);
    this.sprite.destroy();
  }
}
