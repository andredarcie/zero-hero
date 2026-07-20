import type Phaser from 'phaser';

import { Billboard3D } from '@/game/render3d/Billboard3D';
import { world3d } from '@/game/render3d/World3D';
import type { WorldProp } from './WorldProp';

// A small dry shrub ("arbusto seco") — the same bare-brown look as the dry tree but bush-sized.
// It blocks its tile until the hero clears it with the axe. Unlike the tree it drops NOTHING
// (no graveto) and never grows back: it is purely a physical barrier. Collision is owned here
// (see `blocking`) and resolved at runtime, exactly like DryTreeObject.
export class DryShrubObject implements WorldProp {
  public readonly worldX: number;
  public readonly worldY: number;

  private readonly scene: Phaser.Scene;
  private readonly sprite: Billboard3D;
  private cleared = false;

  public constructor(scene: Phaser.Scene, worldX: number, worldY: number) {
    this.scene = scene;
    this.worldX = worldX;
    this.worldY = worldY;
    this.sprite = world3d()
      .addBillboard('dry-shrub', 0, { groundShadow: { alpha: 0.3 } })
      .setPosition(worldX, worldY)
      .setDisplaySize(0.72, 0.72);
  }

  /** Impassable until the axe clears it. */
  public get blocking(): boolean {
    return !this.cleared;
  }

  /** One axe chop clears the shrub for good. Returns true if it just got cleared. */
  public chop(): boolean {
    if (this.cleared) return false;
    this.cleared = true;
    this.scene.tweens.killTweensOf(this.sprite);
    this.scene.tweens.add({
      targets: this.sprite,
      scaleX: 0.01,
      scaleY: 0.01,
      angle: 45,
      alpha: 0,
      duration: 220,
      ease: 'Back.easeIn',
      onComplete: () => this.sprite.setVisible(false),
    });
    return true;
  }

  /** Brief shake for a bump without the axe, so it reads as solid. */
  public shake(): void {
    if (this.cleared) return;
    this.scene.tweens.killTweensOf(this.sprite);
    this.scene.tweens.add({
      targets: this.sprite,
      angle: { from: -5, to: 5 },
      duration: 60,
      yoyo: true,
      repeat: 1,
      ease: 'Sine.easeInOut',
      onComplete: () => this.sprite.setAngle(0),
    });
  }

  public destroy(): void {
    this.scene.tweens.killTweensOf(this.sprite);
    this.sprite.destroy();
  }
}
