import Phaser from 'phaser';

import { ANIMATION_KEYS, CHUNK_COLUMNS, CHUNK_ROWS, HERO_FRAMES, TIMINGS } from '@/game/constants';
import type { WorldCamera } from './WorldCamera';

const SCROLL_MS_PER_TILE = 20;
const MOVE_EASE = 'Sine.Out';
const SCROLL_EASE = 'Sine.InOut';
const HOLD_REPEAT_DELAY_MS = 280;
const HOLD_REPEAT_INTERVAL_MS = 140;
// While a movement key is held the hero keeps walking, a bit faster per tile.
const HOLD_MOVE_SPEED_FACTOR = 0.62;
// Throttle repeated bumps (e.g. holding into a wall/enemy) so they don't fire every frame.
const HELD_BUMP_COOLDOWN_MS = 220;

export class PlayerMovementController {
  private readonly cursors: Phaser.Types.Input.Keyboard.CursorKeys | undefined;
  private readonly wasd: {
    up?: Phaser.Input.Keyboard.Key;
    down?: Phaser.Input.Keyboard.Key;
    left?: Phaser.Input.Keyboard.Key;
    right?: Phaser.Input.Keyboard.Key;
  };
  private lastBumpTime = 0;
  private readonly swipeThresholdPx = 20;
  private isMoving = false;
  private moveDuration: number = TIMINGS.moveDurationMs;
  private tileSize = 0;
  private touchStart: { pointerId: number; x: number; y: number } | null = null;
  private queuedMove: { dx: number; dy: number } | null = null;
  private activeTransition?: Phaser.Tweens.TweenChain;

  private heldDirection: { dx: number; dy: number } | null = null;
  private holdRepeatTimer: Phaser.Time.TimerEvent | null = null;

  private readonly boundTouchStart: (e: TouchEvent) => void;
  private readonly boundTouchMove: (e: TouchEvent) => void;
  private readonly boundTouchEnd: (e: TouchEvent) => void;

  public constructor(
    private readonly scene: Phaser.Scene,
    private readonly player: Phaser.GameObjects.Sprite,
    private readonly camera: WorldCamera,
    private readonly isBlockedCell: (worldX: number, worldY: number) => boolean,
    private readonly onStep: (worldX: number, worldY: number) => void,
    private readonly onBumpBlocked?: (worldX: number, worldY: number) => void,
    private readonly onScreenTransitionComplete?: (chunkX: number, chunkY: number) => void,
  ) {
    const keyboard = scene.input.keyboard;
    this.cursors = keyboard?.createCursorKeys();
    this.wasd = {
      up: keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      down: keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      left: keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      right: keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.D),
    };

    // Mouse fallback (non-touch devices)
    this.scene.input.on(Phaser.Input.Events.POINTER_DOWN, this.handlePointerDown, this);
    this.scene.input.on(Phaser.Input.Events.POINTER_MOVE, this.handlePointerMove, this);
    this.scene.input.on(Phaser.Input.Events.POINTER_UP, this.handlePointerUpOrCancel, this);
    this.scene.input.on(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.handlePointerUpOrCancel, this);

    // Window-level touch listeners so swipe works anywhere on screen, not just inside the canvas
    this.boundTouchStart = this.handleTouchStart.bind(this);
    this.boundTouchMove = this.handleTouchMove.bind(this);
    this.boundTouchEnd = this.handleTouchEnd.bind(this);
    window.addEventListener('touchstart', this.boundTouchStart, { passive: true });
    window.addEventListener('touchmove', this.boundTouchMove, { passive: true });
    window.addEventListener('touchend', this.boundTouchEnd, { passive: true });
    window.addEventListener('touchcancel', this.boundTouchEnd, { passive: true });

