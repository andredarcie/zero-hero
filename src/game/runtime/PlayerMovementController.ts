import * as Engine from '@/game/engine';

import { HERO_FRAMES, TIMINGS } from '@/game/constants';
import { TouchStick } from './ActionButtons';
import { setHeroWalking, type HeroView } from './HeroView';
import type { WorldCamera } from './WorldCamera';
import { MoveKeys, type Dir } from './MoveKeys';
import { TouchSteer } from './TouchSteer';
import { HeroFacing } from './HeroFacing';

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
/** Throttle repeated bumps (holding into a wall) so they don't fire every frame. */
const HELD_BUMP_COOLDOWN_MS = 220;
/**
 * A stall (a shader compile, a backgrounded tab) must not fling the hero across the map. It can
 * never tunnel through a wall — every tile the loop below enters is tested first — but a 500ms
 * frame would still teleport him five tiles.
 */
const MAX_FRAME_MS = 50;

export class PlayerMovementController {
  public readonly cursors: Engine.Types.Input.Keyboard.CursorKeys | undefined;
  public readonly wasd: {
    up?: Engine.Input.Keyboard.Key;
    down?: Engine.Input.Keyboard.Key;
    left?: Engine.Input.Keyboard.Key;
    right?: Engine.Input.Keyboard.Key;
  };

  private lastBumpTime = 0;
  private tileSize = 0;
  public stepMs: number = DEFAULT_STEP_MS;
  /** > 0 = os pés estão presos pelo golpe em curso (ver `root`). */
  public rootedMs = 0;
  /** Presos SEM prazo: a bolsa aberta com o jogo rodando (ver `hold`). */
  public heldStill = false;

  /**
   * The step in flight. `stepFrom` is the tile it left; the world position the GameScene owns is
   * already the DESTINATION — it commits the instant a step begins, exactly as the tween version
   * did. The skeleton's wind-up locks onto that tile and a dodge is decided against it, so the
   * logical position must keep leading the visible one by a step.
   */
  public stepFrom: { x: number; y: number } | null = null;
  public stepDir: Dir | null = null;
  /** 0..1 along the step in flight. Overflow past 1 is carried into the next tile, never dropped. */
  public stepProgress = 0;

  /** The direction the drag is holding — read every frame, exactly like a key. */
  public touchDir: Dir | null = null;
  /**
   * O anel que mostra o arrasto (ver TouchStick) — nasce no primeiro toque, só existe no toque.
   * Ele some enquanto os pés estão presos (bolsa, diálogo, golpe): um joystick na tela promete um
   * andar que naquele instante não acontece.
   */
  public stick?: TouchStick;

  public bufferedDir: Dir | null = null;

  // The way the hero is currently facing, mirroring the sprite frame set by setFacing. Starts
  // facing down (the idle frame). A bump does NOT turn the hero, so it never changes this.
  public lastFacing: Dir = { dx: 0, dy: 1 };

  private readonly boundTouchStart: (e: TouchEvent) => void;
  private readonly boundTouchMove: (e: TouchEvent) => void;
  private readonly boundTouchEnd: (e: TouchEvent) => void;
  /** As setas e o WASD. (ver MoveKeys) */
  private readonly keys = new MoveKeys(this);
  /** O dedo na tela. (ver TouchSteer) */
  private readonly touch = new TouchSteer(this);
  /** Para onde ele olha e onde o corpo está. (ver HeroFacing) */
  private readonly look = new HeroFacing(this);

