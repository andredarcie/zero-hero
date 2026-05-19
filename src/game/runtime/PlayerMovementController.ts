import Phaser from 'phaser';

import { ANIMATION_KEYS, CHUNK_COLUMNS, CHUNK_ROWS, HERO_FRAMES, TIMINGS } from '@/game/constants';
import type { WorldCamera } from './WorldCamera';

const SCROLL_MS_PER_TILE = 20;
const MOVE_EASE = 'Sine.Out';
const SCROLL_EASE = 'Sine.InOut';

export class PlayerMovementController {
  private readonly cursors: Phaser.Types.Input.Keyboard.CursorKeys | undefined;
  private readonly swipeThresholdPx = 24;
  private isMoving = false;
  private moveDuration: number = TIMINGS.moveDurationMs;
  private tileSize = 0;
  private touchStart: { pointerId: number; x: number; y: number } | null = null;
  private queuedMove: { dx: number; dy: number } | null = null;
  private activeTransition?: Phaser.Tweens.TweenChain;

  public constructor(
    private readonly scene: Phaser.Scene,
    private readonly player: Phaser.GameObjects.Sprite,
    private readonly camera: WorldCamera,
    private readonly isBlockedCell: (worldX: number, worldY: number) => boolean,
    private readonly onStep: (worldX: number, worldY: number) => void,
    private readonly onBumpBlocked?: (worldX: number, worldY: number) => void,
    private readonly onScreenTransitionComplete?: (chunkX: number, chunkY: number) => void,
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

  public syncPlayerToWorld(worldX: number, worldY: number, tileSize: number): void {
    this.tileSize = tileSize;
    const screen = this.camera.tileToScreen(worldX, worldY, tileSize);
    this.player.setPosition(screen.x, screen.y);
  }

  public get moving(): boolean {
    return this.isMoving;
  }

  public interruptMovement(worldX: number, worldY: number): void {
    this.activeTransition?.stop();
    this.activeTransition = undefined;
    this.scene.tweens.killTweensOf(this.player);
    this.isMoving = false;
    this.queuedMove = null;
    this.camera.transitioning = false;
    this.syncPlayerToWorld(worldX, worldY, this.tileSize || this.player.displayWidth || this.player.width);
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
    const currentChunkX = Math.floor(worldX / CHUNK_COLUMNS);
    const currentChunkY = Math.floor(worldY / CHUNK_ROWS);
    const nextChunkX = Math.floor(nextX / CHUNK_COLUMNS);
    const nextChunkY = Math.floor(nextY / CHUNK_ROWS);
    const crossesScreen = currentChunkX !== nextChunkX || currentChunkY !== nextChunkY;

    this.setFacing(dx, dy, dx !== 0);

    const tileSize = this.tileSize || this.player.displayWidth || this.player.width;

    if (crossesScreen) {
      this.camera.transitioning = true;
      const exitTarget = this.camera.tileToScreen(nextX, nextY, tileSize);
      const settledTarget = this.getSettledScreenPosition(nextX, nextY, tileSize);
      const startOriginX = this.camera.screenOriginX;
      const startOriginY = this.camera.screenOriginY;
      const nextOriginX = nextChunkX * CHUNK_COLUMNS;
      const nextOriginY = nextChunkY * CHUNK_ROWS;
      const scrollDuration = this.getScrollDurationMs(dx, dy);
      const transitionState = {
        cameraX: startOriginX * tileSize,
        cameraY: startOriginY * tileSize,
        playerX: exitTarget.x,
        playerY: exitTarget.y,
      };

      this.activeTransition?.stop();
      this.activeTransition = this.scene.tweens.chain({
        tweens: [
          {
            targets: this.player,
            x: exitTarget.x,
            y: exitTarget.y,
            duration: this.moveDuration,
            ease: MOVE_EASE,
          },
          {
            targets: transitionState,
            cameraX: nextOriginX * tileSize,
            cameraY: nextOriginY * tileSize,
            playerX: settledTarget.x,
            playerY: settledTarget.y,
            duration: scrollDuration,
            ease: SCROLL_EASE,
            onStart: () => {
              this.setFacing(dx, dy, dx !== 0);
            },
            onUpdate: () => {
              const scrollPixelsX = Math.round(transitionState.cameraX);
              const scrollPixelsY = Math.round(transitionState.cameraY);
              this.camera.screenOriginX = scrollPixelsX / tileSize;
              this.camera.screenOriginY = scrollPixelsY / tileSize;
              this.player.setPosition(
                Math.round(transitionState.playerX),
                Math.round(transitionState.playerY),
              );
            },
          },
        ],
        onComplete: () => {
          this.activeTransition = undefined;
          this.camera.setActiveScreen(nextX, nextY);
          this.camera.transitioning = false;
          this.syncPlayerToWorld(nextX, nextY, tileSize);
          this.setFacing(dx, dy, false);
          this.onScreenTransitionComplete?.(nextChunkX, nextChunkY);
          this.isMoving = false;
        },
      });
    } else {
      const target = this.camera.tileToScreen(nextX, nextY, tileSize);

      this.scene.tweens.add({
        targets: this.player,
        x: target.x,
        y: target.y,
        duration: this.moveDuration,
        ease: MOVE_EASE,
        onComplete: () => {
          this.setFacing(dx, dy, false);
          this.isMoving = false;
        },
      });
    }

    return { worldX: nextX, worldY: nextY };
  }

  private getSettledScreenPosition(
    worldX: number,
    worldY: number,
    tileSize: number,
  ): { x: number; y: number } {
    const left = this.camera.screenCenterX - (this.camera.viewportColumns * tileSize) / 2;
    const top = this.camera.screenCenterY - (this.camera.viewportRows * tileSize) / 2;
    const localX = ((worldX % CHUNK_COLUMNS) + CHUNK_COLUMNS) % CHUNK_COLUMNS;
    const localY = ((worldY % CHUNK_ROWS) + CHUNK_ROWS) % CHUNK_ROWS;

    return {
      x: Math.round(left + (localX + 0.5) * tileSize),
      y: Math.round(top + (localY + 0.5) * tileSize),
    };
  }

  private getScrollDurationMs(dx: number, _dy: number): number {
    const tiles = dx !== 0 ? this.camera.viewportColumns : this.camera.viewportRows;
    return Math.max(180, Math.round(tiles * SCROLL_MS_PER_TILE));
  }

  private setFacing(dx: number, dy: number, moving: boolean): void {
    if (dy < 0) {
      this.player.anims.stop();
      this.player.setFlipX(false);
      this.player.setFrame(HERO_FRAMES.idleUp);
      return;
    }

    if (dy > 0) {
      this.player.anims.stop();
      this.player.setFlipX(false);
      this.player.setFrame(HERO_FRAMES.idleDown);
      return;
    }

    this.player.setFlipX(dx < 0);
    if (moving) {
      this.player.play(ANIMATION_KEYS.heroWalk, true);
      return;
    }

    this.player.anims.stop();
    this.player.setFrame(HERO_FRAMES.idleDown);
  }
}
