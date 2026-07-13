import Phaser from 'phaser';

import { ySortDepth } from '@/game/constants';
import { Billboard3D } from '@/game/render3d/Billboard3D';
import { world3d } from '@/game/render3d/World3D';
import type { WorldCamera } from '@/game/runtime/WorldCamera';

// A rock blocks its tile until the hero breaks it with the pickaxe: the first hit cracks it
// (swaps to the cracked sprite), the second shatters it — a few grey shards fly out and the
// tile opens. Collision is owned here (see `blocking`), like the other runtime props.

type RockState = 'intact' | 'cracked' | 'broken';

export class RockObject {
  public readonly worldX: number;
  public readonly worldY: number;

  private readonly scene: Phaser.Scene;
  private readonly sprite: Billboard3D;
  private state: RockState = 'intact';
  // Last projected screen position — anchors the Phaser-side shard FX to the 3D rock.
  private lastScreen = { x: 0, y: 0 };

  public constructor(scene: Phaser.Scene, worldX: number, worldY: number) {
    this.scene = scene;
    this.worldX = worldX;
    this.worldY = worldY;
    this.sprite = world3d()
      .addBillboard('rock', 0, { groundShadow: true })
      .setPosition(worldX, worldY)
      .setDisplaySize(0.88, 0.88);
  }

  public get blocking(): boolean {
    return this.state !== 'broken';
  }

  /** One pickaxe hit. Returns true if it landed (rock still stood). */
  public smash(tileSize: number): boolean {
    if (!this.blocking) return false;

    if (this.state === 'intact') {
      this.state = 'cracked';
      this.sprite.setTexture('rock-cracked');
      this.shake();
      return true;
    }

    this.state = 'broken';
    this.spawnShards(tileSize);
    this.sprite.setVisible(false);
    return true;
  }

  /** Brief shake for a bump without the pickaxe, so it reads as solid. */
  public shake(): void {
    if (!this.blocking) return;
    this.scene.tweens.killTweensOf(this.sprite);
    this.sprite.setAngle(0);
    this.scene.tweens.add({
      targets: this.sprite,
      angle: { from: -3, to: 3 },
      duration: 50,
      yoyo: true,
      repeat: 1,
      ease: 'Sine.easeInOut',
      onComplete: () => this.sprite.setAngle(0),
    });
  }

  private spawnShards(tileSize: number): void {
    // Little grey chips scatter from the rock's screen spot and fade (2D overlay FX).
    const { x, y } = this.lastScreen;
    for (let i = 0; i < 5; i += 1) {
      const size = Math.max(2, Math.floor(tileSize * Phaser.Math.FloatBetween(0.08, 0.16)));
      const shard = this.scene.add
        .rectangle(x, y, size, size, 0x9a9a9a)
        .setDepth(ySortDepth(this.worldY) + 0.1);
      this.scene.tweens.add({
        targets: shard,
        x: x + Phaser.Math.Between(-tileSize, tileSize) * 0.55,
        y: y + Phaser.Math.Between(-tileSize * 0.5, tileSize * 0.35),
        alpha: 0,
        angle: Phaser.Math.Between(-180, 180),
        duration: Phaser.Math.Between(260, 420),
        ease: 'Power2.easeOut',
        onComplete: () => shard.destroy(),
      });
    }
  }

  public render(tileSize: number, camera: WorldCamera): void {
    if (this.state === 'broken') return;
    this.lastScreen = camera.tileToScreen(this.worldX, this.worldY, tileSize);
  }

  public destroy(): void {
    this.scene.tweens.killTweensOf(this.sprite);
    this.sprite.destroy();
  }
}
