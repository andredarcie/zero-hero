import Phaser from 'phaser';

import { ASSET_KEYS, SCENE_DEPTHS } from '@/game/constants';
import type { WorldCamera } from '@/game/runtime/WorldCamera';

export class Coin {
  private readonly sprite: Phaser.GameObjects.Image;
  private readonly pos: { x: number; y: number; angle: number };
  private collectable = false;
  private collected = false;

  public constructor(
    private readonly scene: Phaser.Scene,
    startWorldX: number,
    startWorldY: number,
    targetWorldX: number,
    targetWorldY: number,
    spawnDelay: number,
  ) {
    this.pos = { x: startWorldX, y: startWorldY, angle: 0 };

    this.sprite = scene.add
      .image(0, 0, ASSET_KEYS.coin)
      .setOrigin(0.5)
      .setDepth(SCENE_DEPTHS.item)
      .setScale(0)
      .setAlpha(0);

    scene.tweens.add({
      targets: this.sprite,
      scale: 1,
      alpha: 1,
      duration: 120,
      delay: spawnDelay,
      ease: 'Back.easeOut',
      onComplete: () => this.startScatter(targetWorldX, targetWorldY, spawnDelay),
    });
  }

  public get tileX(): number { return Math.round(this.pos.x); }
  public get tileY(): number { return Math.round(this.pos.y); }
  public get isCollectable(): boolean { return this.collectable; }
  public get isCollected(): boolean { return this.collected; }

  public collect(hudTarget: { x: number; y: number }, onComplete: () => void): void {
    this.collected = true;
    this.collectable = false;

    this.scene.tweens.killTweensOf(this.pos);
    this.scene.tweens.killTweensOf(this.sprite);

    this.scene.tweens.add({
      targets: this.sprite,
      scaleX: 1.6,
      scaleY: 1.6,
      duration: 80,
      ease: 'Power2.easeOut',
      yoyo: true,
      onComplete: () => {
        this.scene.tweens.add({
          targets: this.sprite,
          x: hudTarget.x,
          y: hudTarget.y,
          scaleX: 0.4,
          scaleY: 0.4,
          alpha: 0.8,
          duration: 280,
          ease: 'Power3.easeIn',
          onComplete: () => {
            this.sprite.setVisible(false);
            onComplete();
          },
        });
      },
    });
  }

  public render(tileSize: number, camera: WorldCamera): void {
    if (this.collected) return;

    const screen = camera.tileToScreen(this.pos.x, this.pos.y, tileSize);
    const bob = this.collectable
      ? Math.sin(this.scene.time.now * 0.005) * Math.max(1, tileSize * 0.08)
      : 0;
    const size = Math.max(8, Math.floor(tileSize * 0.55));

    this.sprite
      .setPosition(screen.x, screen.y + bob)
      .setAngle(this.pos.angle)
      .setDisplaySize(size, size);
  }

  public destroy(): void {
    this.scene.tweens.killTweensOf(this.pos);
    this.scene.tweens.killTweensOf(this.sprite);
    this.sprite.destroy();
  }

  private startScatter(targetWorldX: number, targetWorldY: number, delay: number): void {
    const spinDir = Math.random() > 0.5 ? 1 : -1;
    const midY = (this.pos.y + targetWorldY) / 2 - 1.5;

    this.scene.tweens.add({
      targets: this.pos,
      x: targetWorldX,
      y: midY,
      angle: spinDir * 180,
      duration: 180,
      delay,
      ease: 'Power2.easeOut',
      onComplete: () => {
        this.scene.tweens.add({
          targets: this.pos,
          y: targetWorldY,
          angle: spinDir * 360,
          duration: 220,
          ease: 'Bounce.easeOut',
          onComplete: () => {
            this.pos.angle = 0;
            this.collectable = true;
            this.scene.tweens.add({
              targets: this.sprite,
              scaleX: 1.3,
              scaleY: 1.3,
              duration: 100,
              yoyo: true,
              ease: 'Power2.easeOut',
            });
          },
        });
      },
    });
  }
}
