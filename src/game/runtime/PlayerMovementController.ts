import Phaser from 'phaser';

import { HERO_FRAMES, TIMINGS } from '@/game/constants';
import { setHeroWalking, WALK_CYCLE_FRAMES, WALK_CYCLE_FRAMES_UP, type HeroView } from './HeroView';
import type { WorldCamera } from './WorldCamera';

/**
 * The hero walks locked to the grid — one tile at a time, always aligned — but the walk itself
 * is CONTINUOUS: the render position advances at a constant speed and whatever is left of the
 * frame that crosses a tile boundary is carried straight into the next step.
 *
 * It used to be a chain of tweens, one per tile, eased `Sine.Out`. That cost two things. The
 * ease drops the speed to *zero* at the end of every tile, so walking in a straight line was a
 * lurch — go, stop, go, stop, ten times a second. And because the next tween was only born in
 * the following update(), a whole frame was spent standing still on each tile on top of that.
 *
 * Zelda: Link's Awakening walks at a flat 16 subpixels per frame with no acceleration at all
 * (measured in RAM: zeldaspeedruns.com/ladx/general/movement-speeds). The smoothness comes from
 * never braking; the life comes from the animation — the bob — not from a velocity curve. That
 * is the model here.
 *
 * Touch feeds the SAME held direction the keyboard does, read every frame. It used to run its
 * own key-repeat engine instead: a 280ms wait, then a step queued every 140ms against a step
 * that took 87ms — so the hero stood frozen ~53ms on every tile, and the phone walked 40%
 * slower than the keyboard and juddered while doing it. Both now enter through one path.
 */

/** Milliseconds per tile. Constant: tapping covers ground at the same rate as holding. */
const DEFAULT_STEP_MS = TIMINGS.moveDurationMs;
/** A direction asked for near the end of a step is kept, and spent on the tile boundary. */
const INPUT_BUFFER_MS = 120;
/** Drag needed before the gesture commits to a direction. */
const SWIPE_THRESHOLD_PX = 11;
/** The drag anchor trails the finger on a leash this long, so turning around stays cheap. */
const SWIPE_ANCHOR_LEASH_PX = 18;
/** Throttle repeated bumps (holding into a wall or an enemy) so they don't fire every frame. */
const HELD_BUMP_COOLDOWN_MS = 220;
/**
 * A stall (a shader compile, a backgrounded tab) must not fling the hero across the map. It can
 * never tunnel through a wall — every tile the loop below enters is tested first — but a 500ms
 * frame would still teleport him five tiles.
 */
const MAX_FRAME_MS = 50;

interface Dir {
  dx: number;
  dy: number;
}

export class PlayerMovementController {
  private readonly cursors: Phaser.Types.Input.Keyboard.CursorKeys | undefined;
  private readonly wasd: {
    up?: Phaser.Input.Keyboard.Key;
    down?: Phaser.Input.Keyboard.Key;
    left?: Phaser.Input.Keyboard.Key;
    right?: Phaser.Input.Keyboard.Key;
  };

  private lastBumpTime = 0;
  private tileSize = 0;
  private stepMs: number = DEFAULT_STEP_MS;

  /**
   * The step in flight. `stepFrom` is the tile it left; the world position the GameScene owns is
   * already the DESTINATION — it commits the instant a step begins, exactly as the tween version
   * did. The skeleton's wind-up locks onto that tile and a dodge is decided against it, so the
   * logical position must keep leading the visible one by a step.
   */
  private stepFrom: { x: number; y: number } | null = null;
  private stepDir: Dir | null = null;
  /** 0..1 along the step in flight. Overflow past 1 is carried into the next tile, never dropped. */
  private stepProgress = 0;

  /** The direction the drag is holding — read every frame, exactly like a key. */
  private touchDir: Dir | null = null;
  private touchAnchor: { pointerId: number; x: number; y: number } | null = null;

  private bufferedDir: Dir | null = null;
  private bufferedAtMs = 0;

  // The way the hero is currently facing, mirroring the sprite frame set by setFacing. Starts
  // facing down (the idle frame). A bump does NOT turn the hero, so it never changes this.
  private lastFacing: Dir = { dx: 0, dy: 1 };

