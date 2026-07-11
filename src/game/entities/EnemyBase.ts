import Phaser from 'phaser';

import { SCENE_DEPTHS, ySortDepth } from '@/game/constants';
import type { WorldCamera } from '@/game/runtime/WorldCamera';

export abstract class EnemyBase {
  public worldX: number;
  public worldY: number;
  public pendingRemoval = false;

  private health: number;
  private readonly maxHealth: number;
  private alive = true;
  private knockbackOffsetX = 0;
  private knockbackOffsetY = 0;
  private knockbackSquash = 1.0;

  protected readonly scene: Phaser.Scene;
  protected readonly sprite: Phaser.GameObjects.Image | Phaser.GameObjects.Sprite;
  private readonly healthBar: Phaser.GameObjects.Graphics;

  /** Override to return the hurt texture key; if defined, flashes on takeDamage */
  protected hurtTexture?: string;

  /** Subclasses can hide the health bar (e.g. while the spawn animation plays). */
  protected healthBarVisible = true;

  /** Override to return the normal texture key used to restore after hurt flash */
  protected abstract get normalTexture(): string;

  /** Override to control display scale (default 1.0) */
  protected get spriteScale(): number {
    return 1.0;
  }

  public constructor(
    scene: Phaser.Scene,
    worldX: number,
    worldY: number,
    maxHealth: number,
    sprite: Phaser.GameObjects.Image | Phaser.GameObjects.Sprite,
  ) {
    this.scene = scene;
    this.worldX = worldX;
    this.worldY = worldY;
    this.maxHealth = maxHealth;
    this.health = maxHealth;
    this.sprite = sprite;
    this.healthBar = scene.add.graphics().setDepth(SCENE_DEPTHS.player + 2);
  }

  public get isAlive(): boolean {
    return this.alive;
  }

  /** Apply damage (default 1). Weak weapons pass fractions — e.g. the wood club deals 0.5. */
  public takeDamage(amount = 1): boolean {
    if (!this.alive) return false;
    this.health -= amount;

    if (this.hurtTexture) {
      this.sprite.setTexture(this.hurtTexture);
      this.scene.time.delayedCall(150, () => {
        if (this.alive) {
          this.sprite.setTexture(this.normalTexture);
        }
      });
    }

    if (this.health <= 0) {
      this.die();
      return true;
    }
    return false;
  }

  public abstract update(
    delta: number,
    playerX: number,
    playerY: number,
    playerSafe: boolean,
    isBlocked: (wx: number, wy: number) => boolean,
  ): boolean;

  public triggerKnockback(dx: number, dy: number, tileSize: number): void {
    if (!this.alive) return;
    this.scene.tweens.killTweensOf(this);
    this.knockbackOffsetX = dx * tileSize * 0.38;
    this.knockbackOffsetY = dy * tileSize * 0.38;
    this.knockbackSquash = 0.78;
    this.scene.tweens.add({
      targets: this,
      knockbackOffsetX: 0,
      knockbackOffsetY: 0,
      knockbackSquash: 1.0,
      duration: 230,
      ease: 'Power3.easeOut',
    });
  }

  public render(tileSize: number, camera: WorldCamera): void {
    if (!this.alive) return;

    const screen = camera.tileToScreen(this.worldX, this.worldY, tileSize);
    const scale = this.spriteScale * this.knockbackSquash;
    const sx = screen.x + this.knockbackOffsetX;
    const sy = screen.y + this.knockbackOffsetY;

    this.sprite
      .setPosition(sx, sy)
      .setDisplaySize(tileSize * scale, tileSize * scale)
      .setDepth(ySortDepth(this.worldY));

    // Enemy health bars are intentionally not drawn (removed by design). The graphics object is
    // kept (and cleared) so nothing else has to change; it just never fills.
    this.healthBar.clear();
  }

  public destroy(): void {
    if (this.scene.tweens) {
      this.scene.tweens.killTweensOf(this.sprite);
      this.scene.tweens.killTweensOf(this);
    }
    this.sprite.destroy();
    this.healthBar.destroy();
  }

  protected die(): void {
    this.alive = false;
    this.healthBar.clear();
    this.onDeath();
    this.scene.tweens.add({
      targets: this.sprite,
      alpha: 0,
      scaleX: 0.1,
      scaleY: 0.1,
      duration: 280,
      ease: 'Power2.easeIn',
      onComplete: () => {
        this.sprite.setVisible(false);
        this.pendingRemoval = true;
      },
    });
  }

  /** Override to add death effects (pool, spawn, etc.) */
  protected onDeath(): void {
    // no-op by default
  }

  /**
   * Quiet removal (no loot, no onDeath): the undead crumbles back into the ground when the
   * hero reaches a campfire's safety. Distinct from die(), which is a combat kill.
   */
  public despawn(): void {
    if (!this.alive) return;
    this.alive = false;
    this.healthBar.clear();
    this.scene.tweens.add({
      targets: this.sprite,
      alpha: 0,
      y: this.sprite.y + this.sprite.displayHeight * 0.35,
      duration: 420,
      ease: 'Power2.easeIn',
      onComplete: () => {
        this.sprite.setVisible(false);
        this.pendingRemoval = true;
      },
    });
  }

  protected moveToward(
    targetX: number,
    targetY: number,
    isBlocked: (wx: number, wy: number) => boolean,
  ): void {
    const dx = targetX - this.worldX;
    const dy = targetY - this.worldY;

    const primary: [number, number] = Math.abs(dx) >= Math.abs(dy)
      ? [Math.sign(dx), 0]
      : [0, Math.sign(dy)];
    const secondary: [number, number] = Math.abs(dx) >= Math.abs(dy)
      ? [0, Math.sign(dy)]
      : [Math.sign(dx), 0];

    for (const [ox, oy] of [primary, secondary]) {
      const nx = this.worldX + ox;
      const ny = this.worldY + oy;
      if (ox === 0 && oy === 0) continue;
      if (!isBlocked(nx, ny)) {
        this.worldX = nx;
        this.worldY = ny;
        this.sprite.setFlipX(ox < 0);
        return;
      }
    }
  }

  protected moveAway(
    fromX: number,
    fromY: number,
    isBlocked: (wx: number, wy: number) => boolean,
  ): void {
    const dx = this.worldX - fromX;
    const dy = this.worldY - fromY;

    const primary: [number, number] = Math.abs(dx) >= Math.abs(dy)
      ? [Math.sign(dx) || 1, 0]
      : [0, Math.sign(dy) || 1];
    const secondary: [number, number] = Math.abs(dx) >= Math.abs(dy)
      ? [0, Math.sign(dy) || 1]
      : [Math.sign(dx) || 1, 0];

    for (const [ox, oy] of [primary, secondary]) {
      const nx = this.worldX + ox;
      const ny = this.worldY + oy;
      if (!isBlocked(nx, ny)) {
        this.worldX = nx;
        this.worldY = ny;
        this.sprite.setFlipX(ox < 0);
        return;
      }
    }
  }

  protected wander(isBlocked: (wx: number, wy: number) => boolean): void {
    const dirs: Array<[number, number]> = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    const [ox, oy] = dirs[Phaser.Math.Between(0, 3)];
    const nx = this.worldX + ox;
    const ny = this.worldY + oy;
    if (!isBlocked(nx, ny)) {
      this.worldX = nx;
      this.worldY = ny;
    }
  }
}
