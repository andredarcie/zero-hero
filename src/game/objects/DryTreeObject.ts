import type Phaser from 'phaser';

import { TREE_REGROW_MS } from '@/game/constants';
import { Billboard3D } from '@/game/render3d/Billboard3D';
import { world3d } from '@/game/render3d/World3D';
import type { WorldCamera } from '@/game/runtime/WorldCamera';

// A dry tree ("árvore seca") blocks its tile until the hero chops it down with the axe.
// Each chop advances one frame of the woods.png sheet — the tree visibly shrinks stage by
// stage — and it ends on a small passable stump. A felled tree GROWS BACK after TREE_REGROW_MS
// so the player can never run out of gravetos (fire fuel) and soft-lock. Collision is owned
// here (see `blocking`) and resolved at runtime, exactly like DryBushObject.

// woods.png frame 4 is the clean little stump the hero walks over. Frame 5 (a pile of three
// loose logs) is deliberately skipped — it reads as three stray sticks, not a chopped stump.
const STUMP_FRAME = 4;

export class DryTreeObject {
  public readonly worldX: number;
  public readonly worldY: number;

  private readonly scene: Phaser.Scene;
  private readonly sprite: Billboard3D;
  private stage = 0;
  private regrowMs = -1; // < 0 = not regrowing (standing tree or freshly chopped-and-waiting)

  public constructor(scene: Phaser.Scene, worldX: number, worldY: number) {
    this.scene = scene;
    this.worldX = worldX;
    this.worldY = worldY;
    this.sprite = world3d()
      .addBillboard('dry-tree', 0, { groundShadow: true })
      .setPosition(worldX, worldY)
      .setDisplaySize(0.95, 0.95);
  }

  /** The tile is impassable until the tree is chopped down to its stump. */
  public get blocking(): boolean {
    return this.stage < STUMP_FRAME;
  }

  /** One axe chop: shrink a stage. Returns true if the chop landed (tree still standing). */
  public chop(): boolean {
    if (!this.blocking) return false;
    this.stage += 1;
    this.sprite.setTexture('dry-tree', this.stage);
    if (!this.blocking) this.regrowMs = TREE_REGROW_MS; // just felled — start the regrow clock

    // Recoil so the hit reads: quick sideways shudder plus a squash on the new stage.
    this.scene.tweens.killTweensOf(this.sprite);
    this.sprite.setAngle(0);
    this.scene.tweens.add({
      targets: this.sprite,
      angle: { from: -7, to: 7 },
      duration: 55,
      yoyo: true,
      repeat: 1,
      ease: 'Sine.easeInOut',
      onComplete: () => this.sprite.setAngle(0),
    });
    return true;
  }

  // A tree that toppled into a bridge (TIMBER!) is spent — its trunk became the crossing, so
  // it never grows back (unlike a normally-chopped tree).
  public cancelRegrow(): void {
    this.regrowMs = -1;
  }

  // Tick the regrow clock on a felled tree. `tileClear` (from GameScene) is false whenever the
  // tile is occupied — by the hero, an enemy, OR an item sitting on it (e.g. the graveto the
  // tree just dropped). The clock only counts down while the tile is clear, so the timer truly
  // starts only once that item is picked up. Returns true when it's ready AND clear to sprout,
  // so it never grows over the player, an enemy, or a dropped item.
  public updateRegrow(deltaMs: number, tileClear: boolean): boolean {
    if (this.regrowMs < 0 || this.blocking || !tileClear) return false;
    if (this.regrowMs > 0) this.regrowMs -= deltaMs;
    return this.regrowMs <= 0;
  }

  /** Grow the felled stump back into a full standing tree (with a little sway-in). */
  public regrow(): void {
    this.stage = 0;
    this.regrowMs = -1;
    this.sprite.setTexture('dry-tree', 0);
    this.scene.tweens.killTweensOf(this.sprite);
    this.sprite.setAngle(0).setAlpha(0);
    this.scene.tweens.add({ targets: this.sprite, alpha: 1, duration: 320, ease: 'Cubic.easeOut' });
    this.scene.tweens.add({
      targets: this.sprite,
      angle: { from: -7, to: 7 },
      duration: 90,
      yoyo: true,
      repeat: 2,
      ease: 'Sine.easeInOut',
      onComplete: () => this.sprite.setAngle(0),
    });
  }

  /** Brief shake for a bump without the axe, so it reads as solid. */
  public shake(): void {
    if (!this.blocking) return;
    this.scene.tweens.killTweensOf(this.sprite);
    this.scene.tweens.add({
      targets: this.sprite,
      angle: { from: -4, to: 4 },
      duration: 60,
      yoyo: true,
      repeat: 1,
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