  private readonly boundTouchStart: (e: TouchEvent) => void;
  private readonly boundTouchMove: (e: TouchEvent) => void;
  private readonly boundTouchEnd: (e: TouchEvent) => void;

  public constructor(
    private readonly scene: Phaser.Scene,
    private readonly hero: HeroView,
    private readonly camera: WorldCamera,
    private readonly isBlockedCell: (worldX: number, worldY: number) => boolean,
    private readonly onStep: (worldX: number, worldY: number) => void,
    private readonly onBumpBlocked?: (worldX: number, worldY: number) => void,
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

    // Window-level touch listeners so the drag works anywhere on screen, not just inside the canvas
    this.boundTouchStart = this.handleTouchStart.bind(this);
    this.boundTouchMove = this.handleTouchMove.bind(this);
    this.boundTouchEnd = this.handleTouchEnd.bind(this);
    window.addEventListener('touchstart', this.boundTouchStart, { passive: true });
    window.addEventListener('touchmove', this.boundTouchMove, { passive: true });
    window.addEventListener('touchend', this.boundTouchEnd, { passive: true });
    window.addEventListener('touchcancel', this.boundTouchEnd, { passive: true });

    this.scene.events.once(Phaser.Scenes.Events.SHUTDOWN, this.removeWindowListeners, this);
    this.scene.events.once(Phaser.Scenes.Events.DESTROY, this.removeWindowListeners, this);
  }

  public update(worldX: number, worldY: number, deltaMs: number): { worldX: number; worldY: number } {
    // JustDown is a destructive read: drain it every frame or a press sits on the key and fires
    // minutes later. Draining it INTO the buffer is what stops a quick tap mid-step from vanishing.
    this.pollFreshPress();

    const dt = Math.min(deltaMs, MAX_FRAME_MS);
    let wx = worldX;
    let wy = worldY;

    if (this.stepDir) {
      const advance = dt / this.stepMs;
      this.stepProgress += advance;
      this.hero.walkDist += advance; // the leg cycle turns with the ground, not with a clock
    }

    // Each turn of this loop spends one tile boundary crossed on this frame. On a normal frame it
    // runs at most once — the loop only exists so a long frame can't swallow a step whole.
    for (;;) {
      if (this.stepDir && this.stepProgress < 1) break; // mid-tile: nothing to decide yet
      const carry = this.stepDir ? this.stepProgress - 1 : 0;

      const next = this.takeDirection();
      if (!next) {
        if (this.stepDir) this.endWalk(wx, wy);
        break;
      }

      const nx = wx + next.dx;
      const ny = wy + next.dy;
      if (this.isBlockedCell(nx, ny)) {
        const now = this.scene.time.now;
        if (next.fresh || now - this.lastBumpTime >= HELD_BUMP_COOLDOWN_MS) {
          this.lastBumpTime = now;
          this.onBumpBlocked?.(nx, ny);
        }
        // A wall does not turn the hero (it never did) — and it ends the walk on the tile he is
        // standing on, rather than leaving him wedged part-way into it.
        if (this.stepDir) this.endWalk(wx, wy);
        break;
      }

      this.stepFrom = { x: wx, y: wy };
      this.stepDir = next;
      this.stepProgress = carry;
      wx = nx;
      wy = ny;
      this.onStep(nx, ny);
      this.setFacing(next.dx, next.dy, true);
    }

    if (this.stepDir && this.stepFrom) {
      // The hero stays pinned at screen centre; the camera (and therefore the world) scrolls
      // smoothly from the tile he left to the one he is entering.
      const t = Math.min(1, this.stepProgress);
      this.camera.centerOn(
        this.stepFrom.x + this.stepDir.dx * t,
        this.stepFrom.y + this.stepDir.dy * t,
      );
      this.pinToCentre();
    }

    return { worldX: wx, worldY: wy };
  }

  /** Land the walk squarely on a tile and drop the legs. */
  private endWalk(worldX: number, worldY: number): void {
    this.stepDir = null;
    this.stepFrom = null;
    this.stepProgress = 0;
    this.camera.centerOn(worldX, worldY);
    this.pinToCentre();
    this.setFacing(this.lastFacing.dx, this.lastFacing.dy, false);
  }

