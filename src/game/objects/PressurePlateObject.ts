import type Phaser from 'phaser';

import { ASSET_KEYS, PRESSURE_PLATE_FRAMES } from '@/game/constants';
import { Billboard3D } from '@/game/render3d/Billboard3D';
import { world3d } from '@/game/render3d/World3D';

/** Walkable floor mechanism; GameScene supplies occupancy and combines linked plates by OR. */
export class PressurePlateObject {
  public readonly worldX: number;
  public readonly worldY: number;
  public readonly variable?: string;
  public pressed = false;

  private readonly sprite: Billboard3D;

  public constructor(_scene: Phaser.Scene, worldX: number, worldY: number, variable?: string) {
    this.worldX = worldX;
    this.worldY = worldY;
    this.variable = variable;
    this.sprite = world3d()
      .addBillboard(ASSET_KEYS.pressurePlate, PRESSURE_PLATE_FRAMES.up, { flat: true, flatY: 0.026, depthLayer: 'ground' })
      .setPosition(worldX, worldY)
      .setDisplaySize(0.78, 0.78);
  }

  public setPressed(pressed: boolean): void {
    if (this.pressed === pressed) return;
    this.pressed = pressed;
    this.sprite.setTexture(
      ASSET_KEYS.pressurePlate,
      pressed ? PRESSURE_PLATE_FRAMES.down : PRESSURE_PLATE_FRAMES.up,
    );
  }

  public destroy(): void {
    this.sprite.destroy();
  }
}
