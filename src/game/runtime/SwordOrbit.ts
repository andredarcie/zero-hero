import Phaser from 'phaser';

import { ASSET_KEYS, ITEM_FRAMES, SCENE_DEPTHS } from '@/game/constants';

const SLASH_DURATION = 170;
const SLASH_SWEEP_DEG = 75;
const SLASH_DIST_FACTOR = 0.6;

export class SwordSlash {
  private readonly sprite: Phaser.GameObjects.Sprite;
  private readonly scene: Phaser.Scene;

  public constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.sprite = scene.add
      .sprite(0, 0, ASSET_KEYS.swordItem, ITEM_FRAMES.swordIdle)
      .setOrigin(0.5)
      .setDepth(SCENE_DEPTHS.player + 1)
      .setAlpha(0)
      .setVisible(false);
  }

  // dx/dy: direction of attack (-1, 0, or 1)
  public slash(playerScreenX: number, playerScreenY: number, dx: number, dy: number, tileSize: number): void {
    this.scene.tweens.killTweensOf(this.sprite);

    const dist = tileSize * SLASH_DIST_FACTOR;
    const size = Math.max(10, Math.floor(tileSize * 0.65));
    const attackAngleDeg = Math.atan2(dy, dx) * (180 / Math.PI) + 90;

    this.sprite
      .setPosition(playerScreenX + dx * dist, playerScreenY + dy * dist)
      .setDisplaySize(size, size)
      .setAngle(attackAngleDeg - SLASH_SWEEP_DEG / 2)
      .setAlpha(1)
      .setVisible(true);

    this.scene.tweens.add({
      targets: this.sprite,
      angle: attackAngleDeg + SLASH_SWEEP_DEG / 2,
      alpha: 0,
      duration: SLASH_DURATION,
      ease: 'Power2.easeOut',
      onComplete: () => { this.sprite.setVisible(false); },
    });
  }

  public destroy(): void {
    this.scene.tweens.killTweensOf(this.sprite);
    this.sprite.destroy();
  }
}