    // Clean up on shutdown (scene restart) AND destroy so window listeners never accumulate.
    this.scene.events.once(Phaser.Scenes.Events.SHUTDOWN, this.removeWindowListeners, this);
    this.scene.events.once(Phaser.Scenes.Events.DESTROY, this.removeWindowListeners, this);
  }

  public update(worldX: number, worldY: number): { worldX: number; worldY: number } {
    if (this.isMoving) {
      return { worldX, worldY };
    }

    if (this.queuedMove) {
      const { dx, dy } = this.queuedMove;
      this.queuedMove = null;
      return this.tryMove(worldX, worldY, dx, dy, true);
    }

    const dir = this.readDirection();
    if (dir) {
      // A fresh tap steps once at normal speed; a held key keeps moving, faster.
      return this.tryMove(worldX, worldY, dir.dx, dir.dy, !dir.just);
    }

    return { worldX, worldY };
  }

  // Resolve a single movement direction from arrow keys and WASD. A just-pressed key
  // wins for snappy taps; otherwise a key that is still held keeps the hero walking.
  private readDirection(): { dx: number; dy: number; just: boolean } | null {
    const c = this.cursors;
    const w = this.wasd;

    const justPressed = (a?: Phaser.Input.Keyboard.Key, b?: Phaser.Input.Keyboard.Key): boolean => {
      const ja = a ? Phaser.Input.Keyboard.JustDown(a) : false;
      const jb = b ? Phaser.Input.Keyboard.JustDown(b) : false;
      return ja || jb;
    };
    const held = (a?: Phaser.Input.Keyboard.Key, b?: Phaser.Input.Keyboard.Key): boolean =>
      Boolean(a?.isDown) || Boolean(b?.isDown);

    // Evaluate every key every frame so JustDown state never lingers to the next frame.
    const leftJust = justPressed(c?.left, w.left);
    const rightJust = justPressed(c?.right, w.right);
    const upJust = justPressed(c?.up, w.up);
    const downJust = justPressed(c?.down, w.down);

    if (leftJust) return { dx: -1, dy: 0, just: true };
    if (rightJust) return { dx: 1, dy: 0, just: true };
    if (upJust) return { dx: 0, dy: -1, just: true };
    if (downJust) return { dx: 0, dy: 1, just: true };

    if (held(c?.left, w.left)) return { dx: -1, dy: 0, just: false };
    if (held(c?.right, w.right)) return { dx: 1, dy: 0, just: false };
    if (held(c?.up, w.up)) return { dx: 0, dy: -1, just: false };
    if (held(c?.down, w.down)) return { dx: 0, dy: 1, just: false };

    return null;
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
    this.stopHold();
    this.camera.transitioning = false;
    this.syncPlayerToWorld(worldX, worldY, this.tileSize || this.player.displayWidth || this.player.width);
  }

  private stopHold(): void {
    this.heldDirection = null;
    this.holdRepeatTimer?.remove();
    this.holdRepeatTimer = null;
  }

  private startHold(dir: { dx: number; dy: number }): void {
    this.stopHold();
    this.heldDirection = dir;
    this.queuedMove = { ...dir };
    this.holdRepeatTimer = this.scene.time.addEvent({
      delay: HOLD_REPEAT_DELAY_MS,
      callback: () => {
        this.holdRepeatTimer = this.scene.time.addEvent({
          delay: HOLD_REPEAT_INTERVAL_MS,
          callback: () => {
            if (this.heldDirection && !this.queuedMove) {
              this.queuedMove = { ...this.heldDirection };
            }
          },
          loop: true,
        });
      },
    });
  }

  private removeWindowListeners(): void {
    window.removeEventListener('touchstart', this.boundTouchStart);
    window.removeEventListener('touchmove', this.boundTouchMove);
    window.removeEventListener('touchend', this.boundTouchEnd);
    window.removeEventListener('touchcancel', this.boundTouchEnd);
  }

  private handleTouchStart(e: TouchEvent): void {
    if (this.touchStart !== null) return;
    const t = e.changedTouches[0];
    this.touchStart = { pointerId: t.identifier, x: t.clientX, y: t.clientY };
  }

  private handleTouchMove(e: TouchEvent): void {
    if (!this.touchStart) return;
    const t = Array.from(e.changedTouches).find((c) => c.identifier === this.touchStart!.pointerId);
    if (!t) return;
    const dir = this.resolveSwipe(t.clientX - this.touchStart.x, t.clientY - this.touchStart.y);
    if (!dir) return;

    const dirChanged = !this.heldDirection || this.heldDirection.dx !== dir.dx || this.heldDirection.dy !== dir.dy;
    if (dirChanged) {
      // Update origin so direction is re-evaluated relative to the new anchor
      this.touchStart = { pointerId: t.identifier, x: t.clientX, y: t.clientY };
      this.startHold(dir);
    }
  }

  private handleTouchEnd(e: TouchEvent): void {
    if (!this.touchStart) return;
    const t = Array.from(e.changedTouches).find((c) => c.identifier === this.touchStart!.pointerId);
    if (!t) return;
    // If the finger lifted before threshold was reached, treat as a short tap (no-op here)
    this.stopHold();
    this.touchStart = null;
  }

  private handlePointerDown(pointer: Phaser.Input.Pointer): void {
    if (pointer.wasTouch) return;
    this.touchStart = { pointerId: pointer.id, x: pointer.x, y: pointer.y };
  }

  private handlePointerMove(pointer: Phaser.Input.Pointer): void {
    if (pointer.wasTouch) return;
    if (!pointer.isDown || !this.touchStart || this.touchStart.pointerId !== pointer.id) return;
    const dir = this.resolveSwipe(pointer.x - this.touchStart.x, pointer.y - this.touchStart.y);
    if (!dir) return;
    const dirChanged = !this.heldDirection || this.heldDirection.dx !== dir.dx || this.heldDirection.dy !== dir.dy;
    if (dirChanged) {
      this.touchStart = { pointerId: pointer.id, x: pointer.x, y: pointer.y };
      this.startHold(dir);
    }
  }

  private handlePointerUpOrCancel(pointer: Phaser.Input.Pointer): void {
    if (pointer.wasTouch) return;
    if (!this.touchStart || this.touchStart.pointerId !== pointer.id) return;
    this.stopHold();
    this.touchStart = null;
  }

  private resolveSwipe(deltaX: number, deltaY: number): { dx: number; dy: number } | null {
    const absX = Math.abs(deltaX);
    const absY = Math.abs(deltaY);
    if (absX < this.swipeThresholdPx && absY < this.swipeThresholdPx) return null;
    if (absX >= absY) return { dx: deltaX >= 0 ? 1 : -1, dy: 0 };
    return { dx: 0, dy: deltaY >= 0 ? 1 : -1 };
  }

  private tryMove(
    worldX: number,
    worldY: number,
    dx: number,
    dy: number,
    viaHold = false,
  ): { worldX: number; worldY: number } {
    const nextX = worldX + dx;
    const nextY = worldY + dy;

    if (this.isBlockedCell(nextX, nextY)) {
      const now = this.scene.time.now;
      if (!viaHold || now - this.lastBumpTime >= HELD_BUMP_COOLDOWN_MS) {
        this.lastBumpTime = now;
        this.onBumpBlocked?.(nextX, nextY);
      }
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
    const stepDuration = viaHold
      ? Math.max(60, Math.round(this.moveDuration * HOLD_MOVE_SPEED_FACTOR))
      : this.moveDuration;

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
            duration: stepDuration,
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
        duration: stepDuration,
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
