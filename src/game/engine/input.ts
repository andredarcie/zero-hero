/**
 * A ENTRADA — teclado, mouse e toque, como o InputManager, o KeyboardManager/KeyboardPlugin, o Pointer e o
 * InputPlugin (licenças em LICENSES.md). O que importa para o jogo, ao pé da letra:
 *
 *   • Cada tecla apertada vai para uma fila e é processada NA HORA (eventos `keydown-X`, `keydown`, `keyup`, e o
 *     `isDown`/`JustDown` das teclas registradas); a fila se esvazia no fim do passo (POST_STEP) e um mesmo evento
 *     nunca é contado duas vezes (o filtro de código + carimbo de tempo + tipo).
 *   • Tecla capturada (`addCapture`, `addKey`) sem modificador tem o `preventDefault` do navegador.
 *   • Perder o foco da janela, pausar ou dormir a cena solta todas as teclas.
 *   • Mouse e toque viram ponteiros (o 0 é o mouse, o 1 o dedo); o `pointerdown` da cena só sai para toques NO
 *     canvas (fora dele é `pointerdownoutside`), e soltar fora do canvas é `pointerupoutside`.
 *   • Objetos com `setInteractive()` recebem `pointerdown/over/out/up/move`, testados pelo retângulo deles na
 *     câmera, e só o de cima (topOnly) conta.
 */
import { EventEmitter } from './events';
import { CoreEvents, InputEvents, KeyboardEvents, SceneEvents } from './constants';
import type { Game } from './game';
import type { EnginePage } from './host';
import type { Systems, Scene } from './scene';
import type { Camera } from './camera';
import { TransformMatrix } from './matrix';
import type { GameObject } from './gameobjects/GameObject';

// ── As teclas ───────────────────────────────────────────────────────────────────────────────────

export const KeyCodes = {
  BACKSPACE: 8, TAB: 9, ENTER: 13, SHIFT: 16, CTRL: 17, ALT: 18, PAUSE: 19, CAPS_LOCK: 20, ESC: 27, SPACE: 32,
  PAGE_UP: 33, PAGE_DOWN: 34, END: 35, HOME: 36, LEFT: 37, UP: 38, RIGHT: 39, DOWN: 40, PRINT_SCREEN: 42, INSERT: 45,
  DELETE: 46, ZERO: 48, ONE: 49, TWO: 50, THREE: 51, FOUR: 52, FIVE: 53, SIX: 54, SEVEN: 55, EIGHT: 56, NINE: 57,
  NUMPAD_ZERO: 96, NUMPAD_ONE: 97, NUMPAD_TWO: 98, NUMPAD_THREE: 99, NUMPAD_FOUR: 100, NUMPAD_FIVE: 101,
  NUMPAD_SIX: 102, NUMPAD_SEVEN: 103, NUMPAD_EIGHT: 104, NUMPAD_NINE: 105, NUMPAD_ADD: 107, NUMPAD_SUBTRACT: 109,
  A: 65, B: 66, C: 67, D: 68, E: 69, F: 70, G: 71, H: 72, I: 73, J: 74, K: 75, L: 76, M: 77, N: 78, O: 79, P: 80,
  Q: 81, R: 82, S: 83, T: 84, U: 85, V: 86, W: 87, X: 88, Y: 89, Z: 90, F1: 112, F2: 113, F3: 114, F4: 115,
  F5: 116, F6: 117, F7: 118, F8: 119, F9: 120, F10: 121, F11: 122, F12: 123, SEMICOLON: 186, PLUS: 187, COMMA: 188,
  MINUS: 189, PERIOD: 190, FORWARD_SLASH: 191, BACK_SLASH: 220, QUOTES: 222, BACKTICK: 192, OPEN_BRACKET: 219,
  CLOSED_BRACKET: 221, SEMICOLON_FIREFOX: 59, COLON: 58, COMMA_FIREFOX_WINDOWS: 60, COMMA_FIREFOX: 62,
  BRACKET_RIGHT_FIREFOX: 174, BRACKET_LEFT_FIREFOX: 175,
} as const;

const KeyMap: Record<number, string> = {};
for (const key of Object.keys(KeyCodes) as Array<keyof typeof KeyCodes>) KeyMap[KeyCodes[key]] = key;

type QueuedKeyEvent = KeyboardEvent & { cancelled?: number };

export class Key extends EventEmitter {
  public originalEvent: KeyboardEvent | undefined;
  public enabled = true;
  public isDown = false;
  public isUp = true;
  public altKey = false;
  public ctrlKey = false;
  public shiftKey = false;
  public metaKey = false;
  public location = 0;
  public timeDown = 0;
  public duration = 0;
  public timeUp = 0;
  public emitOnRepeat = false;
  public repeats = 0;
  public _justDown = false;
  public _justUp = false;
  public _tick = -1;

  public constructor(public readonly plugin: KeyboardPlugin, public readonly keyCode: number) {
    super();
  }

  public setEmitOnRepeat(value: boolean): this {
    this.emitOnRepeat = value;
    return this;
  }

  public onDown(event: KeyboardEvent): void {
    this.originalEvent = event;
    if (!this.enabled) return;
    this.altKey = event.altKey;
    this.ctrlKey = event.ctrlKey;
    this.shiftKey = event.shiftKey;
    this.metaKey = event.metaKey;
    this.location = event.location;
    this.repeats++;
    if (!this.isDown) {
      this.isDown = true;
      this.isUp = false;
      this.timeDown = event.timeStamp;
      this.duration = 0;
      this._justDown = true;
      this._justUp = false;
      this.emit(KeyboardEvents.DOWN, this, event);
    } else if (this.emitOnRepeat) {
      this.emit(KeyboardEvents.DOWN, this, event);
    }
  }

  public onUp(event: KeyboardEvent): void {
    this.originalEvent = event;
    if (!this.enabled) return;
    this.isDown = false;
    this.isUp = true;
    this.timeUp = event.timeStamp;
    this.duration = this.timeUp - this.timeDown;
    this.repeats = 0;
    this._justDown = false;
    this._justUp = true;
    this._tick = -1;
    this.emit(KeyboardEvents.UP, this, event);
  }

  public reset(): this {
    this.isDown = false;
    this.isUp = true;
    this.altKey = false;
    this.ctrlKey = false;
    this.shiftKey = false;
    this.metaKey = false;
    this.timeDown = 0;
    this.duration = 0;
    this.timeUp = 0;
    this.repeats = 0;
    this._justDown = false;
    this._justUp = false;
    this._tick = -1;
    return this;
  }

  public destroy(): void {
    this.removeAllListeners();
    this.originalEvent = undefined;
  }
}

/** Leitura destrutiva: verdade uma vez por aperto. */
export const JustDown = (key: Key): boolean => {
  if (key._justDown) {
    key._justDown = false;
    return true;
  }
  return false;
};

export const JustUp = (key: Key): boolean => {
  if (key._justUp) {
    key._justUp = false;
    return true;
  }
  return false;
};

export interface CursorKeys { up: Key; down: Key; left: Key; right: Key; space: Key; shift: Key }

const toKeyCode = (code: string | number): number => (typeof code === 'string' ? KeyCodes[code.trim().toUpperCase() as keyof typeof KeyCodes] : code);

/** O teclado do jogo inteiro: escuta a janela, enfileira e manda processar na hora. */
export class KeyboardManager {
  public queue: QueuedKeyEvent[] = [];
  public preventDefault = true;
  public readonly captures: number[] = [];
  public enabled = false;

