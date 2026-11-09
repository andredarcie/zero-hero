// O MOUSE E O TOQUE NO DOM: os ouvintes de pointer/touch/wheel do canvas e da janela, e a tradução de cada evento para
// o ponteiro do motor. O InputManager liga e desliga; o que fazer com o ponteiro é dele e dos InputPlugins das cenas.

import { InputEvents } from './constants';
import type { EnginePage } from './host';
import { MOUSE_DOWN, MOUSE_MOVE, MOUSE_UP, MOUSE_WHEEL, Pointer, TOUCH_CANCEL, TOUCH_END, TOUCH_MOVE, TOUCH_START } from './pointer';
import type { InputManager } from './input';

/** O que DomPointerInput usa de InputManager. */
export type DomPointerInputHost = Pick<InputManager,
  'activePointer' | 'events' | 'game' | 'globalTopOnly' | 'mousePointer' | 'mousePointerContainer'
  | 'pointerTarget' | 'pointers'
>;

export class DomPointerInput {
  public enabled = true;
  public isOver = true;
  private tempSkip = false;

  public constructor(private readonly host: DomPointerInputHost) {}

  // ── Mouse (o MouseManager) ──
  public startMouseListeners(page: EnginePage, canvas: EventTarget): void {
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
      if (this.host.game.config.autoFocus) page.focus();
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
  public startTouchListeners(page: EnginePage, canvas: EventTarget): void {
    const ok = (event: Event): boolean => !event.defaultPrevented && this.enabled;
    const nonPassive = { passive: false };
    const on = (type: 'touchstart' | 'touchmove' | 'touchend' | 'touchcancel', fn: (event: TouchEvent) => void): void => {
      canvas.addEventListener(type, fn as EventListener, nonPassive);
    };
    on('touchstart', (event) => {
      if (this.host.game.config.autoFocus) page.focus();
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
    this.host.events.emit(InputEvents.GAME_OVER, event);
  }

  public setCanvasOut(event: Event): void {
    this.isOver = false;
    this.host.events.emit(InputEvents.GAME_OUT, event);
  }

  private updateInputPlugins(type: number, pointers: Pointer[]): void {
    const scenes = this.host.game.scene.getScenes(false, true);
    this.tempSkip = false;
    for (const scene of scenes) {
      if (scene.sys.input) {
        const capture = scene.sys.input.update(type, pointers);
        if ((capture && this.host.globalTopOnly) || this.tempSkip) return;
      }
    }
  }

  private onTouchStart(event: TouchEvent): void {
    const changed: Pointer[] = [];
    for (let c = 0; c < event.changedTouches.length; c++) {
      const changedTouch = event.changedTouches[c];
      for (let i = 1; i < this.host.pointers.length; i++) {
        const pointer = this.host.pointers[i];
        if (!pointer.active) {
          pointer.touchstart(changedTouch, event);
          this.host.activePointer = pointer;
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
      for (let i = 1; i < this.host.pointers.length; i++) {
        const pointer = this.host.pointers[i];
        if (pointer.active && pointer.identifier === changedTouch.identifier) {
          const element = this.host.game.host.page?.elementFromPoint(changedTouch.clientX, changedTouch.clientY);
          const overCanvas = element === this.host.pointerTarget;
          if (!this.isOver && overCanvas) this.setCanvasOver(event);
          else if (this.isOver && !overCanvas) this.setCanvasOut(event);
          if (this.isOver) {
            pointer.touchmove(changedTouch, event);
            this.host.activePointer = pointer;
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
      for (let i = 1; i < this.host.pointers.length; i++) {
        const pointer = this.host.pointers[i];
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
      for (let i = 1; i < this.host.pointers.length; i++) {
        const pointer = this.host.pointers[i];
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
    this.host.mousePointer.down(event);
    this.host.mousePointer.updateMotion();
    this.host.activePointer = this.host.mousePointer;
    this.updateInputPlugins(MOUSE_DOWN, this.host.mousePointerContainer);
  }

  private onMouseMove(event: MouseEvent): void {
    this.host.mousePointer.move(event);
    this.host.mousePointer.updateMotion();
    this.host.activePointer = this.host.mousePointer;
    this.updateInputPlugins(MOUSE_MOVE, this.host.mousePointerContainer);
  }

  private onMouseUp(event: MouseEvent): void {
    this.host.mousePointer.up(event);
    this.host.mousePointer.updateMotion();
    this.host.activePointer = this.host.mousePointer;
    this.updateInputPlugins(MOUSE_UP, this.host.mousePointerContainer);
  }

  private onMouseWheel(event: WheelEvent): void {
    this.host.mousePointer.wheel(event);
    this.host.activePointer = this.host.mousePointer;
    this.updateInputPlugins(MOUSE_WHEEL, this.host.mousePointerContainer);
  }
}
