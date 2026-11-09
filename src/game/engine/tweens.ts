/**
 * AS ANIMAÇÕES (`this.tweens.add`, `addCounter`, `killTweensOf`) — o TweenManager, o Tween e o TweenData,
 * portados conta por conta. Elas animam QUALQUER objeto (os sprites 3D, a altura dos itens, um `{ t }` solto), então
 * cada detalhe do original vale: o relógio próprio (o de parede do anfitrião, o `Date.now()` no navegador) em passos de 1/240 s com o atraso suavizado, o
 * valor inicial lido no primeiro quadro, o `yoyo`/`hold`/`repeat`/`delay`, a ordem dos callbacks e o fim que, num
 * tween comum, termina em `ease(1)` (e num contador, cravado no `to`).
 * Parte do motor próprio (src/game/engine); licenças em LICENSES.md.
 */
import { EventEmitter } from './events';
import { Between, Clamp, FloatBetween, getEaseFunction } from './math';
import { SceneEvents } from './constants';
import type { Systems } from './scene';

const T = {
  CREATED: 0,
  DELAY: 2,
  PENDING_RENDER: 4,
  PLAYING_FORWARD: 5,
  PLAYING_BACKWARD: 6,
  HOLD_DELAY: 7,
  REPEAT_DELAY: 8,
  COMPLETE: 9,
  PENDING: 20,
  ACTIVE: 21,
  LOOP_DELAY: 22,
  COMPLETE_DELAY: 23,
  START_DELAY: 24,
  PENDING_REMOVE: 25,
  REMOVED: 26,
  FINISHED: 27,
  DESTROYED: 28,
  MAX: 999999999999,
} as const;

const TweenEvents = {
  TWEEN_ACTIVE: 'active',
  TWEEN_COMPLETE: 'complete',
  TWEEN_LOOP: 'loop',
  TWEEN_PAUSE: 'pause',
  TWEEN_REPEAT: 'repeat',
  TWEEN_RESUME: 'resume',
  TWEEN_START: 'start',
  TWEEN_STOP: 'stop',
  TWEEN_UPDATE: 'update',
  TWEEN_YOYO: 'yoyo',
} as const;

type AnyTarget = Record<string, unknown>;
type ValueGetter = (target: AnyTarget, key: string, value: number, targetIndex?: number, totalTargets?: number, tween?: Tween) => number;
type Callback = { func: (...args: never[]) => void; params: unknown[] };
type CallbackName = 'onActive' | 'onComplete' | 'onLoop' | 'onPause' | 'onRepeat' | 'onResume' | 'onStart' | 'onStop' | 'onUpdate' | 'onYoyo';
const CALLBACK_TYPES: CallbackName[] = ['onActive', 'onComplete', 'onLoop', 'onPause', 'onRepeat', 'onResume', 'onStart', 'onStop', 'onUpdate', 'onYoyo'];

const RESERVED = [
  'callbackScope', 'completeDelay', 'delay', 'duration', 'ease', 'easeParams', 'flipX', 'flipY', 'hold', 'interpolation',
  'loop', 'loopDelay', 'onActive', 'onActiveParams', 'onComplete', 'onCompleteParams', 'onLoop', 'onLoopParams', 'onPause',
  'onPauseParams', 'onRepeat', 'onRepeatParams', 'onResume', 'onResumeParams', 'onStart', 'onStartParams', 'onStop',
  'onStopParams', 'onUpdate', 'onUpdateParams', 'onYoyo', 'onYoyoParams', 'paused', 'persist', 'props', 'repeat',
  'repeatDelay', 'targets', 'yoyo',
];

const DEFAULTS = {
  delay: 0,
  duration: 1000,
  ease: 'Power0',
  easeParams: null as number[] | null,
  hold: 0,
  repeat: 0,
  repeatDelay: 0,
  yoyo: false,
  flipX: false,
  flipY: false,
};

const has = (o: unknown, k: string): boolean => !!o && typeof o === 'object' && Object.prototype.hasOwnProperty.call(o, k);

const getFastValue = <V>(source: unknown, key: string, def: V): V => {
  const t = typeof source;
  if (!source || t === 'number' || t === 'string') return def;
  const v = (source as Record<string, unknown>)[key];
  return has(source, key) && v !== undefined ? (v as V) : def;
};

const getValue = <V>(source: unknown, key: string, def: V): V => {
  if (!source || typeof source === 'number') return def;
  if (has(source, key)) return (source as Record<string, unknown>)[key] as V;
  return def;
};

const getBoolean = (source: unknown, key: string, def: boolean): boolean => {
  if (!source) return def;
  if (has(source, key)) return (source as Record<string, boolean>)[key];
  return def;
};

const getAdvancedValue = (source: unknown, key: string, def: number): number => {
  const value = getValue<unknown>(source, key, null);
  if (value === null) return def;
  if (Array.isArray(value)) return value[Math.floor(Math.random() * value.length)] as number;
  if (typeof value === 'object') {
    const v = value as { randInt?: [number, number]; randFloat?: [number, number] };
    if (v.randInt) return Between(v.randInt[0], v.randInt[1]);
    if (v.randFloat) return FloatBetween(v.randFloat[0], v.randFloat[1]);
  } else if (typeof value === 'function') {
    return (value as (k: string) => number)(key);
  }
  return value as number;
};

