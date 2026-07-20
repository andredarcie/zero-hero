import type Phaser from 'phaser';

import { ASSET_KEYS } from '@/game/constants';
import { Billboard3D } from '@/game/render3d/Billboard3D';
import { world3d } from '@/game/render3d/World3D';
import type { WorldProp } from './WorldProp';

const PUSH_MS = 115;

/** A world prop, not a held item: walking into it attempts to shove it one cardinal tile. */
export class WoodenCrateObject implements WorldProp {
  public worldX: number;
  public worldY: number;
  public readonly blocking = true;

  private readonly sprite: Billboard3D;

  public constructor(private readonly scene: Phaser.Scene, worldX: number, worldY: number) {
    this.worldX = worldX;
    this.worldY = worldY;
    this.sprite = world3d()
      .addBillboard(ASSET_KEYS.woodenCrate, 0, {
        groundShadow: { rx: 0.4, rz: 0.34, alpha: 0.34 },
      })
      .setPosition(worldX, worldY)
      .setDisplaySize(0.86, 0.86);
  }

  public push(dx: number, dy: number): void {
    this.worldX += dx;
    this.worldY += dy;
    this.scene.tweens.killTweensOf(this.sprite);
    this.scene.tweens.add({
      targets: this.sprite,
      x: this.worldX,
      y: this.worldY,
      duration: PUSH_MS,
      ease: 'Quad.easeOut',
    });
  }

  public refusePush(dx: number, dy: number): void {
    this.scene.tweens.killTweensOf(this.sprite);
    this.sprite.setPosition(this.worldX, this.worldY);
    this.scene.tweens.add({
      targets: this.sprite,
      x: this.worldX + dx * 0.08,
      y: this.worldY + dy * 0.08,
      duration: 45,
      yoyo: true,
      ease: 'Sine.easeInOut',
    });
  }

  public destroy(): void {
    this.scene.tweens.killTweensOf(this.sprite);
    this.sprite.destroy();
  }
}
