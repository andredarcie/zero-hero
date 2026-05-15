import Phaser from 'phaser';

import { ASSET_KEYS, ITEM_FRAMES, SCENE_DEPTHS } from '@/game/constants';

const ORBIT_SPEED = 0.012; // rad/ms — ~2 rev/s
const ORBIT_RADIUS_FACTOR = 1.05;
const FADE_DURATION = 180;

export class SwordOrbit {
  private angle = 0;
  private visible = false;
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

  public update(playerScreenX: number, playerScreenY: number, tileSize: number, delta: number, hasNearbyEnemy: boolean): void {
    if (hasNearbyEnemy !== this.visible) {
      this.visible = hasNearbyEnemy;
      this.scene.tweens.killTweensOf(this.sprite);
      if (hasNearbyEnemy) {
        this.sprite.setVisible(true);
        this.scene.tweens.add({ targets: this.sprite, alpha: 1, duration: FADE_DURATION, ease: 'Power2.easeOut' });
      } else {
        this.scene.tweens.add({
          targets: this.sprite, alpha: 0, duration: FADE_DURATION, ease: 'Power2.easeIn',
          onComplete: () => { this.sprite.setVisible(false); },
        });
      }
    }

    if (!hasNearbyEnemy) return;

    this.angle += ORBIT_SPEED * delta;
    const radius = tileSize * ORBIT_RADIUS_FACTOR;
    const size = Math.max(10, Math.floor(tileSize * 0.65));

    this.sprite
      .setPosition(playerScreenX + Math.cos(this.angle) * radius, playerScreenY + Math.sin(this.angle) * radius)
      .setDisplaySize(size, size)
      .setAngle(Phaser.Math.RadToDeg(this.angle) + 90);
  }

  public getWorldTile(playerWorldX: number, playerWorldY: number): { x: number; y: number } {
    return {
      x: Math.round(playerWorldX + Math.cos(this.angle) * ORBIT_RADIUS_FACTOR),
      y: Math.round(playerWorldY + Math.sin(this.angle) * ORBIT_RADIUS_FACTOR),
    };
  }

  public destroy(): void {
    this.scene.tweens.killTweensOf(this.sprite);
    this.sprite.destroy();
  }
}
