import Phaser from 'phaser';

import { ASSET_KEYS, ySortDepth } from '@/game/constants';
import type { WorldCamera } from '@/game/runtime/WorldCamera';

// A small dry shrub ("arbusto seco") — the same bare-brown look as the dry tree but bush-sized.
// It blocks its tile until the hero clears it with the axe. Unlike the tree it drops NOTHING
// (no graveto) and never grows back: it is purely a physical barrier. Collision is owned here
// (see `blocking`) and resolved at runtime, exactly like DryTreeObject.
export class DryShrubObject {
  public readonly worldX: number;
  public readonly worldY: number;

  private readonly scene: Phaser.Scene;
  private readonly sprite: Phaser.GameObjects.Sprite;
  private cleared = false;

  public constructor(scene: Phaser.Scene, worldX: number, worldY: number) {
    this.scene = scene;
    this.worldX = worldX;
    this.worldY = worldY;
    this.sprite = scene.add
      .sprite(0, 0, ASSET_KEYS.dryShrub)
      .setOrigin(0.5)
      .setDepth(ySortDepth(worldY));
  }

  /** Impassable until the axe clears it. */
  public get blocking(): boolean {
    return !this.cleared;
  }

  /** The sprite to cast a firelight shadow from while the shrub still stands (null once cleared). */
  public get shadowCaster(): Phaser.GameObjects.Sprite | Phaser.GameObjects.Image | null {
    return this.blocking ? this.sprite : null;
  }

  /** One axe chop clears the shrub for good. Returns true if it just got cleared. */
  public chop(): boolean {
    if (this.cleared) return false;
    this.cleared = true;
    // render() bails out once cleared, so it won't clobber this shrink-away poof.
    this.scene.tweens.killTweensOf(this.sprite);
    this.scene.tweens.add({
      targets: this.sprite,
      scaleX: 0,
      scaleY: 0,
      angle: 45,
      alpha: 0,
      duration: 220,
      ease: 'Back.easeIn',
      onComplete: () => this.sprite.setVisible(false),
    });
    return true;
  }

  /** Brief shake for a bump without the axe, so it reads as solid. */
  public shake(): void {
    if (this.cleared) return;
    this.scene.tweens.killTweensOf(this.sprite);
    this.scene.tweens.add({
      targets: this.sprite,
      angle: { from: -5, to: 5 },
      duration: 60,
      yoyo: true,
      repeat: 1,
      ease: 'Sine.easeInOut',
      onComplete: () => this.sprite.setAngle(0),
    });
  }

  public render(tileSize: number, camera: WorldCamera): void {
    if (this.cleared) return; // gone — leave the poof tween alone
    const screen = camera.tileToScreen(this.worldX, this.worldY, tileSize);
    const size = Math.max(10, Math.floor(tileSize * 0.72)); // bush-sized, smaller than a tree
    this.sprite.setPosition(screen.x, screen.y).setDepth(ySortDepth(this.worldY));
    if (this.sprite.displayWidth !== size) this.sprite.setDisplaySize(size, size);
  }

  public destroy(): void {
    this.scene.tweens.killTweensOf(this.sprite);
    this.sprite.destroy();
  }
}