/** O valor de `delay` (número fixo ou função por alvo), como o GetNewValue. */
const getNewValue = (source: AnyTarget, key: string, def: unknown): ValueGetter => {
  if (has(source, key)) {
    const v = source[key];
    if (typeof v === 'function') return (target, k, value, i, total, tween) => (v as ValueGetter)(target, k, value, i, total, tween);
    return () => v as number;
  }
  if (typeof def === 'function') return def as ValueGetter;
  return () => def as number;
};

interface ValueOps { getEnd: ValueGetter; getStart: ValueGetter; getActive: ValueGetter | null }

/** O GetValueOp: número, '+=n', '-=n', '*=n', '/=n', [a, b], { from, to }, { value }, função. */
const getValueOp = (key: string, propertyValue: unknown): ValueOps => {
  let callbacks: ValueOps | undefined;
  let getEnd: ValueGetter = (_t, _k, value) => value;
  let getStart: ValueGetter = (_t, _k, value) => value;
  let getActive: ValueGetter | null = null;
  const t = typeof propertyValue;
  if (t === 'number') {
    getEnd = () => propertyValue as number;
  } else if (Array.isArray(propertyValue)) {
    getStart = () => propertyValue[0];
    getEnd = () => propertyValue[propertyValue.length - 1];
  } else if (t === 'string') {
    const s = propertyValue as string;
    let op = s.toLowerCase();
    const isRandom = op.substring(0, 6) === 'random';
    const isInt = op.substring(0, 3) === 'int';
    if (isRandom || isInt) {
      const brace1 = op.indexOf('(');
      const brace2 = op.indexOf(')');
      const comma = op.indexOf(',');
      if (brace1 && brace2 && comma) {
        const value1 = parseFloat(op.substring(brace1 + 1, comma));
        const value2 = parseFloat(op.substring(comma + 1, brace2));
        getEnd = isRandom ? () => FloatBetween(value1, value2) : () => Between(value1, value2);
      } else {
        throw new Error('invalid random() format');
      }
    } else {
      op = op[0];
      const num = parseFloat(s.substr(2));
      switch (op) {
        case '+': getEnd = (_t, _k, value) => value + num; break;
        case '-': getEnd = (_t, _k, value) => value - num; break;
        case '*': getEnd = (_t, _k, value) => value * num; break;
        case '/': getEnd = (_t, _k, value) => value / num; break;
        default: getEnd = () => parseFloat(s);
      }
    }
  } else if (t === 'function') {
    getEnd = propertyValue as ValueGetter;
  } else if (t === 'object' && propertyValue) {
    const pv = propertyValue as Record<string, unknown>;
    const fn = (k: string): boolean => !!pv[k] && typeof pv[k] === 'function';
    if (fn('getStart') || fn('getEnd') || fn('getActive')) {
      if (fn('getActive')) getActive = pv.getActive as ValueGetter;
      if (fn('getEnd')) getEnd = pv.getEnd as ValueGetter;
      if (fn('getStart')) getStart = pv.getStart as ValueGetter;
    } else if (has(pv, 'value')) {
      callbacks = getValueOp(key, pv.value);
    } else {
      const hasTo = has(pv, 'to');
      const hasFrom = has(pv, 'from');
      const hasStart = has(pv, 'start');
      if (hasTo && (hasFrom || hasStart)) {
        callbacks = getValueOp(key, pv.to);
        if (hasStart) callbacks.getActive = getValueOp(key, pv.start).getEnd;
        if (hasFrom) callbacks.getStart = getValueOp(key, pv.from).getEnd;
      }
    }
  }
  return callbacks ?? { getActive, getEnd, getStart };
};

// ── BaseTween / Tween ───────────────────────────────────────────────────────────────────────────

export class Tween extends EventEmitter {
  public parent: TweenManager | null;
  public data: TweenData[] | null = [];
  public totalData = 0;
  public startDelay = 0;
  public hasStarted = false;
  public timeScale = 1;
  public loop = 0;
  public loopDelay = 0;
  public loopCounter = 0;
  public completeDelay = 0;
  public countdown = 0;
  public state: number = T.PENDING;
  public paused = false;
  public callbacks: Record<CallbackName, Callback | null> | null = {
    onActive: null, onComplete: null, onLoop: null, onPause: null, onRepeat: null,
    onResume: null, onStart: null, onStop: null, onUpdate: null, onYoyo: null,
  };
  public callbackScope: unknown;
  public persist = false;
  public targets: AnyTarget[] | null;
  public totalTargets: number;
  public isSeeking = false;
  public isInfinite = false;
  public elapsed = 0;
  public totalElapsed = 0;
  public duration = 0;
  public progress = 0;
  public totalDuration = 0;
  public totalProgress = 0;
  public isNumberTween = false;

  public constructor(parent: TweenManager, targets: AnyTarget[]) {
    super();
    this.parent = parent;
    this.targets = targets;
    this.totalTargets = targets.length;
  }

  // ── BaseTween ──
  public setTimeScale(value: number): this { this.timeScale = value; return this; }
  public getTimeScale(): number { return this.timeScale; }
  public isPlaying(): boolean { return !this.paused && this.isActive(); }
  public isPaused(): boolean { return this.paused; }

  public pause(): this {
    if (!this.paused) {
      this.paused = true;
      this.dispatchEvent(TweenEvents.TWEEN_PAUSE, 'onPause');
    }
    return this;
  }

  public resume(): this {
    if (this.paused) {
      this.paused = false;
      this.dispatchEvent(TweenEvents.TWEEN_RESUME, 'onResume');
    }
    return this;
  }