  public constructor(private readonly manager: InputManager) {
    manager.events.once('boot', this.boot, this);
  }

  private boot(): void {
    this.enabled = true;
    this.startListeners();
    this.manager.game.events.on(CoreEvents.POST_STEP, this.postUpdate, this);
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => this.onKey(event);
  private readonly onKeyUp = (event: KeyboardEvent): void => this.onKey(event);

  private onKey(event: KeyboardEvent): void {
    if (event.defaultPrevented || !this.enabled) return;
    this.queue.push(event);
    this.manager.events.emit(InputEvents.MANAGER_PROCESS);
    const modified = event.altKey || event.ctrlKey || event.shiftKey || event.metaKey;
    if (this.preventDefault && !modified && this.captures.indexOf(event.keyCode) > -1) event.preventDefault();
  }

  private startListeners(): void {
    const target = this.manager.game.host.page?.keyboardTarget;
    target?.addEventListener('keydown', this.onKeyDown as EventListener, false);
    target?.addEventListener('keyup', this.onKeyUp as EventListener, false);
    this.enabled = true;
  }

  private postUpdate(): void {
    this.queue = [];
  }

  public addCapture(keycode: string | number | Array<string | number>): void {
    let list: Array<string | number>;
    if (typeof keycode === 'string') list = keycode.split(',');
    else if (Array.isArray(keycode)) list = keycode;
    else list = [keycode];
    for (const code of list) {
      const c = toKeyCode(code);
      if (this.captures.indexOf(c) === -1) this.captures.push(c);
    }
    this.preventDefault = this.captures.length > 0;
  }

  public removeCapture(keycode: string | number | Array<string | number>): void {
    let list: Array<string | number>;
    if (typeof keycode === 'string') list = keycode.split(',');
    else if (Array.isArray(keycode)) list = keycode;
    else list = [keycode];
    for (const code of list) {
      const c = toKeyCode(code);
      const i = this.captures.indexOf(c);
      if (i > -1) this.captures.splice(i, 1);
    }
    this.preventDefault = this.captures.length > 0;
  }

  public clearCaptures(): void {
    this.captures.length = 0;
    this.preventDefault = false;
  }

  public destroy(): void {
    const target = this.manager.game.host.page?.keyboardTarget;
    target?.removeEventListener('keydown', this.onKeyDown as EventListener, false);
    target?.removeEventListener('keyup', this.onKeyUp as EventListener, false);
    this.queue = [];
  }
}

/** O teclado de UMA cena (`this.input.keyboard`). */
export class KeyboardPlugin extends EventEmitter {
  public enabled = true;
  public keys: Key[] = [];
  private prevCode: number | null = null;
  private prevTime = 0;
  private prevType: string | null = null;
  private readonly scene: Scene;
  private readonly manager: KeyboardManager;

  public constructor(private readonly sceneInputPlugin: InputPlugin) {
    super();
    this.scene = sceneInputPlugin.scene;
    this.manager = sceneInputPlugin.manager.keyboard;
    sceneInputPlugin.pluginEvents.once('boot', this.boot, this);
    sceneInputPlugin.pluginEvents.on('start', this.start, this);
  }

  private boot(): void {
    this.sceneInputPlugin.pluginEvents.once('destroy', this.destroy, this);
  }

  private start(): void {
    this.sceneInputPlugin.manager.events.on(InputEvents.MANAGER_PROCESS, this.update, this);
    this.sceneInputPlugin.pluginEvents.once('shutdown', this.shutdown, this);
    this.sceneInputPlugin.manager.game.events.on(CoreEvents.BLUR, this.resetKeys, this);
    this.scene.sys.events.on(SceneEvents.PAUSE, this.resetKeys, this);
    this.scene.sys.events.on(SceneEvents.SLEEP, this.resetKeys, this);
  }

  public isActive(): boolean {
    return this.enabled && this.scene.sys.canInput();
  }

  public addCapture(keycode: string | number | Array<string | number>): this {
    this.manager.addCapture(keycode);
    return this;
  }

  public removeCapture(keycode: string | number | Array<string | number>): this {
    this.manager.removeCapture(keycode);
    return this;
  }

  public createCursorKeys(): CursorKeys {
    return this.addKeys({
      up: KeyCodes.UP, down: KeyCodes.DOWN, left: KeyCodes.LEFT, right: KeyCodes.RIGHT, space: KeyCodes.SPACE, shift: KeyCodes.SHIFT,
    }) as unknown as CursorKeys;
  }

  public addKeys(keys: Record<string, number | string>, enableCapture = true, emitOnRepeat = false): Record<string, Key> {
    const output: Record<string, Key> = {};
    for (const name of Object.keys(keys)) output[name] = this.addKey(keys[name], enableCapture, emitOnRepeat);
    return output;
  }

  public addKey(key: Key | number | string, enableCapture = true, emitOnRepeat = false): Key {
    const keys = this.keys;
    if (key instanceof Key) {
      const idx = keys.indexOf(key);
      if (idx > -1) keys[idx] = key;
      else keys[key.keyCode] = key;
      if (enableCapture) this.addCapture(key.keyCode);
      key.setEmitOnRepeat(emitOnRepeat);
      return key;
    }
    const code = typeof key === 'string' ? KeyCodes[key.toUpperCase() as keyof typeof KeyCodes] : key;
    if (!keys[code]) {
      keys[code] = new Key(this, code);
      if (enableCapture) this.addCapture(code);
      keys[code].setEmitOnRepeat(emitOnRepeat);
    }
    return keys[code];
  }

  public removeKey(key: Key | number | string, destroy = false, removeCapture = false): this {
    const keys = this.keys;
    let ref: Key | undefined;
    if (key instanceof Key) {
      const idx = keys.indexOf(key);
      if (idx > -1) { ref = keys[idx]; delete keys[idx]; }
    } else {
      const code = typeof key === 'string' ? KeyCodes[key.toUpperCase() as keyof typeof KeyCodes] : key;
      if (keys[code]) { ref = keys[code]; delete keys[code]; }
    }
    if (ref) {
      if (removeCapture) this.removeCapture(ref.keyCode);
      if (destroy) ref.destroy();
    }
    return this;
  }

  public removeAllKeys(destroy = false): this {
    const keys = this.keys;
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      if (key) {
        delete keys[i];
        if (destroy) key.destroy();
      }
    }
    return this;
  }

  private update(): void {
    const queue = this.manager.queue;
    const len = queue.length;
    if (!this.isActive() || len === 0) return;
    const keys = this.keys;
    for (let i = 0; i < len; i++) {
      const event = queue[i];
      const code = event.keyCode;
      const key = keys[code];
      let repeat = false;
      if (event.cancelled === undefined) {
        event.cancelled = 0;
        const ev = event as QueuedKeyEvent & { stopImmediatePropagation: () => void; stopPropagation: () => void };
        ev.stopImmediatePropagation = () => { event.cancelled = 1; };
        ev.stopPropagation = () => { event.cancelled = -1; };
      }
      if (event.cancelled === -1) continue;
      if (code === this.prevCode && event.timeStamp === this.prevTime && event.type === this.prevType) continue;
      this.prevCode = code;
      this.prevTime = event.timeStamp;
      this.prevType = event.type;
      if (event.type === 'keydown') {
        if (key) {
          repeat = key.isDown;
          key.onDown(event);
        }
        if (!event.cancelled && (!key || !repeat)) {
          if (KeyMap[code]) this.emit(KeyboardEvents.KEY_DOWN + KeyMap[code], event);
          if (!event.cancelled) this.emit(KeyboardEvents.ANY_KEY_DOWN, event);
        }
      } else {
        if (key) key.onUp(event);
        if (!event.cancelled) {
          if (KeyMap[code]) this.emit(KeyboardEvents.KEY_UP + KeyMap[code], event);
          if (!event.cancelled) this.emit(KeyboardEvents.ANY_KEY_UP, event);
        }
      }
      if (event.cancelled === 1) event.cancelled = 0;
    }
  }

