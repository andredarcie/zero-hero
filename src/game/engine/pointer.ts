// OS PONTEIROS: o Pointer (o mouse é o 0, cada dedo um a mais) e os códigos dos eventos de mouse e toque que o
// InputManager enfileira. Licenças em LICENSES.md.

import type { Camera } from './camera';
import type { InputManager } from './input';

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

export const MOUSE_DOWN = 0;
export const MOUSE_MOVE = 1;
export const MOUSE_UP = 2;
export const TOUCH_START = 3;
export const TOUCH_MOVE = 4;
export const TOUCH_END = 5;
export const TOUCH_CANCEL = 7;
export const MOUSE_WHEEL = 9;