  public makeActive(): void {
    this.parent?.makeActive(this);
    this.dispatchEvent(TweenEvents.TWEEN_ACTIVE, 'onActive');
  }

  public complete(delay = 0): this {
    if (delay) {
      this.setCompleteDelayState();
      this.countdown = delay;
    } else {
      this.onCompleteHandler();
    }
    return this;
  }

  public completeAfterLoop(loops = 0): this {
    if (this.loopCounter > loops) this.loopCounter = loops;
    return this;
  }

  public remove(): this {
    this.parent?.remove(this);
    return this;
  }

  public stop(): this {
    if (this.parent && !this.isRemoved() && !this.isPendingRemove() && !this.isDestroyed()) {
      this.dispatchEvent(TweenEvents.TWEEN_STOP, 'onStop');
      this.setPendingRemoveState();
    }
    return this;
  }

  public updateLoopCountdown(delta: number): void {
    this.countdown -= delta;
    if (this.countdown <= 0) {
      this.setActiveState();
      this.dispatchEvent(TweenEvents.TWEEN_LOOP, 'onLoop');
    }
  }

  public updateStartCountdown(delta: number): number {
    this.countdown -= delta;
    if (this.countdown <= 0) {
      this.hasStarted = true;
      this.setActiveState();
      this.dispatchEvent(TweenEvents.TWEEN_START, 'onStart');
      delta = 0;
    }
    return delta;
  }

  public updateCompleteDelay(delta: number): void {
    this.countdown -= delta;
    if (this.countdown <= 0) this.onCompleteHandler();
  }

  public setCallback(type: CallbackName, callback: (...args: never[]) => void, params: unknown[] = []): this {
    if (this.callbacks && Object.prototype.hasOwnProperty.call(this.callbacks, type)) this.callbacks[type] = { func: callback, params };
    return this;
  }

  public setPendingState(): void { this.state = T.PENDING; }
  public setActiveState(): void { this.state = T.ACTIVE; this.hasStarted = false; }
  public setLoopDelayState(): void { this.state = T.LOOP_DELAY; }
  public setCompleteDelayState(): void { this.state = T.COMPLETE_DELAY; }
  public setStartDelayState(): void { this.state = T.START_DELAY; this.countdown = this.startDelay; this.hasStarted = false; }
  public setPendingRemoveState(): void { this.state = T.PENDING_REMOVE; }
  public setRemovedState(): void { this.state = T.REMOVED; }
  public setFinishedState(): void { this.state = T.FINISHED; }
  public setDestroyedState(): void { this.state = T.DESTROYED; }
  public isPending(): boolean { return this.state === T.PENDING; }
  public isActive(): boolean { return this.state === T.ACTIVE; }
  public isLoopDelayed(): boolean { return this.state === T.LOOP_DELAY; }
  public isCompleteDelayed(): boolean { return this.state === T.COMPLETE_DELAY; }
  public isStartDelayed(): boolean { return this.state === T.START_DELAY; }
  public isPendingRemove(): boolean { return this.state === T.PENDING_REMOVE; }
  public isRemoved(): boolean { return this.state === T.REMOVED; }
  public isFinished(): boolean { return this.state === T.FINISHED; }
  public isDestroyed(): boolean { return this.state === T.DESTROYED; }

  // ── Tween ──
  public add(
    targetIndex: number, key: string, getEnd: ValueGetter, getStart: ValueGetter, getActive: ValueGetter | null,
    ease: (v: number) => number, delay: ValueGetter, duration: number, yoyo: boolean, hold: number, repeat: number,
    repeatDelay: number, flipX: boolean, flipY: boolean,
  ): TweenData {
    const tweenData = new TweenData(this, targetIndex, key, getEnd, getStart, getActive, ease, delay, duration, yoyo, hold, repeat, repeatDelay, flipX, flipY);
    this.totalData = this.data!.push(tweenData);
    return tweenData;
  }

  public getValue(index = 0): number | null {
    return this.data ? this.data[index].current : null;
  }

  public hasTarget(target: unknown): boolean {
    return !!this.targets && this.targets.indexOf(target as AnyTarget) !== -1;
  }

  public updateTo(key: string, value: number, startToCurrent = false): this {
    if (key !== 'texture' && this.data) {
      for (let i = 0; i < this.totalData; i++) {
        const td = this.data[i];
        if (td.key === key && (td.isPlayingForward() || td.isPlayingBackward())) {
          td.end = value;
          if (startToCurrent) td.start = td.current;
        }
      }
    }
    return this;
  }

  public restart(): this {
    switch (this.state) {
      case T.REMOVED:
      case T.FINISHED:
        this.seek();
        this.parent?.makeActive(this);
        break;
      case T.PENDING:
      case T.PENDING_REMOVE:
        this.parent?.reset(this);
        break;
      case T.DESTROYED:
        console.warn('Cannot restart destroyed Tween', this);
        break;
      default:
        this.seek();
        break;
    }
    this.paused = false;
    this.hasStarted = false;
    return this;
  }

  public nextState(): boolean {
    if (this.loopCounter > 0) {
      this.elapsed = 0;
      this.progress = 0;
      this.loopCounter--;
      this.initTweenData(true);
      if (this.loopDelay > 0) {
        this.countdown = this.loopDelay;
        this.setLoopDelayState();
      } else {
        this.setActiveState();
        this.dispatchEvent(TweenEvents.TWEEN_LOOP, 'onLoop');
      }
    } else if (this.completeDelay > 0) {
      this.countdown = this.completeDelay;
      this.setCompleteDelayState();
    } else {
      this.onCompleteHandler();
      return true;
    }
    return false;
  }