  public resetKeys(): this {
    const keys = this.keys;
    for (let i = 0; i < keys.length; i++) {
      if (keys[i]) keys[i].reset();
    }
    return this;
  }

  private shutdown(): void {
    this.removeAllKeys(true);
    this.removeAllListeners();
    this.sceneInputPlugin.manager.events.off(InputEvents.MANAGER_PROCESS, this.update, this);
    // O BLUR sai SEM o contexto (fica o de todas as cenas); o efeito é o mesmo para o jogo.
    this.sceneInputPlugin.manager.game.events.off(CoreEvents.BLUR, this.resetKeys);
    this.scene.sys.events.off(SceneEvents.PAUSE, this.resetKeys, this);
    this.scene.sys.events.off(SceneEvents.SLEEP, this.resetKeys, this);
  }

  private destroy(): void {
    this.shutdown();
    this.keys.length = 0;
  }
}

// ── Os ponteiros ────────────────────────────────────────────────────────────────────────────────

const smoothStep = (x: number, min: number, max: number): number => {
  if (x <= min) return 0;
  if (x >= max) return 1;
  x = (x - min) / (max - min);
  return x * x * (3 - 2 * x);
};

const smoothStepInterpolation = (t: number, min: number, max: number): number => min + (max - min) * smoothStep(t, 0, 1);

export class Pointer {
  public event: MouseEvent | TouchEvent | WheelEvent | undefined;
  public downElement: EventTarget | null = null;
  public upElement: EventTarget | null = null;
  public camera: Camera | null = null;
  public button = 0;
  public buttons = 0;
  public readonly position = { x: 0, y: 0 };
  public readonly prevPosition = { x: 0, y: 0 };
  public readonly midPoint = { x: -1, y: -1 };
  public readonly velocity = { x: 0, y: 0 };
  public angle = 0;
  public distance = 0;
  public smoothFactor = 0;
  public motionFactor = 0.2;
  public worldX = 0;
  public worldY = 0;
  public moveTime = 0;
  public downX = 0;
  public downY = 0;
  public downTime = 0;
  public upX = 0;
  public upY = 0;
  public upTime = 0;
  public primaryDown = false;
  public isDown = false;
  public wasTouch = false;
  public wasCanceled = false;
  public movementX = 0;
  public movementY = 0;
  public identifier = 0;
  public pointerId: number | null = null;
  public target: EventTarget | null = null;
  public active: boolean;
  public locked = false;
  public deltaX = 0;
  public deltaY = 0;
  public deltaZ = 0;

  public constructor(private readonly manager: InputManager, public readonly id: number) {
    this.active = id === 0;
  }

  public get x(): number { return this.position.x; }
  public set x(value: number) { this.position.x = value; }
  public get y(): number { return this.position.y; }
  public set y(value: number) { this.position.y = value; }

  public updateMotion(): void {
    const cx = this.position.x;
    const cy = this.position.y;
    const mx = this.midPoint.x;
    const my = this.midPoint.y;
    if (cx === mx && cy === my) return;
    let vx = smoothStepInterpolation(this.motionFactor, mx, cx);
    let vy = smoothStepInterpolation(this.motionFactor, my, cy);
    if (Math.abs(vx - cx) < 0.1) vx = cx;
    if (Math.abs(vy - cy) < 0.1) vy = cy;
    this.midPoint.x = vx;
    this.midPoint.y = vy;
    const dx = cx - vx;
    const dy = cy - vy;
    this.velocity.x = dx;
    this.velocity.y = dy;
    this.angle = Math.atan2(cy - vy, cx - vx);
    this.distance = Math.sqrt(dx * dx + dy * dy);
  }

  public up(event: MouseEvent): void {
    if ('buttons' in event) this.buttons = event.buttons;
    this.event = event;
    this.button = event.button;
    this.upElement = event.target;
    this.manager.transformPointer(this, event.pageX, event.pageY, false);
    if (event.button === 0) {
      this.primaryDown = false;
      this.upX = this.x;
      this.upY = this.y;
    }
    if (this.buttons === 0) {
      this.isDown = false;
      this.upTime = event.timeStamp;
      this.wasTouch = false;
    }
  }

  public down(event: MouseEvent): void {
    if ('buttons' in event) this.buttons = event.buttons;
    this.event = event;
    this.button = event.button;
    this.downElement = event.target;
    this.manager.transformPointer(this, event.pageX, event.pageY, false);
    if (event.button === 0) {
      this.primaryDown = true;
      this.downX = this.x;
      this.downY = this.y;
    }
    if (this.manager.game.host.page?.mac && event.ctrlKey) {
      this.buttons = 2;
      this.primaryDown = false;
    }
    if (!this.isDown) {
      this.isDown = true;
      this.downTime = event.timeStamp;
    }
    this.wasTouch = false;
  }

  public move(event: MouseEvent): void {
    if ('buttons' in event) this.buttons = event.buttons;
    this.event = event;
    this.manager.transformPointer(this, event.pageX, event.pageY, true);
    if (this.locked) {
      this.movementX = event.movementX || 0;
      this.movementY = event.movementY || 0;
    }
    this.moveTime = event.timeStamp;
    this.wasTouch = false;
  }

  public wheel(event: WheelEvent): void {
    if ('buttons' in event) this.buttons = event.buttons;
    this.event = event;
    this.manager.transformPointer(this, event.pageX, event.pageY, false);
    this.deltaX = event.deltaX;
    this.deltaY = event.deltaY;
    this.deltaZ = event.deltaZ;
    this.wasTouch = false;
  }

  public touchmove(touch: Touch, event: TouchEvent): void {
    this.event = event;
    this.manager.transformPointer(this, touch.pageX, touch.pageY, true);
    this.moveTime = event.timeStamp;
    this.wasTouch = true;
    this.updateMotion();
  }

  public touchstart(touch: Touch, event: TouchEvent): void {
    const withId = touch as Touch & { pointerId?: number };
    if (withId.pointerId) this.pointerId = withId.pointerId;
    this.identifier = touch.identifier;
    this.target = touch.target;
    this.active = true;
    this.buttons = 1;
    this.event = event;
    this.downElement = touch.target;
    this.manager.transformPointer(this, touch.pageX, touch.pageY, false);
    this.primaryDown = true;
    this.downX = this.x;
    this.downY = this.y;
    this.downTime = event.timeStamp;
    this.isDown = true;
    this.wasTouch = true;
    this.wasCanceled = false;
    this.updateMotion();
  }

  public touchend(touch: Touch, event: TouchEvent): void {
    this.buttons = 0;
    this.event = event;
    this.upElement = touch.target;
    this.manager.transformPointer(this, touch.pageX, touch.pageY, false);
    this.primaryDown = false;
    this.upX = this.x;
    this.upY = this.y;
    this.upTime = event.timeStamp;
    this.isDown = false;
    this.wasTouch = true;
    this.wasCanceled = false;
    this.active = false;
    this.updateMotion();
  }

