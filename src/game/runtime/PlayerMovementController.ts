import Phaser from 'phaser';

import { HERO_FRAMES, TIMINGS } from '@/game/constants';
import { setHeroWalking, WALK_CYCLE_FRAMES, WALK_CYCLE_FRAMES_UP, type HeroView } from './HeroView';
import type { WorldCamera } from './WorldCamera';

/**
 * The hero walks FREE of the grid: his position is continuous (fractional tiles), he moves in
 * eight directions at a constant speed, and he collides as a small box against the solid tiles —
 * the way Stardew Valley or Zelda: A Link to the Past move, not the way a tile-stepper does.
 *
 * The rest of the game still thinks in tiles, and it keeps doing so: the LOGICAL tile handed back
 * to the GameScene is the tile under the hero's centre. "The tile in front", picking up what is
 * underfoot, NPC talk and footprints all read that tile, and `onStep` fires the instant the centre
 * crosses into a new one — so every tile-shaped rule keeps working untouched.
 *
 * Two things keep a free walk from feeling worse than the grid it replaced on a tile map:
 *
 *   * CORNER SLIP. Walking into the edge of a wall while half a body off a corridor would stop
 *     dead. Instead, when the lane ahead is open, he is nudged sideways into it (A Link to the
 *     Past does the same) — so 1-tile gaps are as easy to enter as they were on the grid.
 *   * THE WALL STILL TURNS THE HERO. A and B act on the tile in front, so pressing into a rock is
 *     how you aim at it; that bump still fires `onBumpBlocked` for the tile he faces.
 *
 * Speed stays tied to `TIMINGS.moveDurationMs` (ms per tile), so the hero covers ground exactly
 * as fast as he did when he walked tile by tile.
 */

/** Milliseconds per tile of travel. */
const DEFAULT_STEP_MS = TIMINGS.moveDurationMs;
/** Half the side of the hero's collision box, in tiles. Under 0.5 so he fits a 1-tile corridor. */
const BODY_HALF = 0.3;
/** How far off a lane's centre the hero can be and still be slipped into it, in tiles. */
const CORNER_SLIP = 0.42;
/** Keeps an edge that lands exactly on a tile border from counting as inside the next tile. */
const EDGE_EPS = 1e-4;
/** Drag needed before the gesture commits to a direction. */
const SWIPE_THRESHOLD_PX = 11;
/** The drag anchor trails the finger on a leash this long, so turning around stays cheap. */
const SWIPE_ANCHOR_LEASH_PX = 18;
/** Throttle repeated bumps (holding into a wall) so they don't fire every frame. */
const HELD_BUMP_COOLDOWN_MS = 220;
/**
 * A stall (a shader compile, a backgrounded tab) must not fling the hero across the map. The
 * sweep below never tunnels, but a 500ms frame would still teleport him.
 */
const MAX_FRAME_MS = 50;

interface Dir {
  dx: number;
  dy: number;
}

type Axis = 'x' | 'y';

