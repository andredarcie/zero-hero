import Phaser from 'phaser';

import { ANIMATION_KEYS, HERO_FRAMES, TIMINGS } from '@/game/constants';
import type { WorldCamera } from './WorldCamera';

export class PlayerMovementController {
  private readonly cursors: Phaser.Types.Input.Keyboard.CursorKeys | undefined;
  private readonly swipeThresholdPx = 24;
  private isMoving = false;
  private moveDuration: number = TIMINGS.moveDurationMs;
  private touchStart: { pointerId: number; x: number; y: number } | null = null;
  private queuedMove: { dx: number; dy: number } | null = null;

  public constructor(
    private readonly scene: Phaser.Scene,
    private readonly player: Phaser.GameObjects.Sprite,
    private readonly camera: WorldCamera,
    private readonly isBlockedCell: (worldX: number, worldY: number) => boolean,
    private readonly onStep: (worldX: number, worldY: number) => void,
    private readonly onBumpBlocked?: (worldX: number, worldY: number) => void,
  ) {
    this.cursors = scene.input.keyboard?.createCursorKeys();
    this.scene.input.on(Phaser.Input.Events.POINTER_DOWN, this.handlePointerDown, this);
    this.scene.input.on(Phaser.Input.Events.POINTER_MOVE, this.handlePointerMove, this);
    this.scene.input.on(Phaser.Input.Events.POINTER_UP, this.handlePointerUpOrCancel, this);
    this.scene.input.on(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.handlePointerUpOrCancel, this);
  }

  public update(worldX: number, worldY: number): { worldX: number; worldY: number } {
    if (this.isMoving) {
      return { worldX, worldY };
    }

    if (this.queuedMove) {
      const { dx, dy } = this.queuedMove;
      this.queuedMove = null;
      return this.tryMove(worldX, worldY, dx, dy);
    }

    if (this.cursors && Phaser.Input.Keyboard.JustDown(this.cursors.left)) {
      return this.tryMove(worldX, worldY, -1, 0);
    }
    if (this.cursors && Phaser.Input.Keyboard.JustDown(this.cursors.right)) {
      return this.tryMove(worldX, worldY, 1, 0);
    }
    if (this.cursors && Phaser.Input.Keyboard.JustDown(this.cursors.up)) {
      return this.tryMove(worldX, worldY, 0, -1);
    }
    if (this.cursors && Phaser.Input.Keyboard.JustDown(this.cursors.down)) {
      return this.tryMove(worldX, worldY, 0, 1);
    }

    return { worldX, worldY };
  }

  public setMoveDuration(ms: number): void {
    this.moveDuration = ms;
  }

  public syncPlayerToScreen(): void {
    this.player.setPosition(this.camera.screenCenterX, this.camera.screenCenterY);
  }

  public get moving(): boolean {
    return this.isMoving;
  }

  private handlePointerDown(pointer: Phaser.Input.Pointer): void {
    this.touchStart = { pointerId: pointer.id, x: pointer.x, y: pointer.y };
  }

  private handlePointerMove(pointer: Phaser.Input.Pointer): void {
    if (!pointer.isDown || !this.touchStart || this.touchStart.pointerId !== pointer.id || this.queuedMove || this.isMoving) {
      return;
    }
    const swipeMove = this.resolveSwipe(pointer.x - this.touchStart.x, pointer.y - this.touchStart.y);
    if (!swipeMove) return;
    this.queuedMove = swipeMove;
    this.touchStart = null;
  }

  private handlePointerUpOrCancel(pointer: Phaser.Input.Pointer): void {
    if (!this.touchStart || this.touchStart.pointerId !== pointer.id) return;
    if (!this.queuedMove && !this.isMoving) {
      this.queuedMove = this.resolveSwipe(pointer.x - this.touchStart.x, pointer.y - this.touchStart.y);
    }
    this.touchStart = null;
  }

  private resolveSwipe(deltaX: number, deltaY: number): { dx: number; dy: number } | null {
    const absX = Math.abs(deltaX);
    const absY = Math.abs(deltaY);
    if (absX < this.swipeThresholdPx && absY < this.swipeThresholdPx) return null;
    if (absX >= absY) return { dx: deltaX >= 0 ? 1 : -1, dy: 0 };
    return { dx: 0, dy: deltaY >= 0 ? 1 : -1 };
  }

  private tryMove(worldX: number, worldY: number, dx: number, dy: number): { worldX: number; worldY: number } {
    const nextX = worldX + dx;
    const nextY = worldY + dy;

    if (this.isBlockedCell(nextX, nextY)) {
      this.onBumpBlocked?.(nextX, nextY);
      return { worldX, worldY };
    }

    this.isMoving = true;
    this.onStep(nextX, nextY);

    if (dy < 0) {
      this.player.anims.stop();
      this.player.setFrame(HERO_FRAMES.idleUp);
    } else if (dy > 0) {
      this.player.anims.stop();
      this.player.setFrame(HERO_FRAMES.idleDown);
    } else {
      this.player.play(ANIMATION_KEYS.heroWalk, true);
      this.player.setFlipX(dx < 0);
    }

    this.scene.tweens.add({
      targets: this.camera,
      worldX: nextX,
      worldY: nextY,
      duration: this.moveDuration,
      ease: 'Steps(4)',
      onComplete: () => {
        this.player.anims.stop();
        this.player.setFrame(HERO_FRAMES.idleDown);
        this.isMoving = false;
      },
    });

    return { worldX: nextX, worldY: nextY };
  }
}
