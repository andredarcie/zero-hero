import Phaser from 'phaser';

import { ASSET_KEYS, SCENE_DEPTHS } from '@/game/constants';
import type { WorldCamera } from '@/game/runtime/WorldCamera';

// A lava floor tile. It renders at ground level (not y-sorted — the hero walks ON it) and
// slowly pulses. Whether it blocks is decided by GameScene: solid for enemies and for a
// hero without the lava boots. It also punches a small warm hole in the darkness overlay
// (see GameScene.updateLighting) — molten rock glows.

const PULSE_MS = 900;

export class LavaObject {
  public readonly worldX: number;
  public readonly worldY: number;

  private readonly scene: Phaser.Scene;
  private readonly sprite: Phaser.GameObjects.Image;

  public constructor(scene: Phaser.Scene, worldX: number, worldY: number) {
    this.scene = scene;
    this.worldX = worldX;
    this.worldY = worldY;
    this.sprite = scene.add
      .image(0, 0, ASSET_KEYS.lavaFloor)
      .setOrigin(0.5)
      .setDepth(SCENE_DEPTHS.ground + 1);

    // Slow heat pulse, desynchronized per tile so a lava field shimmers.
    this.sprite.setAlpha(1);
    scene.tweens.add({
      targets: this.sprite,
      alpha: 0.82,
      duration: PULSE_MS + Phaser.Math.Between(-150, 150),
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  public render(tileSize: number, camera: WorldCamera): void {
    const screen = camera.tileToScreen(this.worldX, this.worldY, tileSize);
    this.sprite.setPosition(screen.x, screen.y);
    if (this.sprite.displayWidth !== tileSize) this.sprite.setDisplaySize(tileSize, tileSize);
  }

  public destroy(): void {
    this.scene.tweens.killTweensOf(this.sprite);
    this.sprite.destroy();
  }
}
