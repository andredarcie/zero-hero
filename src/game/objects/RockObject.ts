import Phaser from 'phaser';

import { ASSET_KEYS, ySortDepth } from '@/game/constants';
import type { WorldCamera } from '@/game/runtime/WorldCamera';

// A rock blocks its tile until the hero breaks it with the pickaxe: the first hit cracks it
// (swaps to the cracked sprite), the second shatters it — a few grey shards fly out and the
// tile opens. Collision is owned here (see `blocking`), like the other runtime props.

type RockState = 'intact' | 'cracked' | 'broken';

export class RockObject {
  public readonly worldX: number;
  public readonly worldY: number;

  private readonly scene: Phaser.Scene;
  private readonly sprite: Phaser.GameObjects.Image;
  private state: RockState = 'intact';

  public constructor(scene: Phaser.Scene, worldX: number, worldY: number) {
    this.scene = scene;
    this.worldX = worldX;
    this.worldY = worldY;
    this.sprite = scene.add
      .image(0, 0, ASSET_KEYS.rock)
      .setOrigin(0.5)
      .setDepth(ySortDepth(worldY));
  }

  public get blocking(): boolean {
    return this.state !== 'broken';
  }

  /** The sprite to cast a firelight shadow from while the rock still stands (null once broken). */
  public get shadowCaster(): Phaser.GameObjects.Sprite | Phaser.GameObjects.Image | null {
    return this.blocking ? this.sprite : null;
  }

  /** One pickaxe hit. Returns true if it landed (rock still stood). */
  public smash(tileSize: number): boolean {
    if (!this.blocking) return false;

    if (this.state === 'intact') {
      this.state = 'cracked';
      this.sprite.setTexture(ASSET_KEYS.rockCracked);
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
      x: this.sprite.x,
      angle: { from: -3, to: 3 },
      duration: 50,
      yoyo: true,
      repeat: 1,
      ease: 'Sine.easeInOut',
      onComplete: () => this.sprite.setAngle(0),
    });
  }

  private spawnShards(tileSize: number): void {
    // Little grey chips scatter from the rock's spot and fade.
    const { x, y } = this.sprite;
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
    const screen = camera.tileToScreen(this.worldX, this.worldY, tileSize);
    const size = Math.max(12, Math.floor(tileSize * 0.88));
    this.sprite.setPosition(screen.x, screen.y).setDepth(ySortDepth(this.worldY));
    if (this.sprite.displayWidth !== size) this.sprite.setDisplaySize(size, size);
  }

  public destroy(): void {
    this.scene.tweens.killTweensOf(this.sprite);
    this.sprite.destroy();
  }
}
