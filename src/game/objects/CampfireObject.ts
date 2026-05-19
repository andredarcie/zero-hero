import Phaser from 'phaser';

import { ASSET_KEYS, SCENE_DEPTHS } from '@/game/constants';
import type { WorldCamera } from '@/game/runtime/WorldCamera';

const FRAME_DURATION = 140; // ms per animation frame
const FRAME_KEYS = [
  ASSET_KEYS.campfireFrame0,
  ASSET_KEYS.campfireFrame1,
  ASSET_KEYS.campfireFrame2,
] as const;

export class CampfireObject {
  public readonly worldX: number;
  public readonly worldY: number;

  private readonly scene: Phaser.Scene;
  private readonly sprite: Phaser.GameObjects.Image;
  private readonly glow: Phaser.GameObjects.Image;
  private frameIndex = 0;
  private readonly animTimer: Phaser.Time.TimerEvent;

  public constructor(scene: Phaser.Scene, worldX: number, worldY: number) {
    this.scene  = scene;
    this.worldX = worldX;
    this.worldY = worldY;

    // Soft orange glow behind the fire (additive blend for bloom feel)
    this.glow = scene.add
      .image(0, 0, FRAME_KEYS[0])
      .setOrigin(0.5)
      .setDepth(SCENE_DEPTHS.object - 1)
      .setTint(0xff4400)
      .setAlpha(0.28)
      .setBlendMode(Phaser.BlendModes.ADD);

    // Main animated fire sprite
    this.sprite = scene.add
      .image(0, 0, FRAME_KEYS[0])
      .setOrigin(0.5)
      .setDepth(SCENE_DEPTHS.object);

    this.animTimer = scene.time.addEvent({
      delay: FRAME_DURATION,
      callback: this.nextFrame,
      callbackScope: this,
      loop: true,
    });
  }

  private nextFrame(): void {
    this.frameIndex = (this.frameIndex + 1) % FRAME_KEYS.length;
    const key = FRAME_KEYS[this.frameIndex];
    this.sprite.setTexture(key);
    this.glow.setTexture(key);
  }

  public render(tileSize: number, camera: WorldCamera): void {
    const screen = camera.tileToScreen(this.worldX, this.worldY, tileSize);
    const size    = Math.max(12, Math.floor(tileSize * 0.88));
    const glowSz  = Math.floor(size * 2.2);

    this.sprite.setPosition(screen.x, screen.y).setDisplaySize(size, size);
    this.glow.setPosition(screen.x, screen.y).setDisplaySize(glowSz, glowSz);
  }

  /** Called when the player hits the campfire — brief flare-up */
  public onHit(): void {
    this.scene.tweens.killTweensOf(this.sprite);
    this.scene.tweens.add({
      targets: this.sprite,
      scaleX: 2.0,
      scaleY: 2.0,
      duration: 90,
      yoyo: true,
      ease: 'Power2.easeOut',
    });
    this.scene.tweens.killTweensOf(this.glow);
    this.scene.tweens.add({
      targets: this.glow,
      alpha: 0.65,
      duration: 90,
      yoyo: true,
    });
  }

  public destroy(): void {
    this.animTimer.destroy();
    this.sprite.destroy();
    this.glow.destroy();
  }
}