  public onCompleteHandler(): void {
    this.progress = 1;
    this.totalProgress = 1;
    this.setPendingRemoveState();
    this.dispatchEvent(TweenEvents.TWEEN_COMPLETE, 'onComplete');
  }

  public play(): this {
    if (this.isDestroyed()) {
      console.warn('Cannot play destroyed Tween', this);
      return this;
    }
    if (this.isPendingRemove() || this.isFinished()) this.seek();
    this.paused = false;
    this.setActiveState();
    return this;
  }

  public seek(amount = 0, delta = 16.6, emit = false): this {
    if (this.isDestroyed()) {
      console.warn('Cannot seek destroyed Tween', this);
      return this;
    }
    if (!emit) this.isSeeking = true;
    this.reset(true);
    this.initTweenData(true);
    this.setActiveState();
    this.dispatchEvent(TweenEvents.TWEEN_ACTIVE, 'onActive');
    const isPaused = this.paused;
    this.paused = false;
    if (amount > 0) {
      const iterations = Math.floor(amount / delta);
      const remainder = amount - (iterations * delta);
      for (let i = 0; i < iterations; i++) this.update(delta);
      if (remainder > 0) this.update(remainder);
    }
    this.paused = isPaused;
    this.isSeeking = false;
    return this;
  }

  public initTweenData(isSeeking = false): void {
    this.duration = 0;
    this.startDelay = Number.MAX_SAFE_INTEGER;
    const data = this.data!;
    for (let i = 0; i < this.totalData; i++) data[i].reset(isSeeking);
    this.duration = Math.max(this.duration, 0.01);
    const duration = this.duration;
    if (this.loopCounter > 0) {
      this.totalDuration = duration + this.completeDelay + ((duration + this.loopDelay) * this.loopCounter);
    } else {
      this.totalDuration = duration + this.completeDelay;
    }
  }

  public reset(skipInit = false): this {
    this.elapsed = 0;
    this.totalElapsed = 0;
    this.progress = 0;
    this.totalProgress = 0;
    this.loopCounter = this.loop;
    if (this.loop === -1) {
      this.isInfinite = true;
      this.loopCounter = T.MAX;
    }
    if (!skipInit) {
      this.initTweenData();
      this.setActiveState();
      this.dispatchEvent(TweenEvents.TWEEN_ACTIVE, 'onActive');
    }
    return this;
  }

  /** Um passo; devolve `true` quando o tween deve sair da lista. */
  public update(delta: number): boolean {
    if (this.isPendingRemove() || this.isDestroyed()) {
      if (this.persist) {
        this.setFinishedState();
        return false;
      }
      return true;
    }
    if (this.paused || this.isFinished()) return false;
    delta *= this.timeScale * (this.parent?.timeScale ?? 1);
    if (this.isLoopDelayed()) {
      this.updateLoopCountdown(delta);
      return false;
    }
    if (this.isCompleteDelayed()) {
      this.updateCompleteDelay(delta);
      return false;
    }
    if (!this.hasStarted) {
      this.startDelay -= delta;
      if (this.startDelay <= 0) {
        this.hasStarted = true;
        this.dispatchEvent(TweenEvents.TWEEN_START, 'onStart');
        delta = 0;
      }
    }
    let stillRunning = false;
    if (this.isActive()) {
      const data = this.data!;
      for (let i = 0; i < this.totalData; i++) {
        if (data[i].update(delta)) stillRunning = true;
      }
    }
    this.elapsed += delta;
    this.progress = Math.min(this.elapsed / this.duration, 1);
    this.totalElapsed += delta;
    this.totalProgress = Math.min(this.totalElapsed / this.totalDuration, 1);
    if (!stillRunning) this.nextState();
    let remove = this.isPendingRemove();
    if (remove && this.persist) {
      this.setFinishedState();
      remove = false;
    }
    return remove;
  }

  public forward(ms: number): this { this.update(ms); return this; }
  public rewind(ms: number): this { this.update(-ms); return this; }

  public dispatchEvent(event: string, callback: CallbackName): void {
    if (this.isSeeking) return;
    this.emit(event, this, this.targets);
    if (!this.callbacks) return;
    const handler = this.callbacks[callback];
    if (handler) Reflect.apply(handler.func, this.callbackScope, [this, this.targets, ...handler.params]);
  }

  public destroy(): void {
    if (this.data) this.data.forEach((d) => d.destroy());
    this.removeAllListeners();
    this.callbacks = null;
    this.data = null;
    this.parent = null;
    this.setDestroyedState();
    this.targets = null;
  }
}

// ── BaseTweenData / TweenData ───────────────────────────────────────────────────────────────────

export class TweenData {
  public tween: Tween | null;
  public duration: number;
  public totalDuration = 0;
  public delay = 0;
  public progress = 0;
  public elapsed = 0;
  public state = 0;
  public isCountdown = false;
  public repeatCounter = 0;
  public start = 0;
  public previous = 0;
  public current = 0;
  public end = 0;