  public touchcancel(touch: Touch, event: TouchEvent): void {
    this.buttons = 0;
    this.event = event;
    this.upElement = touch.target;
    this.manager.transformPointer(this, touch.pageX, touch.pageY, false);
    this.primaryDown = false;
    this.upX = this.x;
    this.upY = this.y;
    this.upTime = event.timeStamp;
    this.isDown = false;
    this.wasTouch = true;
    this.wasCanceled = true;
    this.active = false;
  }

  public leftButtonDown(): boolean { return (this.buttons & 1) !== 0; }
  public rightButtonDown(): boolean { return (this.buttons & 2) !== 0; }
  public middleButtonDown(): boolean { return (this.buttons & 4) !== 0; }
  public backButtonDown(): boolean { return (this.buttons & 8) !== 0; }
  public forwardButtonDown(): boolean { return (this.buttons & 16) !== 0; }
  public noButtonDown(): boolean { return this.buttons === 0; }
}

const MOUSE_DOWN = 0;
const MOUSE_MOVE = 1;
const MOUSE_UP = 2;
const TOUCH_START = 3;
const TOUCH_MOVE = 4;
const TOUCH_END = 5;
const TOUCH_CANCEL = 7;
const MOUSE_WHEEL = 9;

export interface InteractiveObject {
  gameObject: GameObject | undefined;
  enabled: boolean;
  draggable: boolean;
  dropZone: boolean;
  cursor: string | false;
  hitArea: { x: number; y: number; width: number; height: number } | undefined;
  hitAreaCallback: ((hitArea: { x: number; y: number; width: number; height: number }, x: number, y: number, gameObject: GameObject) => boolean) | undefined;
  customHitArea: boolean;
  localX: number;
  localY: number;
  dragState: number;
}

/** O RectangleContains: bordas inclusas, retângulo vazio nunca contém. */
const RectangleContains = (rect: { x: number; y: number; width: number; height: number }, x: number, y: number): boolean => {
  if (rect.width <= 0 || rect.height <= 0) return false;
  return rect.x <= x && rect.x + rect.width >= x && rect.y <= y && rect.y + rect.height >= y;
};

/** A inversa da transformação do objeto (o TransformXY). */
const TransformXY = (x: number, y: number, positionX: number, positionY: number, rotation: number, scaleX: number, scaleY: number, output: { x: number; y: number }): { x: number; y: number } => {
  const radianSin = Math.sin(rotation);
  const radianCos = Math.cos(rotation);
  const a = radianCos * scaleX;
  const b = radianSin * scaleX;
  const c = -radianSin * scaleY;
  const d = radianCos * scaleY;
  const id = 1 / ((a * d) + (c * -b));
  output.x = (d * id * x) + (-c * id * y) + (((positionY * c) - (positionX * d)) * id);
  output.y = (a * id * y) + (-b * id * x) + (((-positionY * a) + (positionX * b)) * id);
  return output;
};

/** O gerenciador global: os ouvintes do DOM, os ponteiros e o teste de acerto. */
export class InputManager {
  public readonly events = new EventEmitter();
  public enabled = true;
  public isOver = true;
  public defaultCursor = '';
  public readonly keyboard: KeyboardManager;
  public readonly pointers: Pointer[] = [];
  public readonly pointersTotal = 1;
  public readonly mousePointer: Pointer;
  public activePointer: Pointer;
  public readonly globalTopOnly = true;
  public time = 0;
  public canvas!: HTMLCanvasElement;
  /** Onde o mouse e o toque são ouvidos (o próprio canvas, no navegador; ver host.ts). */
  private pointerTarget: EventTarget | null = null;

  /** O alvo dos eventos de ponteiro: um evento que nasceu nele foi DENTRO do jogo (o canvas, no navegador). */
  public get eventTarget(): EventTarget | null {
    return this.pointerTarget;
  }
  private readonly tempPoint = { x: 0, y: 0 };
  private readonly tempHitTest: GameObject[] = [];
  private readonly tempMatrix = new TransformMatrix();
  private readonly tempMatrix2 = new TransformMatrix();
  private tempSkip = false;
  private readonly mousePointerContainer: Pointer[];
  public readonly mouse = { disableContextMenu: (): void => this.disableContextMenu() };
  private contextMenuDisabled = false;

  public constructor(public readonly game: Game) {
    this.keyboard = new KeyboardManager(this);
    for (let i = 0; i <= this.pointersTotal; i++) this.pointers.push(new Pointer(this, i));
    this.mousePointer = this.pointers[0];
    this.activePointer = this.pointers[0];
    this.mousePointerContainer = [this.mousePointer];
    game.events.once(CoreEvents.BOOT, this.boot, this);
  }

  private boot(): void {
    this.canvas = this.game.canvas;
    this.events.emit('boot');
    const page = this.game.host.page;
    if (page) {
      this.pointerTarget = page.pointerTarget(this.canvas);
      this.startMouseListeners(page, this.pointerTarget);
      if (this.game.config.inputTouch) this.startTouchListeners(page, this.pointerTarget);
    }
    this.game.events.on(CoreEvents.PRE_RENDER, this.preRender, this);
    this.game.events.once(CoreEvents.DESTROY, this.destroy, this);
  }

