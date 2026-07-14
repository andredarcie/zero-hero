import type Phaser from 'phaser';

import { Billboard3D } from '@/game/render3d/Billboard3D';
import { world3d } from '@/game/render3d/World3D';
import type { WorldCamera } from '@/game/runtime/WorldCamera';

// A locked door prop. It blocks its tile until the hero bumps it while holding a key, which
// opens it for good. Like DryBushObject, its collision lives here (see `blocking`) and is
// resolved at runtime, not baked into the collision grid. Uses the existing locked_door tile.
export class LockedDoorObject {
  public readonly worldX: number;
  public readonly worldY: number;

  private readonly scene: Phaser.Scene;
  private readonly sprite: Billboard3D;
  private open = false;

  public constructor(scene: Phaser.Scene, worldX: number, worldY: number) {
    this.scene = scene;
    this.worldX = worldX;
    this.worldY = worldY;
    this.sprite = world3d()
      .addBillboard('locked-door-object', 0, { groundShadow: true })
      .setPosition(worldX, worldY)
      .setDisplaySize(0.98, 0.98)
      // Same treatment as the rocks: the door's white bars bloomed under the night
      // ambient. Neutral so the bars stay white — only the glow goes, not the colour.
      .setTint(0xcfcfcf);
  }

  /** The tile is impassable while the door is shut. */
  public get blocking(): boolean {
    return !this.open;
  }

  public get isOpen(): boolean {
    return this.open;
  }

  /** Open the door (key consumed by the caller); only a shut door can open. */
  public unlock(): boolean {
    if (this.open) return false;
    this.open = true;
    // Swing open: fold thin and fade to a faint frame so the doorway reads as passable.
    this.scene.tweens.killTweensOf(this.sprite);
    this.scene.tweens.add({
      targets: this.sprite,
      scaleX: 0.2,
      alpha: 0.25,
      duration: 260,
      ease: 'Back.easeIn',
    });
    return true;
  }

  /** Brief shake so bumping the shut door (without a key) reads as a solid obstacle. */
  public shake(): void {
    if (this.open) return;
    this.scene.tweens.killTweensOf(this.sprite);
    this.scene.tweens.add({
      targets: this.sprite,
      angle: { from: -5, to: 5 },
      duration: 55,
      yoyo: true,
      repeat: 2,
      ease: 'Sine.easeInOut',
      onComplete: () => this.sprite.setAngle(0),
    });
  }

  public render(_tileSize: number, _camera: WorldCamera): void {
    // Static in world space — the 3D camera does the moving now.
  }

  public destroy(): void {
    this.scene.tweens.killTweensOf(this.sprite);
    this.sprite.destroy();
  }
}
