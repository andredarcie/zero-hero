import Phaser from 'phaser';

import { ANIMATION_KEYS, HERO_FRAMES, TIMINGS } from '@/game/constants';
import type { BoardMetrics, GridCell } from '@/game/shared/grid';
import { clampCell, gridToWorld } from '@/game/shared/grid';

export class PlayerMovementController {
  private readonly cursors: Phaser.Types.Input.Keyboard.CursorKeys | undefined;
  private isMoving = false;

  public constructor(
    private readonly scene: Phaser.Scene,
    private readonly player: Phaser.GameObjects.Sprite,
    private readonly isBlockedCell: (column: number, row: number) => boolean,
    private readonly onStep: (column: number, row: number) => void,
  ) {
    this.cursors = scene.input.keyboard?.createCursorKeys();
  }

  public update(position: GridCell, metrics: BoardMetrics): GridCell {
    if (this.isMoving || !this.cursors) {
      return position;
    }

    if (Phaser.Input.Keyboard.JustDown(this.cursors.left)) {
      return this.tryMove(position, metrics, -1, 0);
    }

    if (Phaser.Input.Keyboard.JustDown(this.cursors.right)) {
      return this.tryMove(position, metrics, 1, 0);
    }

    if (Phaser.Input.Keyboard.JustDown(this.cursors.up)) {
      return this.tryMove(position, metrics, 0, -1);
    }

    if (Phaser.Input.Keyboard.JustDown(this.cursors.down)) {
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