  public constructor(
    tween: Tween, public targetIndex: number, public key: string, public getEndValue: ValueGetter | null,
    public getStartValue: ValueGetter | null, public getActiveValue: ValueGetter | null, public ease: ((v: number) => number) | null,
    public getDelay: ValueGetter | null, duration: number, public yoyo: boolean, public hold: number, public repeat: number,
    public repeatDelay: number, public flipX: boolean, public flipY: boolean,
  ) {
    this.tween = tween;
    this.duration = duration <= 0 ? 0.01 : duration;
  }

  public getTarget(): AnyTarget { return this.tween!.targets![this.targetIndex]; }
  public setTargetValue(value: number = this.current): void { this.tween!.targets![this.targetIndex][this.key] = value; }

  public setCreatedState(): void { this.state = T.CREATED; this.isCountdown = false; }
  public setDelayState(): void { this.state = T.DELAY; this.isCountdown = true; }
  public setPendingRenderState(): void { this.state = T.PENDING_RENDER; this.isCountdown = false; }
  public setPlayingForwardState(): void { this.state = T.PLAYING_FORWARD; this.isCountdown = false; }
  public setPlayingBackwardState(): void { this.state = T.PLAYING_BACKWARD; this.isCountdown = false; }
  public setHoldState(): void { this.state = T.HOLD_DELAY; this.isCountdown = true; }
  public setRepeatState(): void { this.state = T.REPEAT_DELAY; this.isCountdown = true; }
  public setCompleteState(): void { this.state = T.COMPLETE; this.isCountdown = false; }
  public isCreated(): boolean { return this.state === T.CREATED; }
  public isDelayed(): boolean { return this.state === T.DELAY; }
  public isPendingRender(): boolean { return this.state === T.PENDING_RENDER; }
  public isPlayingForward(): boolean { return this.state === T.PLAYING_FORWARD; }
  public isPlayingBackward(): boolean { return this.state === T.PLAYING_BACKWARD; }
  public isHolding(): boolean { return this.state === T.HOLD_DELAY; }
  public isRepeating(): boolean { return this.state === T.REPEAT_DELAY; }
  public isComplete(): boolean { return this.state === T.COMPLETE; }

  public setStateFromEnd(diff: number): void {
    if (this.yoyo) this.onRepeat(diff, true, true);
    else if (this.repeatCounter > 0) this.onRepeat(diff, true, false);
    else this.setCompleteState();
  }

  public setStateFromStart(diff: number): void {
    if (this.repeatCounter > 0) this.onRepeat(diff, false, false);
    else this.setCompleteState();
  }

  public reset(isSeeking = false): void {
    // BaseTweenData.reset
    const tween = this.tween!;
    const totalTargets = tween.totalTargets;
    const targetIndex = this.targetIndex;
    const target = tween.targets![targetIndex];
    const key = this.key;
    this.progress = 0;
    this.elapsed = 0;
    this.delay = this.getDelay!(target, key, 0, targetIndex, totalTargets, tween);
    this.repeatCounter = this.repeat === -1 ? T.MAX : this.repeat;
    this.setPendingRenderState();
    let t1 = this.duration + this.hold;
    if (this.yoyo) t1 += this.duration;
    const t2 = t1 + this.repeatDelay;
    this.totalDuration = this.delay + t1;
    if (this.repeat === -1) {
      this.totalDuration += t2 * T.MAX;
      tween.isInfinite = true;
    } else if (this.repeat > 0) {
      this.totalDuration += t2 * this.repeat;
    }
    if (this.totalDuration > tween.duration) tween.duration = this.totalDuration;
    if (this.delay < tween.startDelay) tween.startDelay = this.delay;
    if (this.delay > 0) {
      this.elapsed = this.delay;
      this.setDelayState();
    }
    // TweenData.reset
    if (isSeeking) target[key] = this.start;
    this.start = 0;
    this.previous = 0;
    this.current = 0;
    this.end = 0;
    if (this.getActiveValue) target[key] = this.getActiveValue(target, key, 0);
  }

  public onRepeat(diff: number, setStart: boolean, isYoyo: boolean): void {
    const tween = this.tween!;
    const totalTargets = tween.totalTargets;
    const targetIndex = this.targetIndex;
    const target = tween.targets![targetIndex];
    const key = this.key;
    this.elapsed = diff;
    this.progress = diff / this.duration;
    if (this.flipX) (target as { toggleFlipX(): void }).toggleFlipX();
    if (this.flipY) (target as { toggleFlipY(): void }).toggleFlipY();
    if (setStart || isYoyo) this.start = this.getStartValue!(target, key, this.start, targetIndex, totalTargets, tween);
    if (isYoyo) {
      this.setPlayingBackwardState();
      this.dispatchEvent(TweenEvents.TWEEN_YOYO, 'onYoyo');
      return;
    }
    this.repeatCounter--;
    this.end = this.getEndValue!(target, key, this.start, targetIndex, totalTargets, tween);
    if (this.repeatDelay > 0) {
      this.elapsed = this.repeatDelay - diff;
      this.current = this.start;
      target[key] = this.current;
      this.setRepeatState();
    } else {
      this.setPlayingForwardState();
      this.dispatchEvent(TweenEvents.TWEEN_REPEAT, 'onRepeat');
    }
  }

