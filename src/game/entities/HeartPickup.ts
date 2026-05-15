import Phaser from 'phaser';

import { ASSET_KEYS, SCENE_DEPTHS } from '@/game/constants';
import type { WorldCamera } from '@/game/runtime/WorldCamera';

const FULL_HEART_FRAME = 4;

export class HeartPickup {
  private readonly sprite: Phaser.GameObjects.Sprite;
  private collectable = false;
  private collected = false;

  public constructor(
    private readonly scene: Phaser.Scene,
    public readonly tileX: number,
    public readonly tileY: number,
  ) {
    this.sprite = scene.add
      .sprite(0, 0, ASSET_KEYS.hudHearts, FULL_HEART_FRAME)
      .setOrigin(0.5)
      .setDepth(SCENE_DEPTHS.item)
      .setScale(0)
      .setAlpha(0);

    scene.tweens.add({
      targets: this.sprite,
      scale: 1,
      alpha: 1,
      duration: 200,
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
      y: this.sprite.y - 20,
      alpha: 0,
      scaleX: 1.6,
      scaleY: 1.6,
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
      ? Math.sin(this.scene.time.now * 0.004) * Math.max(1, tileSize * 0.1)
      : 0;
    const size = Math.max(10, Math.floor(tileSize * 0.65));

    this.sprite.setPosition(screen.x, screen.y + bob).setDisplaySize(size, size);
  }

  public destroy(): void {
    this.scene.tweens.killTweensOf(this.sprite);
    this.sprite.destroy();
  }
}
