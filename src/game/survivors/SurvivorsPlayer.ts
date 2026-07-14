import Phaser from 'phaser';

import { HERO_FRAMES } from '@/game/constants';
import {
  setHeroWalking,
  WALK_CYCLE_FRAMES,
  WALK_CYCLE_FRAMES_UP,
  type HeroView,
} from '@/game/runtime/HeroView';
import { ARENA_MAX_X, ARENA_MAX_Y, ARENA_MIN_X, ARENA_MIN_Y } from './survivorsWorld';

// ── Movimento contínuo do herói (o único input do modo, como no VS) ───────────
//
// O jogo-base anda por passos de grade (tile + tween); Vampire Survivors é
// velocidade contínua em 8 direções — então este controller substitui o
// PlayerMovementController: posição em tiles FRACIONÁRIOS movida por
// velocity*delta, teclado (setas+WASD) e um "joystick" de arrasto no touch.
// A visão continua a mesma: ele só escreve frame/flip/walking no HeroView e a
// cena espelha o estado no billboard 3D.

const TOUCH_DEADZONE_PX = 14;

export class SurvivorsPlayer {
  public x: number;
  public y: number;
  /** Última direção não nula (normalizada) — a espada corta para cá. */
  public facingX = 0;
  public facingY = 1;

  // Empurrão de dano: um impulso em tiles/s que decai rápido.
  private knockX = 0;
  private knockY = 0;

  private readonly keys: Record<'up' | 'down' | 'left' | 'right' | 'w' | 'a' | 's' | 'd', Phaser.Input.Keyboard.Key | undefined>;

  // Joystick virtual: o vetor do arrasto atual (touch ou mouse pressionado).
  private dragStart: { id: number; x: number; y: number } | null = null;
  private dragVec = { x: 0, y: 0 };

  private readonly boundTouchStart: (e: TouchEvent) => void;
  private readonly boundTouchMove: (e: TouchEvent) => void;
  private readonly boundTouchEnd: (e: TouchEvent) => void;