  private disableContextMenu(): void {
    if (this.contextMenuDisabled) return;
    this.contextMenuDisabled = true;
    this.pointerTarget?.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      return false;
    });
  }

  // ── Mouse (o MouseManager) ──
  private startMouseListeners(page: EnginePage, canvas: EventTarget): void {
    const ok = (event: Event): boolean => !event.defaultPrevented && this.enabled;
    const on = <K extends keyof HTMLElementEventMap>(type: K, fn: (event: HTMLElementEventMap[K]) => void, options?: AddEventListenerOptions): void => {
      canvas.addEventListener(type, fn as EventListener, options);
    };
    on('mousemove', (event) => {
      if (ok(event)) {
        this.onMouseMove(event);
        event.preventDefault();
      }
    });
    on('mousedown', (event) => {
      if (this.game.config.autoFocus) page.focus();
      if (ok(event)) {
        this.onMouseDown(event);
        if (event.target === canvas) event.preventDefault();
      }
    });
    on('mouseup', (event) => {
      if (ok(event)) {
        this.onMouseUp(event);
        if (event.target === canvas) event.preventDefault();
      }
    });
    on('mouseover', (event) => { if (ok(event)) this.setCanvasOver(event); }, { passive: true });
    on('mouseout', (event) => { if (ok(event)) this.setCanvasOut(event); }, { passive: true });
    on('wheel', (event) => {
      if (ok(event)) this.onMouseWheel(event);
      if (event.target === canvas) event.preventDefault();
    }, { passive: false });
    const fromTouch = (event: MouseEvent): boolean => Boolean((event as MouseEvent & { sourceCapabilities?: { firesTouchEvents?: boolean } }).sourceCapabilities?.firesTouchEvents);
    page.addTopListener('mousedown', (e) => {
      const event = e as MouseEvent;
      if (fromTouch(event)) return;
      if (ok(event) && event.target !== canvas) this.onMouseDown(event);
    }, { passive: true });
    page.addTopListener('mouseup', (e) => {
      const event = e as MouseEvent;
      if (fromTouch(event)) return;
      if (ok(event) && event.target !== canvas) this.onMouseUp(event);
    }, { passive: true });
  }

  // ── Toque (o TouchManager) ──
  private startTouchListeners(page: EnginePage, canvas: EventTarget): void {
    const ok = (event: Event): boolean => !event.defaultPrevented && this.enabled;
    const nonPassive = { passive: false };
    const on = (type: 'touchstart' | 'touchmove' | 'touchend' | 'touchcancel', fn: (event: TouchEvent) => void): void => {
      canvas.addEventListener(type, fn as EventListener, nonPassive);
    };
    on('touchstart', (event) => {
      if (this.game.config.autoFocus) page.focus();
      if (ok(event)) {
        this.onTouchStart(event);
        if (event.cancelable && event.target === canvas) event.preventDefault();
      }
    });
    on('touchmove', (event) => {
      if (ok(event)) {
        this.onTouchMove(event);
        if (event.cancelable) event.preventDefault();
      }
    });
    on('touchend', (event) => {
      if (ok(event)) {
        this.onTouchEnd(event);
        if (event.cancelable && event.target === canvas) event.preventDefault();
      }
    });
    on('touchcancel', (event) => {
      if (ok(event)) {
        this.onTouchCancel(event);
        event.preventDefault();
      }
    });
    page.addTopListener('touchstart', (e) => {
      const event = e as TouchEvent;
      if (ok(event) && event.target !== canvas) this.onTouchStart(event);
    }, nonPassive);
    page.addTopListener('touchend', (e) => {
      const event = e as TouchEvent;
      if (ok(event) && event.target !== canvas) this.onTouchEnd(event);
    }, nonPassive);
    page.addTopListener('touchcancel', (e) => {
      const event = e as TouchEvent;
      if (ok(event)) this.onTouchCancel(event);
    }, nonPassive);
  }

  public setCanvasOver(event: Event): void {
    this.isOver = true;
    this.events.emit(InputEvents.GAME_OVER, event);
  }

  public setCanvasOut(event: Event): void {
    this.isOver = false;
    this.events.emit(InputEvents.GAME_OUT, event);
  }

  private preRender(): void {
    const time = this.game.loop.now;
    const delta = this.game.loop.delta;
    const scenes = this.game.scene.getScenes(true, true);
    this.time = time;
    this.events.emit('update');
    for (const scene of scenes) {
      if (scene.sys.input && scene.sys.input.updatePoll(time, delta) && this.globalTopOnly) return;
    }
  }

  private updateInputPlugins(type: number, pointers: Pointer[]): void {
    const scenes = this.game.scene.getScenes(false, true);
    this.tempSkip = false;
    for (const scene of scenes) {
      if (scene.sys.input) {
        const capture = scene.sys.input.update(type, pointers);
        if ((capture && this.globalTopOnly) || this.tempSkip) return;
      }
    }
  }

  private onTouchStart(event: TouchEvent): void {
    const changed: Pointer[] = [];
    for (let c = 0; c < event.changedTouches.length; c++) {
      const changedTouch = event.changedTouches[c];
      for (let i = 1; i < this.pointers.length; i++) {
        const pointer = this.pointers[i];
        if (!pointer.active) {
          pointer.touchstart(changedTouch, event);
          this.activePointer = pointer;
          changed.push(pointer);
          break;
        }
      }
    }
    this.updateInputPlugins(TOUCH_START, changed);
  }

  private onTouchMove(event: TouchEvent): void {
    const changed: Pointer[] = [];
    for (let c = 0; c < event.changedTouches.length; c++) {
      const changedTouch = event.changedTouches[c];
      for (let i = 1; i < this.pointers.length; i++) {
        const pointer = this.pointers[i];
        if (pointer.active && pointer.identifier === changedTouch.identifier) {
          const element = this.game.host.page?.elementFromPoint(changedTouch.clientX, changedTouch.clientY);
          const overCanvas = element === this.pointerTarget;
          if (!this.isOver && overCanvas) this.setCanvasOver(event);
          else if (this.isOver && !overCanvas) this.setCanvasOut(event);
          if (this.isOver) {
            pointer.touchmove(changedTouch, event);
            this.activePointer = pointer;
            changed.push(pointer);
          }
          break;
        }
      }
    }
    this.updateInputPlugins(TOUCH_MOVE, changed);
  }

  private onTouchEnd(event: TouchEvent): void {
    const changed: Pointer[] = [];
    for (let c = 0; c < event.changedTouches.length; c++) {
      const changedTouch = event.changedTouches[c];
      for (let i = 1; i < this.pointers.length; i++) {
        const pointer = this.pointers[i];
        if (pointer.active && pointer.identifier === changedTouch.identifier) {
          pointer.touchend(changedTouch, event);
          changed.push(pointer);
          break;
        }
      }
    }
    this.updateInputPlugins(TOUCH_END, changed);
  }

  private onTouchCancel(event: TouchEvent): void {
    const changed: Pointer[] = [];
    for (let c = 0; c < event.changedTouches.length; c++) {
      const changedTouch = event.changedTouches[c];
      for (let i = 1; i < this.pointers.length; i++) {
        const pointer = this.pointers[i];
        if (pointer.active && pointer.identifier === changedTouch.identifier) {
          pointer.touchcancel(changedTouch, event);
          changed.push(pointer);
          break;
        }
      }
    }
    this.updateInputPlugins(TOUCH_CANCEL, changed);
  }

  private onMouseDown(event: MouseEvent): void {
    this.mousePointer.down(event);
    this.mousePointer.updateMotion();
    this.activePointer = this.mousePointer;
    this.updateInputPlugins(MOUSE_DOWN, this.mousePointerContainer);
  }

  private onMouseMove(event: MouseEvent): void {
    this.mousePointer.move(event);
    this.mousePointer.updateMotion();
    this.activePointer = this.mousePointer;
    this.updateInputPlugins(MOUSE_MOVE, this.mousePointerContainer);
  }

  private onMouseUp(event: MouseEvent): void {
    this.mousePointer.up(event);
    this.mousePointer.updateMotion();
    this.activePointer = this.mousePointer;
    this.updateInputPlugins(MOUSE_UP, this.mousePointerContainer);
  }

  private onMouseWheel(event: WheelEvent): void {
    this.mousePointer.wheel(event);
    this.activePointer = this.mousePointer;
    this.updateInputPlugins(MOUSE_WHEEL, this.mousePointerContainer);
  }

  public transformPointer(pointer: Pointer, pageX: number, pageY: number, wasMove: boolean): void {
    const p0 = pointer.position;
    const p1 = pointer.prevPosition;
    p1.x = p0.x;
    p1.y = p0.y;
    const x = this.game.scale.transformX(pageX);
    const y = this.game.scale.transformY(pageY);
    const a = pointer.smoothFactor;
    if (!wasMove || a === 0) {
      p0.x = x;
      p0.y = y;
    } else {
      p0.x = x * a + p1.x * (1 - a);
      p0.y = y * a + p1.y * (1 - a);
    }
  }

  public setCursor(interactiveObject: InteractiveObject): void {
    if (interactiveObject.cursor) this.game.host.page?.setCursor(this.canvas, interactiveObject.cursor);
  }

  public resetCursor(interactiveObject: InteractiveObject | null, forceReset = false): void {
    if ((forceReset || (interactiveObject && interactiveObject.cursor)) && this.canvas) this.game.host.page?.setCursor(this.canvas, this.defaultCursor);
  }

  private inputCandidate(gameObject: GameObject, camera: Camera): boolean {
    const input = gameObject.input;
    if (!input || !input.enabled || !gameObject.willRender(camera)) return false;
    let parent = gameObject.parentContainer;
    while (parent) {
      if (!parent.willRender(camera)) return false;
      parent = parent.parentContainer;
    }
    return true;
  }

  public hitTest(pointer: Pointer, gameObjects: GameObject[], camera: Camera, output: GameObject[] = this.tempHitTest): GameObject[] {
    const tempPoint = this.tempPoint;
    const csx = camera.scrollX;
    const csy = camera.scrollY;
    output.length = 0;
    camera.getWorldPoint(pointer.x, pointer.y, tempPoint);
    pointer.worldX = tempPoint.x;
    pointer.worldY = tempPoint.y;
    const point = { x: 0, y: 0 };
    for (const gameObject of gameObjects) {
      if (!this.inputCandidate(gameObject, camera)) continue;
      const px = tempPoint.x + (csx * gameObject.scrollFactorX) - csx;
      const py = tempPoint.y + (csy * gameObject.scrollFactorY) - csy;
      if (gameObject.parentContainer) {
        gameObject.getWorldTransformMatrix(this.tempMatrix, this.tempMatrix2);
        this.tempMatrix.applyInverse(px, py, point);
      } else {
        TransformXY(px, py, gameObject.x, gameObject.y, gameObject.rotation, gameObject.scaleX, gameObject.scaleY, point);
      }
      if (this.pointWithinHitArea(gameObject, point.x, point.y)) output.push(gameObject);
    }
    return output;
  }

  private pointWithinHitArea(gameObject: GameObject, x: number, y: number): boolean {
    x += gameObject.displayOriginX;
    y += gameObject.displayOriginY;
    const input = gameObject.input;
    if (input && input.hitAreaCallback && input.hitArea && input.hitAreaCallback(input.hitArea, x, y, gameObject)) {
      input.localX = x;
      input.localY = y;
      return true;
    }
    return false;
  }

  private destroy(): void {
    this.events.removeAllListeners();
    this.keyboard.destroy();
  }
}