  public constructor(
    public readonly scene: Engine.Scene,
    public readonly hero: HeroView,
    private readonly camera: WorldCamera,
    /**
     * O tile de destino barra o passo? `fromX`/`fromY` e o tile de onde ele sai: a serra decide
     * pelo PAR (do chao para o planalto so pela escada — ver world/relief.canStep).
     */
    private readonly isBlockedCell: (worldX: number, worldY: number, fromX: number, fromY: number) => boolean,
    /**
     * Um tile foi ENTRADO — e `dx`/`dy` dizem POR ONDE. A direção vem no evento porque ela não
     * pode ser perguntada depois: `setFacing` só roda na linha seguinte a esta chamada, então
     * quem escuta veria a direção do passo ANTERIOR. E há gesto que depende dela (a escada só
     * aceita quem entra de frente).
     */
    private readonly onStep: (worldX: number, worldY: number, dx: number, dy: number) => void,
    private readonly onBumpBlocked?: (worldX: number, worldY: number) => void,
  ) {
    const keyboard = scene.input.keyboard;
    this.cursors = keyboard?.createCursorKeys();
    this.wasd = {
      up: keyboard?.addKey(Engine.Input.Keyboard.KeyCodes.W),
      down: keyboard?.addKey(Engine.Input.Keyboard.KeyCodes.S),
      left: keyboard?.addKey(Engine.Input.Keyboard.KeyCodes.A),
      right: keyboard?.addKey(Engine.Input.Keyboard.KeyCodes.D),
    };

    // Mouse fallback (non-touch devices)
    // (O contexto é o `touch`: os handlers são dele — ver TouchSteer.)
    this.scene.input.on(Engine.Input.Events.POINTER_DOWN, this.touch.handlePointerDown, this.touch);
    this.scene.input.on(Engine.Input.Events.POINTER_MOVE, this.touch.handlePointerMove, this.touch);
    this.scene.input.on(Engine.Input.Events.POINTER_UP, this.touch.handlePointerUpOrCancel, this.touch);
    this.scene.input.on(Engine.Input.Events.POINTER_UP_OUTSIDE, this.touch.handlePointerUpOrCancel, this.touch);

    // Window-level touch listeners so the drag works anywhere on screen, not just inside the canvas
    this.boundTouchStart = this.touch.handleTouchStart.bind(this.touch);
    this.boundTouchMove = this.touch.handleTouchMove.bind(this.touch);
    this.boundTouchEnd = this.touch.handleTouchEnd.bind(this.touch);
    window.addEventListener('touchstart', this.boundTouchStart, { passive: true });
    window.addEventListener('touchmove', this.boundTouchMove, { passive: true });
    window.addEventListener('touchend', this.boundTouchEnd, { passive: true });
    window.addEventListener('touchcancel', this.boundTouchEnd, { passive: true });

    this.scene.events.once(Engine.Scenes.Events.SHUTDOWN, this.removeWindowListeners, this);
    this.scene.events.once(Engine.Scenes.Events.DESTROY, this.removeWindowListeners, this);
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
   * PRENDE OS PÉS SEM PRAZO — a bolsa aberta (`GameScene.setBagOpen`).
   *
   * É `root` sem relógio, e por isso passa pela mesma porta: o passo em curso TERMINA no tile
   * (parar o herói em cima de uma aresta seria um soluço), só o próximo não começa. E é diferente
   * de simplesmente não chamar `update`: o mundo continua correndo atrás da bolsa, e um herói
   * congelado no meio do tile enquanto o resto do mundo anda seria um bug com data marcada.
   */
  public hold(held: boolean): void {
    this.heldStill = held;
    if (held) {
      // O pedido guardado morre junto: uma seta apertada para andar com o cursor não pode virar
      // um passo no instante em que a bolsa fecha.
      this.bufferedDir = null;
      this.touchDir = null;
    }
  }

  public update(worldX: number, worldY: number, deltaMs: number): { worldX: number; worldY: number } {
    // JustDown is a destructive read: drain it every frame or a press sits on the key and fires
    // minutes later. Draining it INTO the buffer is what stops a quick tap mid-step from vanishing.
    this.keys.pollFreshPress();

    const dt = Math.min(deltaMs, MAX_FRAME_MS);
    if (this.rootedMs > 0) this.rootedMs = Math.max(0, this.rootedMs - dt);
    if (this.stick) this.touch.syncStick(); // os pés podem ter se soltado (ou preso) sem o dedo mexer
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

      // O GOLPE PRENDE OS PÉS (ver GameScene.swingRootMs). A raiz impede COMEÇAR um passo, nunca
      // congela um que já está no meio do tile: parar o herói em cima de uma aresta seria um
      // soluço no lugar de um peso. O pedido de direção fica no buffer e sai assim que solta.
      if (this.rootedMs > 0 || this.heldStill) {
        if (this.stepDir) this.endWalk(wx, wy);
        break;
      }

      const next = this.keys.takeDirection();
      if (!next) {
        if (this.stepDir) this.endWalk(wx, wy);
        break;
      }

      const nx = wx + next.dx;
      const ny = wy + next.dy;
      if (this.isBlockedCell(nx, ny, wx, wy)) {
        const now = this.scene.time.now;
        if (next.fresh || now - this.lastBumpTime >= HELD_BUMP_COOLDOWN_MS) {
          this.lastBumpTime = now;
          this.onBumpBlocked?.(nx, ny);
        }
        // A PAREDE VIRA O HEROI — e isso mudou com os dois botoes. Ela nunca virava: sem golpe
        // direcional, para onde ele olhava era so cosmetica. Agora A e B agem no tile A FRENTE,
        // entao encarar uma coisa sem poder andar ate ela e a unica maneira de mirar nela — e um
        // heroi parado de costas para a rocha, apertando a seta contra ela, mirava no vazio.
        // O passo em si continua nao acontecendo: ele encara, nao entra.
        this.lastFacing = { dx: next.dx, dy: next.dy };
        if (this.stepDir) this.endWalk(wx, wy);
        else this.look.setFacing(next.dx, next.dy, false);
        break;
      }

      this.stepFrom = { x: wx, y: wy };
      this.stepDir = next;
      this.stepProgress = carry;
      wx = nx;
      wy = ny;
      this.onStep(nx, ny, next.dx, next.dy);
      this.look.setFacing(next.dx, next.dy, true);
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
    this.look.setFacing(this.lastFacing.dx, this.lastFacing.dy, false);
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
    this.stick?.destroy();
    this.stick = undefined;
  }

  // (Houve aqui um `setMouseWalkEnabled`: o mouse deixava de andar e virava MIRA enquanto o
  // revólver estava na mão. O revólver foi arrancado inteiro — nada neste jogo se aponta —, e a
  // chave foi junto: o mouse voltou a ter um trabalho só, ser o dedo de quem não tem tela de toque.)

  /** The direction the hero's sprite currently faces (set the instant a move begins). */
  public get facing(): Dir {
    return this.lastFacing;
  }

  /** (ver HeroFacing.faceTo) */
  public faceTo(...args: Parameters<HeroFacing['faceTo']>): ReturnType<HeroFacing['faceTo']> {
    return this.look.faceTo(...args);
  }

  /** (ver HeroFacing.visualWorld) */
  public visualWorld(...args: Parameters<HeroFacing['visualWorld']>): ReturnType<HeroFacing['visualWorld']> {
    return this.look.visualWorld(...args);
  }
}
