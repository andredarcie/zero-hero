/**
 * O RELÓGIO DE CENA e os temporizadores (`this.time.delayedCall`, `addEvent`) — o Clock e o TimerEvent,
 * conta por conta: os eventos novos só entram no PRE_UPDATE seguinte, o tempo anda no UPDATE com o delta da cena, um
 * evento que repete recupera o atraso no mesmo quadro, e o fim da cena (SHUTDOWN) destrói todos.
 * Parte do motor próprio (src/game/engine); licenças em LICENSES.md.
 */
import { SceneEvents } from './constants';
import type { Systems } from './scene';

export interface TimerEventConfig {
  delay?: number;
  repeat?: number;
  loop?: boolean;
  callback?: (...args: never[]) => void;
  callbackScope?: unknown;
  args?: unknown[];
  timeScale?: number;
  startAt?: number;
  paused?: boolean;
}

const fast = <T>(config: Record<string, unknown> | undefined, key: string, def: T): T => {
  if (!config) return def;
  const v = config[key];
  return Object.prototype.hasOwnProperty.call(config, key) && v !== undefined ? (v as T) : def;
};

export class TimerEvent {
  public delay = 0;
  public repeat = 0;
  public repeatCount = 0;
  public loop = false;
  public callback?: (...args: never[]) => void;
  public callbackScope: unknown;
  public args: unknown[] = [];
  public timeScale = 1;
  public startAt = 0;
  public elapsed = 0;
  public paused = false;
  public hasDispatched = false;

  public constructor(config: TimerEventConfig) {
    this.reset(config);
  }

  public reset(config: TimerEventConfig): this {
    const c = config as Record<string, unknown>;
    this.delay = fast(c, 'delay', 0);
    this.repeat = fast(c, 'repeat', 0);
    this.loop = fast(c, 'loop', false);
    this.callback = fast(c, 'callback', undefined);
    this.callbackScope = fast<unknown>(c, 'callbackScope', this);
    this.args = fast(c, 'args', []);
    this.timeScale = fast(c, 'timeScale', 1);
    this.startAt = fast(c, 'startAt', 0);
    this.paused = fast(c, 'paused', false);
    this.elapsed = this.startAt;
    this.hasDispatched = false;
    this.repeatCount = (this.repeat === -1 || this.loop) ? 999999999999 : this.repeat;
    if (this.delay <= 0 && this.repeatCount > 0) throw new Error('TimerEvent infinite loop created via zero delay');
    return this;
  }

  public getProgress(): number {
    return this.elapsed / this.delay;
  }

  public getOverallProgress(): number {
    if (this.repeat > 0) {
      const totalDuration = this.delay + (this.delay * this.repeat);
      const totalElapsed = this.elapsed + (this.delay * (this.repeat - this.repeatCount));
      return totalElapsed / totalDuration;
    }
    return this.getProgress();
  }

  public getRepeatCount(): number { return this.repeatCount; }
  public getElapsed(): number { return this.elapsed; }
  public getElapsedSeconds(): number { return this.elapsed * 0.001; }
  public getRemaining(): number { return this.delay - this.elapsed; }
  public getRemainingSeconds(): number { return this.getRemaining() * 0.001; }
  public getOverallRemaining(): number { return this.delay * (1 + this.repeatCount) - this.elapsed; }
  public getOverallRemainingSeconds(): number { return this.getOverallRemaining() * 0.001; }

  public remove(dispatchCallback = false): void {
    this.elapsed = this.delay;
    this.hasDispatched = !dispatchCallback;
    this.repeatCount = 0;
  }

  public destroy(): void {
    this.callback = undefined;
    this.callbackScope = undefined;
    this.args = [];
  }
}

const removeFrom = <T>(list: T[], item: T): void => {
  const i = list.indexOf(item);
  if (i > -1) list.splice(i, 1);
};

export class Clock {
  public now = 0;
  public startTime = 0;
  public timeScale = 1;
  public paused = false;
  private _active: TimerEvent[] = [];
  private _pendingInsertion: TimerEvent[] = [];
  private _pendingRemoval: TimerEvent[] = [];

  public constructor(private readonly systems: Systems) {
    systems.events.once(SceneEvents.BOOT, this.boot, this);
    systems.events.on(SceneEvents.START, this.start, this);
  }