  public update(delta: number): boolean {
    const tween = this.tween!;
    const totalTargets = tween.totalTargets;
    const targetIndex = this.targetIndex;
    const target = tween.targets![targetIndex];
    const key = this.key;
    if (!target) {
      this.setCompleteState();
      return false;
    }
    if (this.isCountdown) {
      this.elapsed -= delta;
      if (this.elapsed <= 0) {
        this.elapsed = 0;
        delta = 0;
        if (this.isDelayed()) {
          this.setPendingRenderState();
        } else if (this.isRepeating()) {
          this.setPlayingForwardState();
          this.dispatchEvent(TweenEvents.TWEEN_REPEAT, 'onRepeat');
        } else if (this.isHolding()) {
          this.setStateFromEnd(0);
        }
      }
    }
    if (this.isPendingRender()) {
      this.start = this.getStartValue!(target, key, target[key] as number, targetIndex, totalTargets, tween);
      this.end = this.getEndValue!(target, key, this.start, targetIndex, totalTargets, tween);
      this.current = this.start;
      target[key] = this.start;
      this.setPlayingForwardState();
      return true;
    }
    const forward = this.isPlayingForward();
    const backward = this.isPlayingBackward();
    if (forward || backward) {
      let elapsed = this.elapsed;
      const duration = this.duration;
      let diff = 0;
      let complete = false;
      elapsed += delta;
      if (elapsed >= duration) {
        diff = elapsed - duration;
        elapsed = duration;
        complete = true;
      } else if (elapsed < 0) {
        elapsed = 0;
      }
      let progress = Clamp(elapsed / duration, 0, 1);
      this.elapsed = elapsed;
      this.progress = progress;
      this.previous = this.current;
      if (!forward) progress = 1 - progress;
      const v = this.ease!(progress);
      this.current = this.start + ((this.end - this.start) * v);
      target[key] = this.current;
      if (complete) {
        if (forward) {
          if (tween.isNumberTween) {
            this.current = this.end;
            target[key] = this.current;
          }
          if (this.hold > 0) {
            this.elapsed = this.hold;
            this.setHoldState();
          } else {
            this.setStateFromEnd(diff);
          }
        } else {
          if (tween.isNumberTween) {
            this.current = this.start;
            target[key] = this.current;
          }
          this.setStateFromStart(diff);
        }
      }
      this.dispatchEvent(TweenEvents.TWEEN_UPDATE, 'onUpdate');
    }
    return !this.isComplete();
  }

  public dispatchEvent(event: string, callback: CallbackName): void {
    const tween = this.tween;
    if (!tween || tween.isSeeking) return;
    const target = tween.targets?.[this.targetIndex];
    tween.emit(event, tween, this.key, target, this.current, this.previous);
    const handler = tween.callbacks?.[callback];
    if (handler) Reflect.apply(handler.func, tween.callbackScope, [tween, target, this.key, this.current, this.previous, ...handler.params]);
  }

  public destroy(): void {
    this.tween = null;
    this.getDelay = null;
    this.setCompleteState();
    this.getActiveValue = null;
    this.getEndValue = null;
    this.getStartValue = null;
    this.ease = null;
  }
}

// ── Builders ────────────────────────────────────────────────────────────────────────────────────

/** Os callbacks com os argumentos que o tween passa (os de dado recebem alvo, chave, valor atual e anterior). */
type TweenCallback = (tween: Tween, targets: unknown, ...params: unknown[]) => void;
type TweenDataCallback = (tween: Tween, target: unknown, key: string, current: number, previous: number, ...params: unknown[]) => void;
interface TweenCallbacks {
  onActive?: TweenCallback;
  onComplete?: TweenCallback;
  onLoop?: TweenCallback;
  onPause?: TweenCallback;
  onRepeat?: TweenDataCallback;
  onResume?: TweenCallback;
  onStart?: TweenCallback;
  onStop?: TweenCallback;
  onUpdate?: TweenDataCallback;
  onYoyo?: TweenDataCallback;
  callbackScope?: unknown;
}
export type TweenBuilderConfig = TweenCallbacks & { targets?: unknown; [key: string]: unknown };
export type NumberTweenBuilderConfig = TweenCallbacks & { from?: number; to?: number; [key: string]: unknown };

const getTargets = (config: TweenBuilderConfig): AnyTarget[] | null => {
  let targets = getValue<unknown>(config, 'targets', null);
  if (targets === null) return null;
  if (typeof targets === 'function') targets = (targets as () => unknown).call(undefined);
  return (Array.isArray(targets) ? targets : [targets]) as AnyTarget[];
};

const getProps = (config: TweenBuilderConfig): Array<{ key: string; value: unknown }> => {
  const keys: Array<{ key: string; value: unknown }> = [];
  if (has(config, 'props')) {
    const props = config.props as Record<string, unknown>;
    for (const key in props) {
      if (key.substring(0, 1) !== '_') keys.push({ key, value: props[key] });
    }
  } else {
    for (const key in config) {
      if (RESERVED.indexOf(key) === -1 && key.substring(0, 1) !== '_') keys.push({ key, value: config[key] });
    }
  }
  return keys;
};

const setCallbacks = (tween: Tween, config: TweenBuilderConfig): void => {
  for (const type of CALLBACK_TYPES) {
    const callback = getValue<((...a: never[]) => void) | false>(config, type, false);
    if (callback) tween.setCallback(type, callback, getValue(config, `${type}Params`, []));
  }
};