  public constructor(
    private readonly scene: Phaser.Scene,
    private readonly hero: HeroView,
    startX: number,
    startY: number,
  ) {
    this.x = startX;
    this.y = startY;

    const kb = scene.input.keyboard;
    const add = (code: number): Phaser.Input.Keyboard.Key | undefined => kb?.addKey(code);
    const K = Phaser.Input.Keyboard.KeyCodes;
    this.keys = {
      up: add(K.UP), down: add(K.DOWN), left: add(K.LEFT), right: add(K.RIGHT),
      w: add(K.W), a: add(K.A), s: add(K.S), d: add(K.D),
    };

    // Mouse: segurar e arrastar vira um joystick (mesmo padrão do jogo-base).
    scene.input.on(Phaser.Input.Events.POINTER_DOWN, this.handlePointerDown, this);
    scene.input.on(Phaser.Input.Events.POINTER_MOVE, this.handlePointerMove, this);
    scene.input.on(Phaser.Input.Events.POINTER_UP, this.handlePointerUp, this);
    scene.input.on(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.handlePointerUp, this);

    // Touch em nível de janela, para o arrasto funcionar na tela toda.
    this.boundTouchStart = this.handleTouchStart.bind(this);
    this.boundTouchMove = this.handleTouchMove.bind(this);
    this.boundTouchEnd = this.handleTouchEnd.bind(this);
    window.addEventListener('touchstart', this.boundTouchStart, { passive: true });
    window.addEventListener('touchmove', this.boundTouchMove, { passive: true });
    window.addEventListener('touchend', this.boundTouchEnd, { passive: true });
    window.addEventListener('touchcancel', this.boundTouchEnd, { passive: true });

    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, this.removeWindowListeners, this);
    scene.events.once(Phaser.Scenes.Events.DESTROY, this.removeWindowListeners, this);
  }

  /** Move o herói e anima o HeroView. speedTilesPerSec já vem multiplicada. */
  public update(deltaMs: number, speedTilesPerSec: number): void {
    const dt = deltaMs / 1000;
    let dx = 0;
    let dy = 0;

    if (this.keys.left?.isDown || this.keys.a?.isDown) dx -= 1;
    if (this.keys.right?.isDown || this.keys.d?.isDown) dx += 1;
    if (this.keys.up?.isDown || this.keys.w?.isDown) dy -= 1;
    if (this.keys.down?.isDown || this.keys.s?.isDown) dy += 1;

    // Sem teclado, o joystick de arrasto manda (direção pura, velocidade cheia).
    if (dx === 0 && dy === 0 && (this.dragVec.x !== 0 || this.dragVec.y !== 0)) {
      dx = this.dragVec.x;
      dy = this.dragVec.y;
    }

    const len = Math.hypot(dx, dy);
    if (len > 0) {
      dx /= len;
      dy /= len;
      this.facingX = dx;
      this.facingY = dy;
      this.x += dx * speedTilesPerSec * dt;
      this.y += dy * speedTilesPerSec * dt;
      // O ciclo de passos e o quique andam por DISTÂNCIA (ver HeroView), então os pés não
      // patinam quando a bota/haste sobe a velocidade.
      this.hero.walkDist += speedTilesPerSec * dt;
    }

    // Empurrão de dano por cima do input, decaindo em ~150ms.
    if (this.knockX !== 0 || this.knockY !== 0) {
      this.x += this.knockX * dt;
      this.y += this.knockY * dt;
      const decay = Math.exp(-dt * 9);
      this.knockX *= decay;
      this.knockY *= decay;
      if (Math.abs(this.knockX) + Math.abs(this.knockY) < 0.05) {
        this.knockX = 0;
        this.knockY = 0;
      }
    }

    this.x = Phaser.Math.Clamp(this.x, ARENA_MIN_X + 0.5, ARENA_MAX_X - 0.5);
    this.y = Phaser.Math.Clamp(this.y, ARENA_MIN_Y + 0.5, ARENA_MAX_Y - 0.5);

    this.applyFacing(dx, dy, len > 0);
  }

  /** Empurrão de dano: um shove afastando-se do atacante. */
  public applyKnockback(fromX: number, fromY: number, strengthTiles = 1.4): void {
    const ax = this.x - fromX;
    const ay = this.y - fromY;
    const len = Math.hypot(ax, ay) || 1;
    // Impulso em tiles/s; com o decay ~9/s percorre ~strength/6 tiles.
    this.knockX = (ax / len) * strengthTiles * 6;
    this.knockY = (ay / len) * strengthTiles * 6;
  }

  // A convenção de frames do herói, igual à do jogo-base: os frames 0..3 são o ciclo de
  // caminhada DE FRENTE (os lados o pegam emprestado espelhado) e o 4 é a única pose de
  // costas — então subir não tem ciclo de pernas próprio e vive do quique.
  private applyFacing(dx: number, dy: number, moving: boolean): void {
    const hero = this.hero;
    const goingUp = dy < 0 && Math.abs(dx) < 0.35;
    hero.flipX = Math.abs(dx) >= 0.35 ? dx < 0 : false;
    hero.walkFrames = goingUp ? WALK_CYCLE_FRAMES_UP : WALK_CYCLE_FRAMES;

    if (!moving) {
      if (hero.walking) setHeroWalking(hero, false);
      hero.frame = goingUp ? HERO_FRAMES.idleUp : HERO_FRAMES.idleDown;
      return;
    }
    setHeroWalking(hero, true);
  }

  // ── joystick de arrasto ──────────────────────────────────────────────────────

  private resolveDrag(deltaX: number, deltaY: number): void {
    const len = Math.hypot(deltaX, deltaY);
    if (len < TOUCH_DEADZONE_PX) {
      this.dragVec = { x: 0, y: 0 };
      return;
    }
    this.dragVec = { x: deltaX / len, y: deltaY / len };
  }

  private handlePointerDown(pointer: Phaser.Input.Pointer): void {
    if (pointer.wasTouch) return;
    this.dragStart = { id: pointer.id, x: pointer.x, y: pointer.y };
  }

  private handlePointerMove(pointer: Phaser.Input.Pointer): void {
    if (pointer.wasTouch || !this.dragStart || !pointer.isDown) return;
    if (this.dragStart.id !== pointer.id) return;
    this.resolveDrag(pointer.x - this.dragStart.x, pointer.y - this.dragStart.y);
  }

  private handlePointerUp(pointer: Phaser.Input.Pointer): void {
    if (pointer.wasTouch || !this.dragStart || this.dragStart.id !== pointer.id) return;
    this.dragStart = null;
    this.dragVec = { x: 0, y: 0 };
  }

  private handleTouchStart(e: TouchEvent): void {
    if (this.dragStart !== null) return;
    const t = e.changedTouches[0];
    this.dragStart = { id: t.identifier, x: t.clientX, y: t.clientY };
  }

  private handleTouchMove(e: TouchEvent): void {
    if (!this.dragStart) return;
    const t = Array.from(e.changedTouches).find((c) => c.identifier === this.dragStart!.id);
    if (!t) return;
    this.resolveDrag(t.clientX - this.dragStart.x, t.clientY - this.dragStart.y);
  }

  private handleTouchEnd(e: TouchEvent): void {
    if (!this.dragStart) return;
    const t = Array.from(e.changedTouches).find((c) => c.identifier === this.dragStart!.id);
    if (!t) return;
    this.dragStart = null;
    this.dragVec = { x: 0, y: 0 };
  }

  private removeWindowListeners(): void {
    window.removeEventListener('touchstart', this.boundTouchStart);
    window.removeEventListener('touchmove', this.boundTouchMove);
    window.removeEventListener('touchend', this.boundTouchEnd);
    window.removeEventListener('touchcancel', this.boundTouchEnd);
  }
}