  private boot(): void {
    this.now = this.systems.game.loop.time;
    this.systems.events.once(SceneEvents.DESTROY, this.destroy, this);
  }

  private start(): void {
    this.startTime = this.systems.game.loop.time;
    const ee = this.systems.events;
    ee.on(SceneEvents.PRE_UPDATE, this.preUpdate, this);
    ee.on(SceneEvents.UPDATE, this.update, this);
    ee.once(SceneEvents.SHUTDOWN, this.shutdown, this);
  }

  public addEvent(config: TimerEventConfig | TimerEvent): TimerEvent {
    let event: TimerEvent;
    if (config instanceof TimerEvent) {
      event = config;
      this.removeEvent(event);
      event.elapsed = event.startAt;
      event.hasDispatched = false;
      event.repeatCount = (event.repeat === -1 || event.loop) ? 999999999999 : event.repeat;
      if (event.delay <= 0 && event.repeatCount > 0) throw new Error('TimerEvent infinite loop created via zero delay');
    } else {
      event = new TimerEvent(config);
    }
    this._pendingInsertion.push(event);
    return event;
  }

  public delayedCall(delay: number, callback: (...args: never[]) => void, args?: unknown[], callbackScope?: unknown): TimerEvent {
    return this.addEvent({ delay, callback, args, callbackScope });
  }

  public clearPendingEvents(): this {
    this._pendingInsertion = [];
    return this;
  }

  public removeEvent(events: TimerEvent | TimerEvent[]): this {
    const list = Array.isArray(events) ? events : [events];
    for (const event of list) {
      removeFrom(this._pendingRemoval, event);
      removeFrom(this._pendingInsertion, event);
      removeFrom(this._active, event);
    }
    return this;
  }

  public removeAllEvents(): this {
    this._pendingRemoval = this._pendingRemoval.concat(this._active);
    return this;
  }

  private preUpdate(): void {
    const toRemove = this._pendingRemoval.length;
    const toInsert = this._pendingInsertion.length;
    if (toRemove === 0 && toInsert === 0) return;
    for (let i = 0; i < toRemove; i++) {
      const event = this._pendingRemoval[i];
      const index = this._active.indexOf(event);
      if (index > -1) this._active.splice(index, 1);
      event.destroy();
    }
    for (let i = 0; i < toInsert; i++) this._active.push(this._pendingInsertion[i]);
    this._pendingRemoval.length = 0;
    this._pendingInsertion.length = 0;
  }

  private update(time: number, delta: number): void {
    this.now = time;
    if (this.paused) return;
    delta *= this.timeScale;
    for (let i = 0; i < this._active.length; i++) {
      const event = this._active[i];
      if (event.paused) continue;
      event.elapsed += delta * event.timeScale;
      if (event.elapsed >= event.delay) {
        let remainder = event.elapsed - event.delay;
        event.elapsed = event.delay;
        if (!event.hasDispatched && event.callback) {
          event.hasDispatched = true;
          Reflect.apply(event.callback, event.callbackScope, event.args);
        }
        if (event.repeatCount > 0) {
          event.repeatCount--;
          if (remainder >= event.delay) {
            while ((remainder >= event.delay) && (event.repeatCount > 0)) {
              if (event.callback) Reflect.apply(event.callback, event.callbackScope, event.args);
              remainder -= event.delay;
              event.repeatCount--;
            }
          }
          event.elapsed = remainder;
          event.hasDispatched = false;
        } else if (event.hasDispatched) {
          this._pendingRemoval.push(event);
        }
      }
    }
  }

  private shutdown(): void {
    for (const e of this._pendingInsertion) e.destroy();
    for (const e of this._active) e.destroy();
    for (const e of this._pendingRemoval) e.destroy();
    this._active.length = 0;
    this._pendingRemoval.length = 0;
    this._pendingInsertion.length = 0;
    const ee = this.systems.events;
    ee.off(SceneEvents.PRE_UPDATE, this.preUpdate, this);
    ee.off(SceneEvents.UPDATE, this.update, this);
    ee.off(SceneEvents.SHUTDOWN, this.shutdown, this);
  }

  private destroy(): void {
    this.shutdown();
    this.systems.events.off(SceneEvents.START, this.start, this);
  }
}