/** A entrada de UMA cena (`this.input`). */
export class InputPlugin extends EventEmitter {
  public readonly scene: Scene;
  public readonly manager: InputManager;
  public readonly pluginEvents = new EventEmitter();
  public enabled = true;
  public topOnly = true;
  public pollRate = -1;
  public readonly keyboard: KeyboardPlugin;
  private _pollTimer = 0;
  private readonly _eventData = { cancelled: false };
  private readonly _eventContainer: { stopPropagation: () => void };
  private _temp: GameObject[] = [];
  private _list: GameObject[] = [];
  private readonly _pendingInsertion: GameObject[] = [];
  private readonly _pendingRemoval: GameObject[] = [];
  private readonly _draggable: GameObject[] = [];
  private readonly _drag: Record<number, GameObject[]> = { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 7: [], 8: [], 9: [], 10: [] };
  private readonly _over: Record<number, GameObject[]> = { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 7: [], 8: [], 9: [], 10: [] };
  private _updatedThisFrame = false;

  public constructor(private readonly systems: Systems) {
    super();
    this.scene = systems.scene;
    this.manager = systems.game.input;
    const data = this._eventData;
    this._eventContainer = { stopPropagation: () => { data.cancelled = true; } };
    this.keyboard = new KeyboardPlugin(this);
    systems.events.once(SceneEvents.BOOT, this.boot, this);
    systems.events.on(SceneEvents.START, this.start, this);
  }

  public get mouse(): { disableContextMenu: () => void } { return this.manager.mouse; }
  public get activePointer(): Pointer { return this.manager.activePointer; }
  public get mousePointer(): Pointer { return this.manager.mousePointer; }
  public get x(): number { return this.manager.activePointer.x; }
  public get y(): number { return this.manager.activePointer.y; }

  private boot(): void {
    this.systems.events.once(SceneEvents.DESTROY, this.destroy, this);
    this.pluginEvents.emit('boot');
  }

  private start(): void {
    const ee = this.systems.events;
    ee.on(SceneEvents.PRE_UPDATE, this.preUpdate, this);
    ee.once(SceneEvents.SHUTDOWN, this.shutdown, this);
    this.manager.events.on(InputEvents.GAME_OUT, this.onGameOut, this);
    this.manager.events.on(InputEvents.GAME_OVER, this.onGameOver, this);
    this.enabled = true;
    this.pluginEvents.emit('start');
  }

  private onGameOut(event: Event): void {
    if (this.isActive()) this.emit(InputEvents.GAME_OUT, event.timeStamp, event);
  }

  private onGameOver(event: Event): void {
    if (this.isActive()) this.emit(InputEvents.GAME_OVER, event.timeStamp, event);
  }

  private preUpdate(): void {
    this.pluginEvents.emit('preupdate');
    const removeList = this._pendingRemoval;
    const insertList = this._pendingInsertion;
    if (removeList.length === 0 && insertList.length === 0) return;
    const current = this._list;
    for (const gameObject of removeList) {
      const index = current.indexOf(gameObject);
      if (index > -1) {
        current.splice(index, 1);
        this.clear(gameObject, true);
      }
    }
    removeList.length = 0;
    this._list = current.concat(insertList.splice(0));
  }

  public isActive(): boolean {
    return this.manager.enabled && this.enabled && this.scene.sys.canInput();
  }

  public updatePoll(time: number, delta: number): boolean {
    if (!this.isActive()) return false;
    this.pluginEvents.emit('update', time, delta);
    if (this._updatedThisFrame) {
      this._updatedThisFrame = false;
      return false;
    }
    const pointers = this.manager.pointers;
    for (const pointer of pointers) pointer.updateMotion();
    if (this._list.length === 0) return false;
    const rate = this.pollRate;
    if (rate === -1) return false;
    if (rate > 0) {
      this._pollTimer -= delta;
      if (this._pollTimer < 0) this._pollTimer = this.pollRate;
      else return false;
    }
    let captured = false;
    for (const pointer of pointers) {
      this._temp = this.hitTestPointer(pointer);
      this.sortGameObjects(this._temp, pointer);
      if (this.topOnly && this._temp.length) this._temp.splice(1);
      if (this.processOverOutEvents(pointer) > 0) captured = true;
    }
    return captured;
  }

  public update(type: number, pointers: Pointer[]): boolean {
    if (!this.isActive()) return false;
    let captured = false;
    for (const pointer of pointers) {
      let total = 0;
      this._temp = this.hitTestPointer(pointer);
      this.sortGameObjects(this._temp, pointer);
      if (this.topOnly && this._temp.length) this._temp.splice(1);
      switch (type) {
        case MOUSE_DOWN:
          total += this.processDownEvents(pointer);
          total += this.processOverOutEvents(pointer);
          break;
        case MOUSE_UP:
          total += this.processUpEvents(pointer);
          total += this.processOverOutEvents(pointer);
          break;
        case TOUCH_START:
          total += this.processDownEvents(pointer);
          total += this.processOverEvents(pointer);
          break;
        case TOUCH_END:
        case TOUCH_CANCEL:
          total += this.processUpEvents(pointer);
          total += this.processOutEvents(pointer);
          break;
        case MOUSE_MOVE:
        case TOUCH_MOVE:
          total += this.processMoveEvents(pointer);
          total += this.processOverOutEvents(pointer);
          break;
        case MOUSE_WHEEL:
          total += this.processWheelEvent(pointer);
          break;
        default:
          break;
      }
      if (total > 0) captured = true;
    }
    this._updatedThisFrame = true;
    return captured;
  }

