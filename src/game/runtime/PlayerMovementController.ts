import Phaser from 'phaser';

import { ANIMATION_KEYS, HERO_FRAMES, TIMINGS } from '@/game/constants';
import type { BoardMetrics, GridCell } from '@/game/shared/grid';
import { clampCell, gridToWorld } from '@/game/shared/grid';

export class PlayerMovementController {
  private readonly cursors: Phaser.Types.Input.Keyboard.CursorKeys | undefined;
  private readonly swipeThresholdPx = 24;
  private isMoving = false;
  private touchStart: { pointerId: number; x: number; y: number } | null = null;
  private queuedMove: { deltaColumn: number; deltaRow: number } | null = null;

  public constructor(
    private readonly scene: Phaser.Scene,
    private readonly player: Phaser.GameObjects.Sprite,
    private readonly isBlockedCell: (column: number, row: number) => boolean,
    private readonly onStep: (column: number, row: number) => void,
  ) {
    this.cursors = scene.input.keyboard?.createCursorKeys();
    this.scene.input.on(Phaser.Input.Events.POINTER_DOWN, this.handlePointerDown, this);
    this.scene.input.on(Phaser.Input.Events.POINTER_MOVE, this.handlePointerMove, this);
    this.scene.input.on(Phaser.Input.Events.POINTER_UP, this.handlePointerUpOrCancel, this);
    this.scene.input.on(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.handlePointerUpOrCancel, this);
  }

  public update(position: GridCell, metrics: BoardMetrics): GridCell {
    if (this.isMoving) {
      return position;
    }

    if (this.queuedMove) {
      const { deltaColumn, deltaRow } = this.queuedMove;
      this.queuedMove = null;
      return this.tryMove(position, metrics, deltaColumn, deltaRow);
    }

    if (this.cursors && Phaser.Input.Keyboard.JustDown(this.cursors.left)) {
      return this.tryMove(position, metrics, -1, 0);
    }

    if (this.cursors && Phaser.Input.Keyboard.JustDown(this.cursors.right)) {
      return this.tryMove(position, metrics, 1, 0);
    }

    if (this.cursors && Phaser.Input.Keyboard.JustDown(this.cursors.up)) {
      return this.tryMove(position, metrics, 0, -1);
    }

    if (this.cursors && Phaser.Input.Keyboard.JustDown(this.cursors.down)) {
      return this.tryMove(position, metrics, 0, 1);
    }

    return position;
  }

  public syncPlayerToGrid(position: GridCell, metrics: BoardMetrics): GridCell {
    const clamped = clampCell(position, metrics);
    const world = gridToWorld(clamped.column, clamped.row, metrics);
    this.player.setPosition(world.x, world.y);
    return clamped;
  }

  public get moving(): boolean {
    return this.isMoving;
  }

  private handlePointerDown(pointer: Phaser.Input.Pointer): void {
    this.touchStart = {
      pointerId: pointer.id,
      x: pointer.x,
      y: pointer.y,
    };
  }

  private handlePointerMove(pointer: Phaser.Input.Pointer): void {
    if (!pointer.isDown || !this.touchStart || this.touchStart.pointerId !== pointer.id || this.queuedMove || this.isMoving) {
      return;
    }

    const swipeMove = this.resolveSwipe(pointer.x - this.touchStart.x, pointer.y - this.touchStart.y);

    if (!swipeMove) {
      return;
    }

    this.queuedMove = swipeMove;
    this.touchStart = null;
  }

  private handlePointerUpOrCancel(pointer: Phaser.Input.Pointer): void {
    if (!this.touchStart || this.touchStart.pointerId !== pointer.id) {
      return;
    }

    if (!this.queuedMove && !this.isMoving) {
      this.queuedMove = this.resolveSwipe(pointer.x - this.touchStart.x, pointer.y - this.touchStart.y);
    }

    this.touchStart = null;
  }

  private resolveSwipe(deltaX: number, deltaY: number): { deltaColumn: number; deltaRow: number } | null {
    const horizontalDistance = Math.abs(deltaX);
    const verticalDistance = Math.abs(deltaY);

    if (horizontalDistance < this.swipeThresholdPx && verticalDistance < this.swipeThresholdPx) {
      return null;
    }

    if (horizontalDistance >= verticalDistance) {
      return {
        deltaColumn: deltaX >= 0 ? 1 : -1,
        deltaRow: 0,
      };
    }

    return {
      deltaColumn: 0,
      deltaRow: deltaY >= 0 ? 1 : -1,
    };
  }

  private tryMove(position: GridCell, metrics: BoardMetrics, deltaColumn: number, deltaRow: number): GridCell {
    const next = clampCell({
      column: position.column + deltaColumn,
      row: position.row + deltaRow,
    }, metrics);

    if ((next.column === position.column && next.row === position.row) || this.isBlockedCell(next.column, next.row)) {
      return position;
    }

    this.isMoving = true;
    this.onStep(next.column, next.row);

    if (deltaRow < 0) {
      this.player.anims.stop();
      this.player.setFrame(HERO_FRAMES.idleUp);
    } else if (deltaRow > 0) {
      this.player.anims.stop();
      this.player.setFrame(HERO_FRAMES.idleDown);
    } else {
      this.player.play(ANIMATION_KEYS.heroWalk, true);
      this.player.setFlipX(deltaColumn < 0);
    }

    const world = gridToWorld(next.column, next.row, metrics);
    this.scene.tweens.add({
      targets: this.player,
      x: world.x,
      y: world.y,
      duration: TIMINGS.moveDurationMs,
      ease: 'Steps(4)',
      onComplete: () => {
        this.player.anims.stop();
        this.player.setFrame(HERO_FRAMES.idleDown);
        this.isMoving = false;
      },
    });

    return next;
  }
}