  /** Keep the newest fresh key press alive for INPUT_BUFFER_MS so a tile boundary can spend it. */
  private pollFreshPress(): void {
    const dir = this.readJustPressed();
    if (!dir) return;
    this.bufferedDir = dir;
    this.bufferedAtMs = this.scene.time.now;
  }

  /**
   * The direction to spend on this tile boundary. A recent tap outranks a held key — that is what
   * makes a quick turn register instead of being eaten by the step already in flight.
   */
  private takeDirection(): (Dir & { fresh: boolean }) | null {
    const buffered = this.bufferedDir;
    this.bufferedDir = null;
    if (buffered && this.scene.time.now - this.bufferedAtMs <= INPUT_BUFFER_MS) {
      return { ...buffered, fresh: true };
    }

    const held = this.readHeld();
    return held ? { ...held, fresh: false } : null;
  }

  private readJustPressed(): Dir | null {
    const c = this.cursors;
    const w = this.wasd;
    const just = (a?: Phaser.Input.Keyboard.Key, b?: Phaser.Input.Keyboard.Key): boolean => {
      const ja = a ? Phaser.Input.Keyboard.JustDown(a) : false;
      const jb = b ? Phaser.Input.Keyboard.JustDown(b) : false;
      return ja || jb;
    };

    // Every key must be polled, not just the winner: JustDown clears the flag it reads, so an
    // early return would strand the others' flags set and fire them on some later frame.
    const left = just(c?.left, w.left);
    const right = just(c?.right, w.right);
    const up = just(c?.up, w.up);
    const down = just(c?.down, w.down);

    if (left) return { dx: -1, dy: 0 };
    if (right) return { dx: 1, dy: 0 };
    if (up) return { dx: 0, dy: -1 };
    if (down) return { dx: 0, dy: 1 };
    return null;
  }

  /** A held key, or the drag — which is a key like any other as far as the walk is concerned. */
  private readHeld(): Dir | null {
    const c = this.cursors;
    const w = this.wasd;
    const held = (a?: Phaser.Input.Keyboard.Key, b?: Phaser.Input.Keyboard.Key): boolean =>
      Boolean(a?.isDown) || Boolean(b?.isDown);

    if (held(c?.left, w.left)) return { dx: -1, dy: 0 };
    if (held(c?.right, w.right)) return { dx: 1, dy: 0 };
    if (held(c?.up, w.up)) return { dx: 0, dy: -1 };
    if (held(c?.down, w.down)) return { dx: 0, dy: 1 };
    return this.touchDir;
  }

  public setMoveDuration(ms: number): void {
    this.stepMs = Math.max(40, ms);
  }

  /** Snap the camera onto a world tile with the hero pinned at screen centre. */
  public syncPlayerToWorld(worldX: number, worldY: number, tileSize: number): void {
    this.tileSize = tileSize;
    this.camera.centerOn(worldX, worldY);
    this.pinToCentre();
  }

  private pinToCentre(): void {
    this.hero.x = this.camera.screenCenterX;
    this.hero.y = this.camera.screenCenterY;
  }

  public get moving(): boolean {
    return this.stepDir !== null;
  }

  public interruptMovement(worldX: number, worldY: number): void {
    this.stepDir = null;
    this.stepFrom = null;
    this.stepProgress = 0;
    this.bufferedDir = null;
    // Drop the drag's held direction, but keep its anchor: the finger is still on the glass, and
    // the next touchmove re-arms it. (The old code did the same via stopHold + a live touchStart.)
    this.touchDir = null;
    if (this.hero.walking) {
      setHeroWalking(this.hero, false);
      this.hero.frame = this.lastFacing.dy < 0 ? HERO_FRAMES.idleUp : HERO_FRAMES.idleDown;
    }
    this.syncPlayerToWorld(worldX, worldY, this.tileSize || this.hero.sizePx);
  }

  private removeWindowListeners(): void {
    window.removeEventListener('touchstart', this.boundTouchStart);
    window.removeEventListener('touchmove', this.boundTouchMove);
    window.removeEventListener('touchend', this.boundTouchEnd);
    window.removeEventListener('touchcancel', this.boundTouchEnd);
  }

  private handleTouchStart(e: TouchEvent): void {
    if (this.touchAnchor !== null) return;
    const t = e.changedTouches[0];
    this.touchAnchor = { pointerId: t.identifier, x: t.clientX, y: t.clientY };
  }