const buildTween = (parent: TweenManager, config: TweenBuilderConfig): Tween => {
  if (config instanceof Tween) {
    config.parent = parent;
    return config;
  }
  const targets = getTargets(config) ?? [];
  const props = getProps(config);
  const delay = getFastValue<unknown>(config, 'delay', DEFAULTS.delay);
  const duration = getFastValue(config, 'duration', DEFAULTS.duration);
  const easeParams = getFastValue(config, 'easeParams', DEFAULTS.easeParams);
  const ease = getFastValue<unknown>(config, 'ease', DEFAULTS.ease);
  const hold = getFastValue(config, 'hold', DEFAULTS.hold);
  const repeat = getFastValue(config, 'repeat', DEFAULTS.repeat);
  const repeatDelay = getFastValue(config, 'repeatDelay', DEFAULTS.repeatDelay);
  const yoyo = getBoolean(config, 'yoyo', DEFAULTS.yoyo);
  const flipX = getBoolean(config, 'flipX', DEFAULTS.flipX);
  const flipY = getBoolean(config, 'flipY', DEFAULTS.flipY);
  const tween = new Tween(parent, targets);
  const addTarget = (targetIndex: number, key: string, value: unknown): void => {
    if (key === 'texture') throw new Error('engine: tween de textura não é suportado');
    const ops = getValueOp(key, value);
    tween.add(
      targetIndex, key, ops.getEnd, ops.getStart, ops.getActive,
      getEaseFunction(getFastValue(value, 'ease', ease), getFastValue(value, 'easeParams', easeParams)),
      getNewValue((value ?? {}) as AnyTarget, 'delay', delay),
      getFastValue(value, 'duration', duration),
      getBoolean(value, 'yoyo', yoyo),
      getFastValue(value, 'hold', hold),
      getFastValue(value, 'repeat', repeat),
      getFastValue(value, 'repeatDelay', repeatDelay),
      getBoolean(value, 'flipX', flipX),
      getBoolean(value, 'flipY', flipY),
    );
  };
  for (const { key, value } of props) {
    for (let targetIndex = 0; targetIndex < targets.length; targetIndex++) {
      if (key === 'scale' && !Object.prototype.hasOwnProperty.call(targets[targetIndex], 'scale')) {
        addTarget(targetIndex, 'scaleX', value);
        addTarget(targetIndex, 'scaleY', value);
      } else {
        addTarget(targetIndex, key, value);
      }
    }
  }
  tween.completeDelay = getAdvancedValue(config, 'completeDelay', 0);
  tween.loop = Math.round(getAdvancedValue(config, 'loop', 0));
  tween.loopDelay = Math.round(getAdvancedValue(config, 'loopDelay', 0));
  tween.paused = getBoolean(config, 'paused', false);
  tween.persist = getBoolean(config, 'persist', false);
  tween.callbackScope = getFastValue<unknown>(config, 'callbackScope', tween);
  setCallbacks(tween, config);
  return tween;
};

const buildNumberTween = (parent: TweenManager, config: NumberTweenBuilderConfig): Tween => {
  const from = getFastValue(config, 'from', 0);
  const to = getFastValue(config, 'to', 1);
  const targets = [{ value: from }];
  const delay = getFastValue<unknown>(config, 'delay', DEFAULTS.delay);
  const easeParams = getFastValue(config, 'easeParams', DEFAULTS.easeParams);
  const ease = getFastValue<unknown>(config, 'ease', DEFAULTS.ease);
  const ops = getValueOp('value', to);
  const tween = new Tween(parent, targets);
  const tweenData = tween.add(
    0, 'value', ops.getEnd, ops.getStart, ops.getActive,
    getEaseFunction(getFastValue(config, 'ease', ease), getFastValue(config, 'easeParams', easeParams)),
    getNewValue(config, 'delay', delay),
    getFastValue(config, 'duration', DEFAULTS.duration),
    getBoolean(config, 'yoyo', DEFAULTS.yoyo),
    getFastValue(config, 'hold', DEFAULTS.hold),
    getFastValue(config, 'repeat', DEFAULTS.repeat),
    getFastValue(config, 'repeatDelay', DEFAULTS.repeatDelay),
    false,
    false,
  );
  tweenData.start = from;
  tweenData.current = from;
  tween.completeDelay = getAdvancedValue(config, 'completeDelay', 0);
  tween.loop = Math.round(getAdvancedValue(config, 'loop', 0));
  tween.loopDelay = Math.round(getAdvancedValue(config, 'loopDelay', 0));
  tween.paused = getBoolean(config, 'paused', false);
  tween.persist = getBoolean(config, 'persist', false);
  tween.isNumberTween = true;
  tween.callbackScope = getValue<unknown>(config, 'callbackScope', tween);
  setCallbacks(tween, config);
  return tween;
};

// ── O gerenciador ───────────────────────────────────────────────────────────────────────────────

export class TweenManager {
  public timeScale = 1;
  public paused = false;
  public processing = false;
  public tweens: Tween[] = [];
  public time = 0;
  public startTime = 0;
  public nextTime = 0;
  public prevTime = 0;
  public maxLag = 500;
  public lagSkip = 33;
  public gap = 1000 / 240;

  public constructor(private readonly systems: Systems) {
    systems.events.once(SceneEvents.BOOT, this.boot, this);
    systems.events.on(SceneEvents.START, this.start, this);
  }

  private boot(): void {
    this.systems.events.once(SceneEvents.DESTROY, this.destroy, this);
  }

  /** O relógio de parede do anfitrião (o `Date.now()` no navegador): as animações andam por ele. */
  private wallNow(): number {
    return this.systems.game.host.wallNow();
  }

