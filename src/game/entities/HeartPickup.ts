import type Phaser from 'phaser';

import type { Billboard3D } from '@/game/render3d/Billboard3D';
import { world3d } from '@/game/render3d/World3D';
import type { WorldCamera } from '@/game/runtime/WorldCamera';

const HEART_SIZE = 0.65; // tiles

export class HeartPickup {
  private readonly sprite: Billboard3D;
  private collectable = false;
  private collected = false;

  public constructor(
    private readonly scene: Phaser.Scene,
    public readonly tileX: number,
    public readonly tileY: number,
  ) {
    // Full-bright: a heart must read even in the dark, like every collectible.
    this.sprite = world3d()
      .addBillboard('heart', 0, { emissive: true })
      .setPosition(tileX, tileY)
      .setDisplaySize(0, 0)
      .setAlpha(0);

    scene.tweens.add({
      targets: this.sprite,
      displayWidth: HEART_SIZE,
      displayHeight: HEART_SIZE,
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
      elevation: 0.5,
      alpha: 0,
      displayWidth: HEART_SIZE * 1.6,
      displayHeight: HEART_SIZE * 1.6,
      duration: 300,
      ease: 'Power2.easeOut',
      onComplete: () => {
        this.sprite.setVisible(false);
        onComplete();
      },
    });
  }

  public render(_tileSize: number, _camera: WorldCamera): void {
    if (this.collected) return;
    const bob = this.collectable
      ? (Math.sin(this.scene.time.now * 0.004) + 1) * 0.5 * 0.1
      : 0;
    this.sprite.setElevation(bob);
  }

  public destroy(): void {
    this.scene.tweens.killTweensOf(this.sprite);
    this.sprite.destroy();
  }
}