  private handleTouchMove(e: TouchEvent): void {
    const anchor = this.touchAnchor;
    if (!anchor) return;
    const t = Array.from(e.changedTouches).find((c) => c.identifier === anchor.pointerId);
    if (!t) return;
    this.trackDrag(anchor, t.clientX, t.clientY);
  }

  private handleTouchEnd(e: TouchEvent): void {
    const anchor = this.touchAnchor;
    if (!anchor) return;
    if (!Array.from(e.changedTouches).some((c) => c.identifier === anchor.pointerId)) return;
    this.touchDir = null;
    this.touchAnchor = null;
  }

  private handlePointerDown(pointer: Phaser.Input.Pointer): void {
    if (pointer.wasTouch) return;
    this.touchAnchor = { pointerId: pointer.id, x: pointer.x, y: pointer.y };
  }

  private handlePointerMove(pointer: Phaser.Input.Pointer): void {
    if (pointer.wasTouch) return;
    const anchor = this.touchAnchor;
    if (!pointer.isDown || !anchor || anchor.pointerId !== pointer.id) return;
    this.trackDrag(anchor, pointer.x, pointer.y);
  }

  private handlePointerUpOrCancel(pointer: Phaser.Input.Pointer): void {
    if (pointer.wasTouch) return;
    if (!this.touchAnchor || this.touchAnchor.pointerId !== pointer.id) return;
    this.touchDir = null;
    this.touchAnchor = null;
  }

  /**
   * Turn the drag into a held direction — and let the ANCHOR chase the finger on a short leash.
   *
   * The anchor used to be re-planted under the finger on every change of direction, so reversing
   * meant dragging the whole threshold again from a standing start, and the hero kept walking the
   * old way until you had. Leashed, the finger is never more than SWIPE_ANCHOR_LEASH_PX from the
   * anchor, so the vector always describes where the thumb is heading *now*.
   *
   * There is no "let go by returning to centre": you walk while the finger is out, and you stop by
   * lifting it. That is the gesture as it stands — a drag, nothing to learn.
   */
  private trackDrag(anchor: { x: number; y: number }, px: number, py: number): void {
    let dx = px - anchor.x;
    let dy = py - anchor.y;
    const len = Math.hypot(dx, dy);

    if (len > SWIPE_ANCHOR_LEASH_PX) {
      const pull = (len - SWIPE_ANCHOR_LEASH_PX) / len;
      anchor.x += dx * pull;
      anchor.y += dy * pull;
      dx = px - anchor.x;
      dy = py - anchor.y;
    }

    const absX = Math.abs(dx);
    const absY = Math.abs(dy);
    // Inside the dead zone the last direction stands: a thumb wobbling on the glass must not
    // stutter the hero between two tiles.
    if (absX < SWIPE_THRESHOLD_PX && absY < SWIPE_THRESHOLD_PX) return;

    this.touchDir = absX >= absY
      ? { dx: dx >= 0 ? 1 : -1, dy: 0 }
      : { dx: 0, dy: dy >= 0 ? 1 : -1 };
  }

  /** The direction the hero's sprite currently faces (set the instant a move begins). */
  public get facing(): Dir {
    return this.lastFacing;
  }

  private setFacing(dx: number, dy: number, moving: boolean): void {
    this.lastFacing = { dx, dy };
    const hero = this.hero;

    // Frames 0..3 are the front-facing walk cycle (its last frame doubles as the idle pose), and
    // frame 4 is the hero's back. So down gets its own proper cycle, the sides borrow it flipped,
    // and up — which has a single frame — carries its motion in the bob alone. Walking up or down
    // used to animate NOTHING: a still sprite, dead centre of the screen, world sliding under it.
    if (dy !== 0) {
      hero.flipX = false;
      hero.walkFrames = dy < 0 ? WALK_CYCLE_FRAMES_UP : WALK_CYCLE_FRAMES;
    } else {
      hero.flipX = dx < 0;
      hero.walkFrames = WALK_CYCLE_FRAMES;
    }

    if (moving) {
      setHeroWalking(hero, true);
      return;
    }

    setHeroWalking(hero, false);
    hero.frame = dy < 0 ? HERO_FRAMES.idleUp : HERO_FRAMES.idleDown;
  }
}
