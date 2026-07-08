import Phaser from 'phaser';

import { ASSET_KEYS, ITEM_FRAMES, SCENE_DEPTHS } from '@/game/constants';

const SLASH_DURATION    = 155;
const SLASH_SWEEP_DEG   = 155;   // wide dramatic arc
const SLASH_HANDLE_FACTOR = 0.26; // handle sits this fraction of tileSize from player center
const SLASH_BLADE_FACTOR  = 1.08; // blade length relative to tileSize
const SLASH_FADE_DURATION = 65;

// Motion-blur trail ghosts — index 0 is closest to the main sprite
const TRAIL_COUNT  = 4;
const TRAIL_ALPHAS = [0.50, 0.30, 0.16, 0.07] as const;
const TRAIL_DEPTH  = SCENE_DEPTHS.player; // behind main sprite

export class SwordSlash {
  private readonly scene: Phaser.Scene;
  private readonly sprite: Phaser.GameObjects.Sprite;
  private readonly trails: Phaser.GameObjects.Sprite[];

  private onFire = false;

  // kept across onUpdate so we don't recalculate each frame
  private slashHandleX = 0;
  private slashHandleY = 0;
  private slashSize    = 0;
  private trailStep    = 0;

  public constructor(scene: Phaser.Scene) {
    this.scene = scene;

    const makeSprite = (depth: number) =>
      scene.add
        .sprite(0, 0, ASSET_KEYS.swordItem, ITEM_FRAMES.swordIdle)
        // pivot at bottom-centre = pommel/handle, blade extends upward
        .setOrigin(0.5, 1.0)
        .setDepth(depth)
        .setAlpha(0)
        .setVisible(false);

    this.sprite = makeSprite(SCENE_DEPTHS.player + 1);
    this.trails = Array.from({ length: TRAIL_COUNT }, () => makeSprite(TRAIL_DEPTH));
  }

  public setOnFire(value: boolean): void {
    this.onFire = value;
  }

  /**
   * dx/dy: cardinal attack direction (-1, 0, or 1). Pass `item` to swing a different sprite
   * (e.g. the key on a door, a tool) with the exact same arc — its own texture/frame, and
   * only burning if the item says so (e.g. the flaming wood club).
   */
  public slash(
    playerScreenX: number,
    playerScreenY: number,
    dx: number,
    dy: number,
    tileSize: number,
    item?: { texture: string; frame: number; onFire?: boolean },
  ): void {
    this.scene.tweens.killTweensOf(this.sprite);
    this.trails.forEach(t => this.scene.tweens.killTweensOf(t));

    // blade points "up" in sprite-space → +90° rotates it to face attack direction
    // Normalize to [-180, 180] so startAngle stays in that range — Phaser's angle
    // getter wraps to [-180, 180], so if startAngle > 180 the tween reads a wrapped
    // value and rotates the long way around (full spin bug on left-facing attacks).
    let attackAngleDeg = Math.atan2(dy, dx) * (180 / Math.PI) + 90;
    if (attackAngleDeg > 180) attackAngleDeg -= 360;
    const startAngle     = attackAngleDeg - SLASH_SWEEP_DEG / 2;
    const endAngle       = attackAngleDeg + SLASH_SWEEP_DEG / 2;

    const handleDist = tileSize * SLASH_HANDLE_FACTOR;
    const size       = Math.max(12, Math.floor(tileSize * SLASH_BLADE_FACTOR));

    // handle stays fixed — only the angle changes
    this.slashHandleX = playerScreenX + dx * handleDist;
    this.slashHandleY = playerScreenY + dy * handleDist;
    this.slashSize    = size;
    this.trailStep    = SLASH_SWEEP_DEG / (TRAIL_COUNT + 2);

    // A custom item burns only when it says so (flaming wood); the bare sword uses the
    // slash animator's own onFire state.
    const onFire = item ? (item.onFire ?? false) : this.onFire;
    const texture = item ? item.texture : (onFire ? ASSET_KEYS.swordOnFire : ASSET_KEYS.swordItem);
    const frame = item ? item.frame : ITEM_FRAMES.swordIdle;

    // hide trails until first onUpdate (they mirror the main sprite's texture/frame)
    const trailTint = onFire ? 0xff5500 : 0xffffff;
    this.trails.forEach(t => t.setTexture(texture, frame).setAlpha(0).setVisible(false).setTint(trailTint));

    this.sprite
      .setTexture(texture, frame)
      .setTint(onFire ? 0xffaa44 : 0xffffff)
      .setPosition(this.slashHandleX, this.slashHandleY)
      .setDisplaySize(size * 1.20, size * 1.20) // starts 20% bigger for impact pop
      .setAngle(startAngle)
      .setAlpha(1)
      .setVisible(true);

    const targetScale = this.sprite.scaleX / 1.20;

    this.scene.tweens.add({
      targets: this.sprite,
      angle:  endAngle,
      scaleX: targetScale,
      scaleY: targetScale,
      duration: SLASH_DURATION,
      ease: 'Power3.easeOut', // fast launch, decelerates into the hit
      onUpdate: () => { this.updateTrails(); },
      onComplete: () => {
        // fade main + trails together
        this.scene.tweens.add({
          targets: [this.sprite, ...this.trails],
          alpha: 0,
          duration: SLASH_FADE_DURATION,
          onComplete: () => {
            this.sprite.setVisible(false);
            this.trails.forEach(t => t.setVisible(false));
          },
        });
      },
    });
  }

  private updateTrails(): void {
    const currentAngle = this.sprite.angle;
    this.trails.forEach((t, i) => {
      t.setPosition(this.slashHandleX, this.slashHandleY)
        .setDisplaySize(this.slashSize, this.slashSize)
        .setAngle(currentAngle - this.trailStep * (i + 1))
        .setAlpha(TRAIL_ALPHAS[i])
        .setVisible(true);
    });
  }

  public destroy(): void {
    this.scene.tweens.killTweensOf(this.sprite);
    this.trails.forEach(t => {
      this.scene.tweens.killTweensOf(t);
      t.destroy();
    });
    this.sprite.destroy();
  }
}
