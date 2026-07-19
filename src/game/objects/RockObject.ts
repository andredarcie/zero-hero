import Phaser from 'phaser';

import { Billboard3D } from '@/game/render3d/Billboard3D';
import { world3d } from '@/game/render3d/World3D';

// A rock blocks its tile until the hero breaks it with the pickaxe: the first blow cracks it
// (swaps to the cracked sprite), the second shatters it and the tile opens. Both blows shove the
// rock off the strike and squash it — a struck stone that only stands there reads as a painted
// backdrop, and the pick as a wand.
//
// The debris the blows throw is NOT here: it belongs to GameScene.spawnRockDebris, because the
// chips are real objects in the 3D world (they arc, they land, they lie there), not a decoration
// hanging off the rock's own sprite.

type RockState = 'intact' | 'cracked' | 'broken';

/** The rock's resting size in tiles — every squash and every collapse springs back to this. */
const SIZE = 0.88;

export class RockObject {
  public readonly worldX: number;
  public readonly worldY: number;

  private readonly scene: Phaser.Scene;
  private readonly sprite: Billboard3D;
  private state: RockState = 'intact';

  public constructor(scene: Phaser.Scene, worldX: number, worldY: number) {
    this.scene = scene;
    this.worldX = worldX;
    this.worldY = worldY;
    this.sprite = world3d()
      .addBillboard('rock', 0, { groundShadow: true })
      .setPosition(worldX, worldY)
      .setDisplaySize(SIZE, SIZE)
      // The rock art is near-white, and a white sprite under the night ambient blows out
      // to a glaring bloom halo (the "neon marble" at the north shrine). A NEUTRAL light
      // grey keeps the hue white — the rock still reads white against the dark — while
      // pulling the peak just under the bloom threshold so it stops glowing. (User: the
      // white must STAY white; only the glow goes.)
      .setTint(0xc9c9c9);
  }

  public get blocking(): boolean {
    return this.state !== 'broken';
  }

  /**
   * One pickaxe blow, landing from direction (dirX, dirY) — the unit vector pointing from the
   * hero INTO the rock. Returns true if it landed (i.e. the rock was still standing).
   */
  public smash(dirX: number, dirY: number): boolean {
    if (!this.blocking) return false;

    if (this.state === 'intact') {
      this.state = 'cracked';
      this.sprite.setTexture('rock-cracked');
      this.recoil(dirX, dirY);
      return true;
    }

    this.state = 'broken';
    this.collapse();
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

  /** The blow lands: the rock is driven back into itself, squats under the pick, and springs out. */
  private recoil(dirX: number, dirY: number): void {
    this.scene.tweens.killTweensOf(this.sprite);
    this.sprite.setAngle(0);
    this.scene.tweens.add({
      targets: this.sprite,
      x: this.worldX + dirX * 0.06,
      y: this.worldY + dirY * 0.06,
      scaleX: SIZE * 1.10, // squashed ALONG the blow: it spreads as it takes the weight
      scaleY: SIZE * 0.86,
      duration: 55,
      ease: 'Quad.easeOut',
      hold: 25, // the beat where the pick is still buried in it
      yoyo: true,
      onComplete: () => {
        this.sprite.setPosition(this.worldX, this.worldY).setDisplaySize(SIZE, SIZE);
      },
    });
  }

  /** The last blow: the rock swells once and bursts, leaving the tile (and its shadow) empty. */
  private collapse(): void {
    this.scene.tweens.killTweensOf(this.sprite);
    this.sprite.setPosition(this.worldX, this.worldY).setAngle(0);
    this.scene.tweens.add({
      targets: this.sprite,
      scaleX: SIZE * 1.14,
      scaleY: SIZE * 1.14,
      duration: 40,
      ease: 'Quad.easeOut',
      onComplete: () => {
        this.scene.tweens.add({
          targets: this.sprite,
          scaleX: 0.04,
          scaleY: 0.04,
          duration: 90,
          ease: 'Back.easeIn',
          onComplete: () => this.sprite.setVisible(false),
        });
      },
    });
    // It must not block for those 130ms of theatre: `state` is already 'broken', and collision
    // reads the state, never the sprite.
  }

  // No render(): the rock is a 3D billboard placed in world space at construction, and its debris
  // now lives in the world too — so, unlike the props that still paint 2D FX on the canvas, it has
  // nothing to re-project when the camera shifts. (The old render() only cached a screen position
  // for the 2D shards, and reprojectStatic is the only thing that ever called it.)

  public destroy(): void {
    this.scene.tweens.killTweensOf(this.sprite);
    this.sprite.destroy();
  }
}