  private processDownEvents(pointer: Pointer): number {
    let total = 0;
    const currentlyOver = this._temp;
    const _eventData = this._eventData;
    const _eventContainer = this._eventContainer;
    _eventData.cancelled = false;
    for (const gameObject of currentlyOver) {
      if (!gameObject.input || !gameObject.input.enabled) continue;
      total++;
      gameObject.emit(InputEvents.GAMEOBJECT_POINTER_DOWN, pointer, gameObject.input.localX, gameObject.input.localY, _eventContainer);
      if (_eventData.cancelled || !this.isActive()) break;
      if (gameObject.input && gameObject.input.enabled) {
        this.emit(InputEvents.GAMEOBJECT_DOWN, pointer, gameObject, _eventContainer);
        if (_eventData.cancelled || !this.isActive()) break;
      }
    }
    if (!_eventData.cancelled && this.isActive()) {
      if (pointer.downElement === this.manager.eventTarget) this.emit(InputEvents.POINTER_DOWN, pointer, currentlyOver);
      else this.emit(InputEvents.POINTER_DOWN_OUTSIDE, pointer);
    }
    return total;
  }

  private processUpEvents(pointer: Pointer): number {
    const currentlyOver = this._temp;
    const _eventData = this._eventData;
    const _eventContainer = this._eventContainer;
    _eventData.cancelled = false;
    for (const gameObject of currentlyOver) {
      if (!gameObject.input || !gameObject.input.enabled) continue;
      gameObject.emit(InputEvents.GAMEOBJECT_POINTER_UP, pointer, gameObject.input.localX, gameObject.input.localY, _eventContainer);
      if (_eventData.cancelled || !this.isActive()) break;
      if (gameObject.input && gameObject.input.enabled) {
        this.emit(InputEvents.GAMEOBJECT_UP, pointer, gameObject, _eventContainer);
        if (_eventData.cancelled || !this.isActive()) break;
      }
    }
    if (!_eventData.cancelled && this.isActive()) {
      if (pointer.upElement === this.manager.eventTarget) this.emit(InputEvents.POINTER_UP, pointer, currentlyOver);
      else this.emit(InputEvents.POINTER_UP_OUTSIDE, pointer);
    }
    return currentlyOver.length;
  }

  private processMoveEvents(pointer: Pointer): number {
    let total = 0;
    const currentlyOver = this._temp;
    const _eventData = this._eventData;
    const _eventContainer = this._eventContainer;
    _eventData.cancelled = false;
    for (const gameObject of currentlyOver) {
      if (!gameObject.input || !gameObject.input.enabled) continue;
      total++;
      gameObject.emit('pointermove', pointer, gameObject.input.localX, gameObject.input.localY, _eventContainer);
      if (_eventData.cancelled || !this.isActive()) break;
      if (gameObject.input && gameObject.input.enabled) {
        this.emit('gameobjectmove', pointer, gameObject, _eventContainer);
        if (_eventData.cancelled || !this.isActive()) break;
        if (this.topOnly) break;
      }
    }
    if (!_eventData.cancelled && this.isActive()) this.emit(InputEvents.POINTER_MOVE, pointer, currentlyOver);
    return total;
  }

  private processWheelEvent(pointer: Pointer): number {
    let total = 0;
    const currentlyOver = this._temp;
    const _eventData = this._eventData;
    const _eventContainer = this._eventContainer;
    _eventData.cancelled = false;
    const dx = pointer.deltaX;
    const dy = pointer.deltaY;
    const dz = pointer.deltaZ;
    for (const gameObject of currentlyOver) {
      if (!gameObject.input || !gameObject.input.enabled) continue;
      total++;
      gameObject.emit('wheel', pointer, dx, dy, dz, _eventContainer);
      if (_eventData.cancelled || !this.isActive()) break;
      if (gameObject.input && gameObject.input.enabled) {
        this.emit('gameobjectwheel', pointer, gameObject, dx, dy, dz, _eventContainer);
        if (_eventData.cancelled || !this.isActive()) break;
      }
    }
    if (!_eventData.cancelled && this.isActive()) this.emit(InputEvents.POINTER_WHEEL, pointer, currentlyOver, dx, dy, dz);
    return total;
  }

  private processOverEvents(pointer: Pointer): number {
    const currentlyOver = this._temp;
    let totalInteracted = 0;
    const justOver: GameObject[] = [];
    if (currentlyOver.length > 0) {
      const _eventData = this._eventData;
      const _eventContainer = this._eventContainer;
      _eventData.cancelled = false;
      for (const gameObject of currentlyOver) {
        if (!gameObject.input || !gameObject.input.enabled) continue;
        justOver.push(gameObject);
        this.manager.setCursor(gameObject.input);
        gameObject.emit(InputEvents.GAMEOBJECT_POINTER_OVER, pointer, gameObject.input.localX, gameObject.input.localY, _eventContainer);
        totalInteracted++;
        if (_eventData.cancelled || !this.isActive()) break;
        if (gameObject.input && gameObject.input.enabled) {
          this.emit(InputEvents.GAMEOBJECT_OVER, pointer, gameObject, _eventContainer);
          if (_eventData.cancelled || !this.isActive()) break;
        }
      }
      if (!_eventData.cancelled && this.isActive()) this.emit(InputEvents.POINTER_OVER, pointer, justOver);
    }
    this._over[pointer.id] = justOver;
    return totalInteracted;
  }

  private processOutEvents(pointer: Pointer): number {
    const previouslyOver = this._over[pointer.id];
    let totalInteracted = 0;
    if (previouslyOver.length > 0) {
      const _eventData = this._eventData;
      const _eventContainer = this._eventContainer;
      _eventData.cancelled = false;
      this.sortGameObjects(previouslyOver, pointer);
      for (const gameObject of previouslyOver) {
        if (!gameObject.input || !gameObject.input.enabled) continue;
        this.manager.resetCursor(gameObject.input);
        gameObject.emit(InputEvents.GAMEOBJECT_POINTER_OUT, pointer, _eventContainer);
        totalInteracted++;
        if (_eventData.cancelled || !this.isActive()) break;
        if (gameObject.input && gameObject.input.enabled) {
          this.emit(InputEvents.GAMEOBJECT_OUT, pointer, gameObject, _eventContainer);
          if (_eventData.cancelled || !this.isActive()) break;
        }
      }
      if (!_eventData.cancelled && this.isActive()) this.emit(InputEvents.POINTER_OUT, pointer, previouslyOver);
      this._over[pointer.id] = [];
    }
    return totalInteracted;
  }