/** The tile whose cell contains this coordinate: tile N spans [N - 0.5, N + 0.5). */
const cellOf = (v: number): number => Math.floor(v + 0.5);

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
  /** > 0 = os pés estão presos pelo golpe em curso (ver `root`). */
  private rootedMs = 0;
  /** Presos SEM prazo: a bolsa aberta com o jogo rodando (ver `hold`). */
  private heldStill = false;

  /** The hero's continuous position in world tiles. `null` until the first sync. */
  private pos: { x: number; y: number } | null = null;
  /** Did the hero actually move on the last update? Drives the leg cycle and `moving`. */
  private walking = false;
  /** Was he pressing into something solid last frame? A fresh bump skips the cooldown. */
  private wasBlocked = false;
  /**
   * A tap shorter than a frame (down and up between two updates) never shows as `isDown`, so the
   * key's JustDown is read too and such a press still turns the hero and nudges him once.
   */
  private tapDir: Dir | null = null;

  /** The direction the drag is holding — read every frame, exactly like a key. */
  private touchDir: Dir | null = null;
  private touchAnchor: { pointerId: number; x: number; y: number } | null = null;

  // The way the hero is currently facing, mirroring the sprite frame set by setFacing. Starts
  // facing down (the idle frame).
  private lastFacing: Dir = { dx: 0, dy: 1 };

  private readonly boundTouchStart: (e: TouchEvent) => void;
  private readonly boundTouchMove: (e: TouchEvent) => void;
  private readonly boundTouchEnd: (e: TouchEvent) => void;

  public constructor(
    private readonly scene: Phaser.Scene,
    private readonly hero: HeroView,
    private readonly camera: WorldCamera,
    private readonly isBlockedCell: (worldX: number, worldY: number) => boolean,
    /**
     * Um tile foi ENTRADO (o centro do herói cruzou a borda dele) — e `dx`/`dy` dizem POR ONDE.
     * A direção vem no evento porque ela não pode ser perguntada depois: `setFacing` só roda
     * depois desta chamada, então quem escuta veria a direção anterior.
     */
    private readonly onStep: (worldX: number, worldY: number, dx: number, dy: number) => void,
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

  /**
   * PRENDE OS PÉS por `ms` — o compromisso do golpe (GameScene.swingRootMs).
   *
   * Fica aqui e não na cena porque o relógio precisa correr no MESMO lugar que decide o passo:
   * `update` tem saídas antecipadas, e uma raiz contada lá fora sobreviveria a elas.
   */
  public root(ms: number): void {
    this.rootedMs = Math.max(this.rootedMs, ms);
  }

  /**
   * PRENDE OS PÉS SEM PRAZO — a bolsa aberta (`GameScene.setBagOpen`). O mundo continua correndo
   * atrás da bolsa; só o herói fica parado onde está.
   */
  public hold(held: boolean): void {
    this.heldStill = held;
    if (held) {
      // Uma seta apertada para andar com o cursor não pode virar um passo quando a bolsa fecha.
      this.tapDir = null;
      this.touchDir = null;
    }
  }

  /** Os pés estão presos agora? */
  public get isRooted(): boolean {
    return this.rootedMs > 0 || this.heldStill;
  }

  public update(worldX: number, worldY: number, deltaMs: number): { worldX: number; worldY: number } {
    // JustDown is a destructive read: drain it every frame (even rooted) or a press sits on the
    // key and fires minutes later.
    const tap = this.readJustPressed();
    this.tapDir = this.isRooted ? null : tap;

    const pos = this.adopt(worldX, worldY);
    const dt = Math.min(deltaMs, MAX_FRAME_MS);
    if (this.rootedMs > 0) this.rootedMs = Math.max(0, this.rootedMs - dt);

    const input = this.isRooted ? null : (this.readHeld() ?? this.tapDir);
    if (!input) {
      this.wasBlocked = false;
      if (this.walking) this.stopWalking();
      return { worldX, worldY };
    }

    const facing = this.pickFacing(input);
    const len = Math.hypot(input.dx, input.dy);
    const dist = dt / this.stepMs;
    const fromX = pos.x;
    const fromY = pos.y;

    // Axis by axis, so a diagonal into a wall keeps sliding along it.
    const blockedX = this.sweep('x', (input.dx / len) * dist);
    const blockedY = this.sweep('y', (input.dy / len) * dist);
    // Straight into a wall: slip toward the open lane instead of stopping on its corner.
    if (blockedX && input.dy === 0) this.slipAround('x', input.dx, dist);
    if (blockedY && input.dx === 0) this.slipAround('y', input.dy, dist);

    const moved = Math.hypot(pos.x - fromX, pos.y - fromY);
    this.hero.walkDist += moved; // the leg cycle turns with the ground, not with a clock

    let lx = worldX;
    let ly = worldY;
    const cx = cellOf(pos.x);
    const cy = cellOf(pos.y);
    if (cx !== lx || cy !== ly) {
      const dx = Math.sign(cx - lx);
      const dy = Math.sign(cy - ly);
      lx = cx;
      ly = cy;
      this.onStep(lx, ly, dx, dy);
    }

    const blocked = moved < dist * 0.05;
    if (blocked) this.bump(lx, ly, facing);
    else this.wasBlocked = false;

    this.setFacing(facing.dx, facing.dy, !blocked);
    this.walking = !blocked;
    this.followCamera();
    return { worldX: lx, worldY: ly };
  }

  /**
   * The continuous position for the logical tile the scene holds. When the scene moved the hero
   * itself (a cutscene step, a load, a teleport), that tile no longer contains `pos` and he is
   * placed on its centre; otherwise his place inside the tile is kept.
   */
  private adopt(worldX: number, worldY: number): { x: number; y: number } {
    const p = this.pos;
    if (p && cellOf(p.x) === worldX && cellOf(p.y) === worldY) return p;
    this.pos = { x: worldX, y: worldY };
    return this.pos;
  }

  /**
   * Move along one axis by `delta`, stopping flush against the first solid tile the leading
   * edge would enter. Only tiles NEW to the box are tested: whatever it already overlaps (an NPC
   * that walked into him, a gate that closed on him) never traps him. Returns true if it hit.
   */
  private sweep(axis: Axis, delta: number): boolean {
    const p = this.pos;
    if (!p || delta === 0) return false;
    const other: Axis = axis === 'x' ? 'y' : 'x';
    const sign = Math.sign(delta);
    const edge = p[axis] + sign * BODY_HALF;
    const fromCell = cellOf(edge - sign * EDGE_EPS);
    const toCell = cellOf(edge + delta - sign * EDGE_EPS);
    const lo = cellOf(p[other] - BODY_HALF + EDGE_EPS);
    const hi = cellOf(p[other] + BODY_HALF - EDGE_EPS);

    for (let c = fromCell + sign; sign > 0 ? c <= toCell : c >= toCell; c += sign) {
      for (let o = lo; o <= hi; o += 1) {
        if (this.solidAt(axis, c, o)) {
          p[axis] = c - sign * (0.5 + BODY_HALF + EDGE_EPS);
          return true;
        }
      }
    }
    p[axis] += delta;
    return false;
  }

  /**
   * Pressing straight into a wall while partly beside an opening: nudge sideways toward the
   * lane whose tile ahead is free — the hero's own lane first, then the one his body leans into.
   */
  private slipAround(axis: Axis, sign: number, dist: number): void {
    const p = this.pos;
    if (!p) return;
    const other: Axis = axis === 'x' ? 'y' : 'x';
    const ahead = cellOf(p[axis] + sign * (BODY_HALF + 2 * EDGE_EPS));
    const own = cellOf(p[other]);
    const off = p[other] - own;
    let lane: number | null = null;
    if (Math.abs(off) > EDGE_EPS && !this.solidAt(axis, ahead, own)) lane = own;
    else if (Math.abs(off) > EDGE_EPS && 1 - Math.abs(off) <= CORNER_SLIP) {
      const lean = own + Math.sign(off);
      if (!this.solidAt(axis, ahead, lean)) lane = lean;
    }
    if (lane === null) return;
    const gap = lane - p[other];
    this.sweep(other, Math.sign(gap) * Math.min(Math.abs(gap), dist));
  }

  private solidAt(axis: Axis, along: number, across: number): boolean {
    return axis === 'x' ? this.isBlockedCell(along, across) : this.isBlockedCell(across, along);
  }

  /**
   * A PAREDE VIRA O HEROI: A e B agem no tile à frente, então encarar uma coisa sem poder andar
   * até ela é a maneira de mirar nela. O esbarrão vale para o tile que ele encara, e só se ele
   * for sólido — o corpo pode ter parado na quina de outro.
   */
  private bump(lx: number, ly: number, facing: Dir): void {
    const fx = lx + facing.dx;
    const fy = ly + facing.dy;
    if (!this.isBlockedCell(fx, fy)) return;
    const now = this.scene.time.now;
    if (!this.wasBlocked || now - this.lastBumpTime >= HELD_BUMP_COOLDOWN_MS) {
      this.lastBumpTime = now;
      this.onBumpBlocked?.(fx, fy);
    }
    this.wasBlocked = true;
  }

  /**
   * The four-way facing for an eight-way input. On a diagonal the hero keeps looking the way he
   * already was if that is one of its two arrows (so sliding along a wall never flickers the
   * sprite); otherwise the horizontal one wins.
   */
  private pickFacing(input: Dir): Dir {
    if (input.dx !== 0 && input.dy !== 0) {
      const f = this.lastFacing;
      if (f.dx === input.dx && f.dy === 0) return f;
      if (f.dy === input.dy && f.dx === 0) return f;
      return { dx: input.dx, dy: 0 };
    }
    return { dx: input.dx, dy: input.dy };
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

  /** Held keys (opposite arrows cancel), or the drag — a key like any other to the walk. */
  private readHeld(): Dir | null {
    const c = this.cursors;
    const w = this.wasd;
    const held = (a?: Phaser.Input.Keyboard.Key, b?: Phaser.Input.Keyboard.Key): number =>
      (a?.isDown || b?.isDown ? 1 : 0);

    const dx = held(c?.right, w.right) - held(c?.left, w.left);
    const dy = held(c?.down, w.down) - held(c?.up, w.up);
    if (dx !== 0 || dy !== 0) return { dx, dy };
    return this.touchDir;
  }

  private stopWalking(): void {
    this.walking = false;
    this.setFacing(this.lastFacing.dx, this.lastFacing.dy, false);
  }

  /** The hero stays pinned at screen centre; the camera (and so the world) slides under him. */
  private followCamera(): void {
    const p = this.pos;
    if (!p) return;
    this.camera.centerOn(p.x, p.y);
    this.pinToCentre();
  }

  public setMoveDuration(ms: number): void {
    this.stepMs = Math.max(40, ms);
  }

  /** Centre the camera on the hero, keeping his place inside the tile if he is still on it. */
  public syncPlayerToWorld(worldX: number, worldY: number, tileSize: number): void {
    this.tileSize = tileSize;
    this.adopt(worldX, worldY);
    this.followCamera();
  }

  private pinToCentre(): void {
    this.hero.x = this.camera.screenCenterX;
    this.hero.y = this.camera.screenCenterY;
  }

  public get moving(): boolean {
    return this.walking;
  }

  /** Stop the legs and drop pending input. The hero stays where he is — no snap to a tile. */
  public interruptMovement(worldX: number, worldY: number): void {
    // Drop the drag's held direction, but keep its anchor: the finger is still on the glass, and
    // the next touchmove re-arms it.
    this.touchDir = null;
    this.tapDir = null;
    this.wasBlocked = false;
    this.walking = false;
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
    // O arrasto escuta a JANELA inteira (andar tem de funcionar em qualquer ponto do vidro),
    // entao ele tem de recusar explicitamente o que e UI: sem isto, tocar no botao A tambem
    // plantaria a ancora do arrasto e o heroi sairia andando junto com o golpe.
    if ((e.target as HTMLElement | null)?.closest?.('[data-zh-ui]')) return;
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

  // (Houve aqui um `setMouseWalkEnabled`: o mouse deixava de andar e virava MIRA enquanto o
  // revólver estava na mão. O revólver foi arrancado inteiro — nada neste jogo se aponta —, e a
  // chave foi junto: o mouse voltou a ter um trabalho só, ser o dedo de quem não tem tela de toque.)

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
    // stutter the hero.
    if (absX < SWIPE_THRESHOLD_PX && absY < SWIPE_THRESHOLD_PX) return;

    // Eight ways, like the keyboard: an axis counts once the drag leans into it past ~22.5°.
    const lean = Math.tan(Math.PI / 8);
    this.touchDir = {
      dx: absX >= absY * lean ? Math.sign(dx) : 0,
      dy: absY >= absX * lean ? Math.sign(dy) : 0,
    };
  }

  /**
   * VIRAR por roteiro (uma cutscene): encara a direcao e, com `walking`, liga as pernas — a cena
   * e quem anda, e o desenho do passo tem de ser o mesmo de um passo de verdade.
   */
  public faceTo(dx: number, dy: number, walking = false): void {
    this.setFacing(dx, dy, walking);
  }

  /** The direction the hero's sprite currently faces (set the instant a move begins). */
  public get facing(): Dir {
    return this.lastFacing;
  }

  /**
   * Onde o heroi esta NA TELA, em tiles fracionarios — que NAO e o tile logico que o GameScene
   * guarda: o logico e so o tile sob o centro dele, e o corpo pode estar em qualquer ponto dentro
   * dele. Todo overlay 2D preso ao heroi se ancora aqui, ou nasce ate meio tile fora do corpo.
   */
  public visualWorld(worldX: number, worldY: number): { x: number; y: number } {
    const p = this.pos;
    if (!p || cellOf(p.x) !== worldX || cellOf(p.y) !== worldY) return { x: worldX, y: worldY };
    return { x: p.x, y: p.y };
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