  private start(): void {
    this.timeScale = 1;
    this.paused = false;
    this.startTime = this.wallNow();
    this.prevTime = this.startTime;
    this.nextTime = this.gap;
    this.systems.events.on(SceneEvents.UPDATE, this.update, this);
    this.systems.events.once(SceneEvents.SHUTDOWN, this.shutdown, this);
  }

  public create(config: TweenBuilderConfig): Tween {
    return buildTween(this, config);
  }

  public add(config: TweenBuilderConfig | Tween): Tween {
    const tween = config instanceof Tween ? config : buildTween(this, config);
    this.tweens.push(tween.reset());
    return tween;
  }

  public addMultiple(configs: TweenBuilderConfig[]): Tween[] {
    return configs.map((c) => this.add(c));
  }

  public has(tween: Tween): boolean {
    return this.tweens.indexOf(tween) > -1;
  }

  public existing(tween: Tween): this {
    if (!this.has(tween)) this.tweens.push(tween.reset());
    return this;
  }

  public addCounter(config: NumberTweenBuilderConfig): Tween {
    const tween = buildNumberTween(this, config);
    this.tweens.push(tween.reset());
    return tween;
  }

  public setLagSmooth(limit = 1 / 1e-8, skip = 0): this {
    this.maxLag = limit;
    this.lagSkip = Math.min(skip, this.maxLag);
    return this;
  }

  public setFps(fps = 240): this {
    this.gap = 1000 / fps;
    this.nextTime = this.time * 1000 + this.gap;
    return this;
  }

  public getDelta(tick?: boolean): number {
    const elapsed = this.wallNow() - this.prevTime;
    if (elapsed > this.maxLag) this.startTime += elapsed - this.lagSkip;
    this.prevTime += elapsed;
    let time = this.prevTime - this.startTime;
    const overlap = time - this.nextTime;
    let delta = time - this.time * 1000;
    if (overlap > 0 || tick) {
      time /= 1000;
      this.time = time;
      this.nextTime += overlap + (overlap >= this.gap ? 4 : this.gap - overlap);
    } else {
      delta = 0;
    }
    return delta;
  }

  public tick(): this {
    this.step(true);
    return this;
  }

  private update(): void {
    if (!this.paused) this.step(false);
  }

  public step(tick = false): void {
    const delta = this.getDelta(tick);
    if (delta <= 0) return;
    this.processing = true;
    const toDestroy: Tween[] = [];
    const list = this.tweens;
    for (let i = 0; i < list.length; i++) {
      const tween = list[i];
      if (tween.update(delta)) toDestroy.push(tween);
    }
    const count = toDestroy.length;
    if (count && list.length > 0) {
      for (let i = 0; i < count; i++) {
        const tween = toDestroy[i];
        const idx = list.indexOf(tween);
        if (idx > -1 && (tween.isPendingRemove() || tween.isDestroyed())) {
          list.splice(idx, 1);
          tween.destroy();
        }
      }
      toDestroy.length = 0;
    }
    this.processing = false;
  }

  public remove(tween: Tween): this {
    if (this.processing) {
      tween.setPendingRemoveState();
    } else {
      const i = this.tweens.indexOf(tween);
      if (i > -1) this.tweens.splice(i, 1);
      tween.setRemovedState();
    }
    return this;
  }

  public reset(tween: Tween): this {
    this.existing(tween);
    tween.seek();
    tween.setActiveState();
    return this;
  }

  public makeActive(tween: Tween): this {
    this.existing(tween);
    tween.setActiveState();
    return this;
  }

  public each(callback: (tween: Tween, ...args: unknown[]) => void, scope?: unknown, ...args: unknown[]): this {
    this.tweens.forEach((tween) => callback.apply(scope, [tween, ...args]));
    return this;
  }

  public getTweens(): Tween[] {
    return this.tweens.slice();
  }

  public getTweensOf(target: unknown): Tween[] {
    const output: Tween[] = [];
    const list = this.tweens;
    const targets = Array.isArray(target) ? (target as unknown[]).flat(Infinity) : [target];
    for (let i = 0; i < list.length; i++) {
      const tween = list[i];
      for (let t = 0; t < targets.length; t++) {
        if (!tween.isDestroyed() && tween.hasTarget(targets[t])) output.push(tween);
      }
    }
    return output;
  }

  public getGlobalTimeScale(): number { return this.timeScale; }
  public setGlobalTimeScale(value: number): this { this.timeScale = value; return this; }

  public isTweening(target: unknown): boolean {
    return this.tweens.some((t) => t.isPlaying() && t.hasTarget(target));
  }

  public killAll(): this {
    const tweens = this.processing ? this.getTweens() : this.tweens;
    for (let i = 0; i < tweens.length; i++) tweens[i].destroy();
    if (!this.processing) tweens.length = 0;
    return this;
  }

  public killTweensOf(target: unknown): this {
    const tweens = this.getTweensOf(target);
    for (let i = 0; i < tweens.length; i++) tweens[i].destroy();
    return this;
  }

  public pauseAll(): this { this.paused = true; return this; }
  public resumeAll(): this { this.paused = false; return this; }

  private shutdown(): void {
    this.killAll();
    this.tweens = [];
    this.systems.events.off(SceneEvents.UPDATE, this.update, this);
    this.systems.events.off(SceneEvents.SHUTDOWN, this.shutdown, this);
  }

  private destroy(): void {
    this.shutdown();
    this.systems.events.off(SceneEvents.START, this.start, this);
  }
}
