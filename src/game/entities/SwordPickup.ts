import Phaser from 'phaser';

import { ASSET_KEYS, ITEM_FRAMES, SCENE_DEPTHS } from '@/game/constants';
import type { WorldCamera } from '@/game/runtime/WorldCamera';

export class SwordPickup {
  private readonly sprite: Phaser.GameObjects.Sprite;
  private collectable = false;
  private collected = false;

  public constructor(
    private readonly scene: Phaser.Scene,
    public readonly tileX: number,
    public readonly tileY: number,
  ) {
    this.sprite = scene.add
      .sprite(0, 0, ASSET_KEYS.swordItem, ITEM_FRAMES.swordIdle)
      .setOrigin(0.5)
      .setDepth(SCENE_DEPTHS.item)
      .setScale(0)
      .setAlpha(0);

    scene.tweens.add({
      targets: this.sprite,
      scale: 1,
      alpha: 1,
      duration: 250,
      ease: 'Back.easeOut',
      onComplete: () => { this.collectable = true; },
    });
  }

  public get isCollectable(): boolean { return this.collectable; }
  public get isCollected(): boolean { return this.collected; }

  public collect(onComplete: () => void): void {
    this.collected = true;
    this.collectable = false;
    this.scene.tweens.killTweensOf(this.sprite);
    this.scene.tweens.add({
      targets: this.sprite,
      y: this.sprite.y - 24,
      alpha: 0,
      scaleX: 1.8,
      scaleY: 1.8,
      duration: 300,
      ease: 'Power2.easeOut',
      onComplete: () => {
        this.sprite.setVisible(false);
        onComplete();
      },
    });
  }

  public render(tileSize: number, camera: WorldCamera): void {
    if (this.collected) return;
    const screen = camera.tileToScreen(this.tileX, this.tileY, tileSize);
    const bob = this.collectable
      ? Math.sin(this.scene.time.now * 0.0045) * Math.max(1, tileSize * 0.1)
      : 0;
    const size = Math.max(10, Math.floor(tileSize * 0.7));
    this.sprite
      .setPosition(screen.x, screen.y + bob)
      .setDisplaySize(size, size);
  }

  public destroy(): void {
    this.scene.tweens.killTweensOf(this.sprite);
    this.sprite.destroy();
  }
}