  private processOverOutEvents(pointer: Pointer): number {
    const currentlyOver = this._temp;
    const justOut: GameObject[] = [];
    const justOver: GameObject[] = [];
    const stillOver: GameObject[] = [];
    const previouslyOver = this._over[pointer.id];
    const currentlyDragging = this._drag[pointer.id];
    for (const gameObject of previouslyOver) {
      if (currentlyOver.indexOf(gameObject) === -1 && currentlyDragging.indexOf(gameObject) === -1) justOut.push(gameObject);
      else stillOver.push(gameObject);
    }
    for (const gameObject of currentlyOver) {
      if (previouslyOver.indexOf(gameObject) === -1) justOver.push(gameObject);
    }
    let totalInteracted = 0;
    const _eventData = this._eventData;
    const _eventContainer = this._eventContainer;
    _eventData.cancelled = false;
    if (justOut.length > 0) {
      this.sortGameObjects(justOut, pointer);
      for (const gameObject of justOut) {
        if (!gameObject.input || !gameObject.input.enabled) continue;
        this.manager.resetCursor(gameObject.input);
        gameObject.emit(InputEvents.GAMEOBJECT_POINTER_OUT, pointer, _eventContainer);
        totalInteracted++;
        if (_eventData.cancelled || !this.isActive()) break;
        if (gameObject.input && gameObject.input.enabled) {
          this.emit(InputEvents.GAMEOBJECT_OUT, pointer, gameObject, _eventContainer);
          if (_eventData.cancelled || !this.isActive()) break;
        }
      }
      // (sic) o teste é com `||` aqui
      if (!_eventData.cancelled || this.isActive()) this.emit(InputEvents.POINTER_OUT, pointer, justOut);
    }
    _eventData.cancelled = false;
    if (justOver.length > 0) {
      this.sortGameObjects(justOver, pointer);
      for (const gameObject of justOver) {
        if (!gameObject.input || !gameObject.input.enabled) continue;
        this.manager.setCursor(gameObject.input);
        gameObject.emit(InputEvents.GAMEOBJECT_POINTER_OVER, pointer, gameObject.input.localX, gameObject.input.localY, _eventContainer);
        totalInteracted++;
        if (_eventData.cancelled || !this.isActive()) break;
        if (gameObject.input && gameObject.input.enabled) {
          this.emit(InputEvents.GAMEOBJECT_OVER, pointer, gameObject, _eventContainer);
          if (_eventData.cancelled || !this.isActive()) break;
        }
      }
      if (!_eventData.cancelled && this.isActive()) this.emit(InputEvents.POINTER_OVER, pointer, justOver);
    }
    this._over[pointer.id] = this.sortGameObjects(stillOver.concat(justOver), pointer);
    return totalInteracted;
  }

  private hitTestPointer(pointer: Pointer): GameObject[] {
    const cameras = this.systems.cameras.getCamerasBelowPointer(pointer);
    for (const camera of cameras) {
      const over = this.manager.hitTest(pointer, this._list, camera);
      if (over.length > 0) {
        pointer.camera = camera;
        return over;
      }
    }
    pointer.camera = cameras[0] ?? null;
    return [];
  }

  private sortGameObjects(gameObjects: GameObject[], pointer: Pointer): GameObject[] {
    if (gameObjects.length < 2 || !pointer.camera) return gameObjects;
    const list = pointer.camera.renderList;
    return gameObjects.sort((childA, childB) => Math.max(list.indexOf(childB), 0) - Math.max(list.indexOf(childA), 0));
  }

  public setHitArea(gameObjects: GameObject | GameObject[], hitArea?: unknown): this {
    const list = Array.isArray(gameObjects) ? gameObjects : [gameObjects];
    if (hitArea === undefined) return this.setHitAreaFromTexture(list);
    let cursor: string | false = false;
    let useHandCursor = false;
    if (hitArea && typeof hitArea === 'object' && Object.keys(hitArea).length) {
      const config = hitArea as { cursor?: string; useHandCursor?: boolean };
      cursor = config.cursor ?? false;
      useHandCursor = config.useHandCursor ?? false;
      this.setHitAreaFromTexture(list);
    }
    for (const gameObject of list) {
      if (!gameObject.input) continue;
      const io = gameObject.input;
      io.customHitArea = false;
      io.dropZone = false;
      io.cursor = useHandCursor ? 'pointer' : cursor;
      this.queueForInsertion(gameObject);
    }
    return this;
  }

  public setHitAreaFromTexture(gameObjects: GameObject[]): this {
    for (const gameObject of gameObjects) {
      const frame = (gameObject as GameObject & { frame?: { realWidth: number; realHeight: number } }).frame;
      let width = 0;
      let height = 0;
      if (gameObject.width) {
        width = gameObject.width;
        height = gameObject.height;
      } else if (frame) {
        width = frame.realWidth;
        height = frame.realHeight;
      }
      if (gameObject.type === 'Container' && (width === 0 || height === 0)) {
        console.warn('Container.setInteractive must specify a Shape or call setSize() first');
        continue;
      }
      if (width !== 0 && height !== 0) {
        gameObject.input = {
          gameObject,
          enabled: true,
          draggable: false,
          dropZone: false,
          cursor: false,
          hitArea: { x: 0, y: 0, width, height },
          hitAreaCallback: RectangleContains,
          customHitArea: false,
          localX: 0,
          localY: 0,
          dragState: 0,
        };
        this.queueForInsertion(gameObject);
      }
    }
    return this;
  }

  public enable(gameObject: GameObject, hitArea?: unknown): this {
    if (gameObject.input) gameObject.input.enabled = true;
    else this.setHitArea(gameObject, hitArea);
    return this;
  }

  public disable(gameObject: GameObject, resetCursor = false): this {
    const input = gameObject.input;
    if (input) {
      input.enabled = false;
      input.dragState = 0;
    }
    for (let i = 0; i < this.manager.pointers.length; i++) {
      let index = this._drag[i].indexOf(gameObject);
      if (index > -1) this._drag[i].splice(index, 1);
      index = this._over[i].indexOf(gameObject);
      if (index > -1) this._over[i].splice(index, 1);
    }
    if (resetCursor) this.resetCursor();
    return this;
  }

  public clear(gameObject: GameObject, skipQueue = false): GameObject {
    this.disable(gameObject);
    const input = gameObject.input;
    if (input) {
      this.manager.resetCursor(input);
      input.gameObject = undefined;
      input.hitArea = undefined;
      input.hitAreaCallback = undefined;
      gameObject.input = null;
    }
    if (!skipQueue) this.queueForRemoval(gameObject);
    const index = this._draggable.indexOf(gameObject);
    if (index > -1) this._draggable.splice(index, 1);
    return gameObject;
  }

  public resetCursor(): void {
    this.manager.resetCursor(null, true);
  }

  private queueForInsertion(child: GameObject): this {
    if (this._pendingInsertion.indexOf(child) === -1 && this._list.indexOf(child) === -1) this._pendingInsertion.push(child);
    return this;
  }

  private queueForRemoval(child: GameObject): this {
    this._pendingRemoval.push(child);
    return this;
  }

  private shutdown(): void {
    this.pluginEvents.emit('shutdown');
    this._temp.length = 0;
    this._list.length = 0;
    this._draggable.length = 0;
    this._pendingRemoval.length = 0;
    this._pendingInsertion.length = 0;
    for (let i = 0; i < 10; i++) {
      this._drag[i] = [];
      this._over[i] = [];
    }
    this.removeAllListeners();
    this.manager.game.host.page?.setCursor(this.manager.canvas, this.manager.defaultCursor);
    const ee = this.systems.events;
    ee.off(SceneEvents.PRE_UPDATE, this.preUpdate, this);
    this.manager.events.off(InputEvents.GAME_OUT, this.onGameOut, this);
    this.manager.events.off(InputEvents.GAME_OVER, this.onGameOver, this);
    ee.off(SceneEvents.SHUTDOWN, this.shutdown, this);
  }

  private destroy(): void {
    this.shutdown();
    this.pluginEvents.emit('destroy');
    this.pluginEvents.removeAllListeners();
    this.systems.events.off(SceneEvents.START, this.start, this);
  }
}
