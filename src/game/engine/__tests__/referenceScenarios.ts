/**
 * OS CENÁRIOS DE REFERÊNCIA DO MOTOR 2D: cada roteiro devolve um registro (log) de tudo que aconteceu — o valor de cada
 * alvo a cada passo, a ordem dos callbacks, o que cada temporizador disparou e quando.
 *
 * O gabarito (`reference.fixtures.json`) foi gravado em 2026-11-08 rodando estes mesmos roteiros no motor que o jogo
 * usava antes do motor próprio: é o comportamento em cima do qual cada animação, espera e evento do jogo foi afinado,
 * número por número. O `engineReference.test.ts` roda os roteiros no motor de hoje e exige o MESMO registro.
 *
 * O gabarito NÃO se regera (o motor de antes não está mais no projeto). Se um teste daqui falhar, foi o motor que
 * mudou de comportamento — e o jogo junto. Roteiro novo só vale com gabarito conferido à mão.
 *
 * Este arquivo não importa o motor: quem roda entrega um `EngineAdapter`.
 */

type Fn = (...args: never[]) => unknown;
type Config = Record<string, unknown>;

export interface TweenLike {
  update(delta: number): boolean;
  readonly state: number;
  readonly progress: number;
  readonly totalProgress: number;
  stop(): unknown;
  pause(): unknown;
  resume(): unknown;
  complete(delay?: number): unknown;
  restart(): unknown;
  getValue(index?: number): number | null;
  isPlaying(): boolean;
}

export interface TweenManagerLike {
  add(config: Config): TweenLike;
  addCounter(config: Config): TweenLike;
  killTweensOf(target: unknown): unknown;
  isTweening(target: unknown): boolean;
  getTweens(): unknown[];
  pauseAll(): unknown;
  resumeAll(): unknown;
}

export interface TimerLike {
  getProgress(): number;
  getOverallProgress(): number;
  getRepeatCount(): number;
  getElapsed(): number;
  remove(dispatchCallback?: boolean): void;
  paused: boolean;
}

export interface ClockLike {
  addEvent(config: Config): TimerLike;
  delayedCall(delay: number, callback: Fn, args?: unknown[], scope?: unknown): TimerLike;
  removeAllEvents(): unknown;
  now: number;
  timeScale: number;
  paused: boolean;
}

export interface EmitterLike {
  on(event: string, fn: Fn, context?: unknown): unknown;
  once(event: string, fn: Fn, context?: unknown): unknown;
  off(event: string, fn?: Fn, context?: unknown, once?: boolean): unknown;
  emit(event: string, ...args: unknown[]): boolean;
  listenerCount(event: string): number;
  removeAllListeners(event?: string): unknown;
}

export interface ColorLike {
  r: number;
  g: number;
  b: number;
  a: number;
  readonly color: number;
  readonly color32: number;
  readonly rgba: string;
  readonly gl: ArrayLike<number>;
}

export interface EngineAdapter {
  /** Um tween avulso, já com `reset()` (o que o `this.tweens.add` faz), avançado à mão por `update(delta)`. */
  tween(config: Config): TweenLike;
  counter(config: Config): TweenLike;
  /** O gerenciador de tweens de uma cena, ligado (BOOT + START) com o `Date.now()` em `startNow`. */
  tweenManager(): { manager: TweenManagerLike; frame(time: number, delta: number): void; shutdown(): void };
  /** O relógio de uma cena, ligado (BOOT + START) com o relógio do jogo em `loopTime`. */
  clock(loopTime: number): { clock: ClockLike; frame(time: number, delta: number): void; shutdown(): void };
  emitter(): EmitterLike;
  ease(name: unknown, params?: number[]): (v: number) => number;
  wrap(value: number, min: number, max: number): number;
  wrapDegrees(angle: number): number;
  wrapRadians(angle: number): number;
  clamp(value: number, min: number, max: number): number;
  between(min: number, max: number): number;
  floatBetween(min: number, max: number): number;
  shuffle<T>(array: T[]): T[];
  interpolateRGB(r1: number, g1: number, b1: number, r2: number, g2: number, b2: number, length: number, index: number): { r: number; g: number; b: number; color: number };
  hexToColor(hex: string): ColorLike;
  valueToColor(value: number | string): ColorLike;
  newColor(r: number, g: number, b: number, a: number): ColorLike;
}

export type Log = unknown[];

// ── ferramentas ─────────────────────────────────────────────────────────────────────────────────

/** O relógio do navegador e o sorteio, fixados durante o cenário (os dois motores leem os mesmos números). */
const withFakeNowAndRandom = <T>(run: (setNow: (ms: number) => void) => T): T => {
  const realNow = Date.now;
  const realRandom = Math.random;
  let now = 1_000_000;
  let seed = 12345;
  Date.now = () => now;
  // LCG simples: o mesmo fluxo de "sorteios" nos dois lados.
  Math.random = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  try {
    return run((ms) => { now = ms; });
  } finally {
    Date.now = realNow;
    Math.random = realRandom;
  }
};

/** Um alvo de tween com nome (o nome aparece no registro no lugar do objeto). */
const target = (tag: string, values: Record<string, number>): Record<string, unknown> => ({ tag, ...values });

const describe = (v: unknown): unknown => {
  if (typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean' || v === null || v === undefined) return v ?? null;
  if (Array.isArray(v)) return v.map(describe);
  if (typeof v === 'object' && v && 'tag' in v) return (v as { tag: unknown }).tag;
  return '?';
};

const CALLBACKS = ['onActive', 'onStart', 'onUpdate', 'onYoyo', 'onRepeat', 'onLoop', 'onComplete', 'onStop', 'onPause', 'onResume'];

/** Liga todos os callbacks de um config ao registro (o primeiro argumento, o próprio tween, fica de fora). */
const withCallbacks = (log: Log, label: string, config: Config, only: string[] = CALLBACKS): Config => {
  const out: Config = { ...config };
  for (const name of only) out[name] = (...args: unknown[]) => { log.push([label, name, ...args.slice(1).map(describe)]); };
  return out;
};

const snapshot = (targets: Array<Record<string, unknown>>, keys: string[]): unknown[] =>
  targets.flatMap((t) => keys.map((k) => t[k] as number));

// ── os tweens avulsos ───────────────────────────────────────────────────────────────────────────

interface TweenCase {
  /** Monta o config (com alvos novos) e diz que chaves registrar em cada alvo. */
  build(log: Log): { config: Config; targets: Array<Record<string, unknown>>; keys: string[]; counter?: boolean };
  deltas: number[];
  /** O que fazer com o tween ANTES do passo de índice `at`. */
  actions?: Record<number, (tw: TweenLike, targets: Array<Record<string, unknown>>) => void>;
}

const steady = (ms: number, n: number): number[] => Array.from({ length: n }, () => ms);
const ragged = [7, 33, 16.6, 250, 100, 1, 0.5, 16.6, 16.7, 48, 300, 16.6, 16.6, 900, 16.6, 16.6, 16.6, 16.6];

const TWEEN_CASES: Record<string, TweenCase> = {
  linear: {
    build: (log) => {
      const a = target('a', { x: 0 });
      return { config: withCallbacks(log, 'linear', { targets: a, x: 100, duration: 1000, ease: 'Linear' }), targets: [a], keys: ['x'] };
    },
    deltas: steady(16.6, 70),
  },
  // 'Power2.easeOut' não existe no EaseMap: cai no Linear (o jogo usa esse nome em vários lugares).
  quirkAndTwoProps: {
    build: (log) => {
      const a = target('a', { x: 10, y: -5 });
      return {
        config: withCallbacks(log, 'quirk', { targets: a, x: 210, y: { value: 95, ease: 'Sine.easeInOut' }, delay: 200, duration: 600, ease: 'Power2.easeOut' }),
        targets: [a], keys: ['x', 'y'],
      };
    },
    deltas: [...ragged, ...steady(33, 30)],
  },
  yoyoHoldRepeat: {
    build: (log) => {
      const a = target('a', { scale: 1 });
      return {
        config: withCallbacks(log, 'yoyo', { targets: a, scale: 1.5, duration: 240, ease: 'Quad.easeOut', yoyo: true, hold: 80, repeat: 2, repeatDelay: 100 }),
        targets: [a], keys: ['scale'],
      };
    },
    deltas: [...steady(16.6, 40), ...ragged, ...steady(50, 30)],
  },
  // from/to, relativo, array, dois alvos com atraso por alvo (o "stagger" à mão que o jogo faz).
  valueForms: {
    build: (log) => {
      const a = target('a', { x: 0, y: 0, alpha: 1 });
      const b = target('b', { x: 5, y: 7, alpha: 0.5 });
      return {
        config: withCallbacks(log, 'forms', {
          targets: [a, b],
          x: { from: 50, to: -50 },
          y: '+=30',
          alpha: [0.2, 0.9],
          delay: (_t: unknown, _k: string, _v: number, i: number) => i * 100,
          duration: 400,
          ease: 'Back.easeOut',
        }),
        targets: [a, b], keys: ['x', 'y', 'alpha'],
      };
    },
    deltas: [...steady(16.6, 45), 500],
  },
  loopThenStop: {
    build: (log) => {
      const a = target('a', { angle: 0 });
      return { config: withCallbacks(log, 'loop', { targets: a, angle: 360, duration: 300, repeat: -1, ease: 'Linear' }), targets: [a], keys: ['angle'] };
    },
    deltas: steady(40, 40),
    actions: { 30: (tw) => { tw.stop(); } },
  },
  loopDelay: {
    build: (log) => {
      const a = target('a', { y: 0 });
      return { config: withCallbacks(log, 'loopd', { targets: a, y: 10, duration: 100, loop: 2, loopDelay: 50, yoyo: true, ease: 'Sine.easeOut' }), targets: [a], keys: ['y'] };
    },
    deltas: steady(16.6, 60),
  },
  completeMidway: {
    build: (log) => {
      const a = target('a', { x: 0 });
      return { config: withCallbacks(log, 'complete', { targets: a, x: 100, duration: 500, ease: 'Cubic.easeOut', persist: true }), targets: [a], keys: ['x'] };
    },
    deltas: steady(16.6, 30),
    actions: { 8: (tw) => { tw.complete(); }, 20: (tw) => { tw.restart(); } },
  },
  pauseResume: {
    build: (log) => {
      const a = target('a', { x: 0 });
      return { config: withCallbacks(log, 'pause', { targets: a, x: 100, duration: 400, ease: 'Sine.easeIn' }), targets: [a], keys: ['x'] };
    },
    deltas: steady(16.6, 40),
    actions: { 5: (tw) => { tw.pause(); }, 12: (tw) => { tw.resume(); } },
  },
  completeDelay: {
    build: (log) => {
      const a = target('a', { x: 0 });
      return { config: withCallbacks(log, 'cdelay', { targets: a, x: 1, duration: 100, completeDelay: 120, ease: 'Expo.easeIn' }), targets: [a], keys: ['x'] };
    },
    deltas: steady(16.6, 20),
  },
  // O valor inicial é lido no PRIMEIRO quadro, não quando o tween é criado.
  startReadOnFirstFrame: {
    build: (log) => {
      const a = target('a', { x: 0 });
      return { config: withCallbacks(log, 'late', { targets: a, x: 100, duration: 200, ease: 'Bounce.easeOut' }), targets: [a], keys: ['x'] };
    },
    deltas: steady(16.6, 20),
    actions: { 0: (_tw, [a]) => { a.x = 40; } },
  },
  zeroDuration: {
    build: (log) => {
      const a = target('a', { alpha: 0 });
      return { config: withCallbacks(log, 'zero', { targets: a, alpha: 1, duration: 0 }), targets: [a], keys: ['alpha'] };
    },
    deltas: steady(16.6, 5),
  },
  easeParams: {
    build: (log) => {
      const a = target('a', { x: 0, y: 0 });
      return {
        config: withCallbacks(log, 'params', { targets: a, x: { value: 100, ease: 'Back.easeOut', easeParams: [3] }, y: { value: 100, ease: 'Stepped', easeParams: [4] }, duration: 300 }),
        targets: [a], keys: ['x', 'y'],
      };
    },
    deltas: steady(16.6, 22),
  },
  counter: {
    build: (log) => ({
      config: withCallbacks(log, 'counter', { from: 0, to: 1, duration: 500, ease: 'Cubic.easeInOut' }, ['onStart', 'onComplete']),
      targets: [], keys: [], counter: true,
    }),
    deltas: [...steady(16.6, 20), ...ragged],
  },
  counterYoyo: {
    build: (log) => ({
      config: withCallbacks(log, 'counterYoyo', { from: 10, to: 20, duration: 200, yoyo: true, repeat: 1, ease: 'Sine.easeInOut' }, ['onStart', 'onYoyo', 'onRepeat', 'onComplete']),
      targets: [], keys: [], counter: true,
    }),
    deltas: steady(16.6, 60),
  },
};

const runTweenCase = (a: EngineAdapter, c: TweenCase): Log => withFakeNowAndRandom(() => {
  const log: Log = [];
  const { config, targets, keys, counter } = c.build(log);
  const tw = counter ? a.counter(config) : a.tween(config);
  c.deltas.forEach((delta, i) => {
    c.actions?.[i]?.(tw, targets);
    const done = tw.update(delta);
    log.push([i, ...snapshot(targets, keys), counter ? tw.getValue() : null, done, tw.state, tw.progress, tw.totalProgress, tw.isPlaying()]);
  });
  return log;
});

// ── o gerenciador de tweens (relógio próprio por Date.now, em passos de 1/240 s, com o atraso suavizado) ──────────

const runTweenManager = (a: EngineAdapter): Log => withFakeNowAndRandom((setNow) => {
  const log: Log = [];
  let now = 1_000_000;
  setNow(now);
  const { manager, frame, shutdown } = a.tweenManager();
  const o = target('o', { x: 0, y: 0 });
  const p = target('p', { x: 0 });
  manager.add(withCallbacks(log, 'mA', { targets: o, x: 100, duration: 300, ease: 'Quad.easeIn' }, ['onStart', 'onComplete']));
  manager.add(withCallbacks(log, 'mB', { targets: o, y: 50, duration: 500, delay: 100, ease: 'Sine.easeOut' }, ['onStart', 'onComplete']));
  manager.add(withCallbacks(log, 'mP', { targets: p, x: 10, duration: 2000, ease: 'Linear' }, ['onStart', 'onComplete', 'onStop']));
  const steps = [16, 17, 16, 2, 2, 1, 16, 600, 16, 16, 33, 33, 16, 3, 3, 3, 16, 16, 120, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16];
  let time = 0;
  steps.forEach((step, i) => {
    if (i === 12) manager.addCounter(withCallbacks(log, 'mC', { from: 0, to: 100, duration: 200 }, ['onStart', 'onComplete']));
    if (i === 20) manager.killTweensOf(p);
    if (i === 24) manager.pauseAll();
    if (i === 27) manager.resumeAll();
    now += step;
    setNow(now);
    time += step;
    frame(time, step);
    log.push([i, o.x, o.y, p.x, manager.getTweens().length, manager.isTweening(o), manager.isTweening(p)]);
  });
  shutdown();
  log.push(['afterShutdown', manager.getTweens().length]);
  return log;
});

// ── o relógio da cena (delayedCall / addEvent) ────────────────────────────────────────────────────

const runClock = (a: EngineAdapter): Log => withFakeNowAndRandom(() => {
  const log: Log = [];
  const { clock, frame, shutdown } = a.clock(5000);
  const tag = (name: string, ev: () => TimerLike | undefined) => () => {
    const e = ev();
    log.push([name, clock.now, e ? e.getRepeatCount() : null]);
  };
  const events: Record<string, TimerLike> = {};
  events.d100 = clock.delayedCall(100, tag('d100', () => events.d100));
  events.rep3 = clock.addEvent({ delay: 50, repeat: 3, callback: tag('rep3', () => events.rep3) });
  events.loop = clock.addEvent({ delay: 30, loop: true, callback: tag('loop', () => events.loop) });
  events.fast = clock.addEvent({ delay: 40, timeScale: 2, callback: tag('fast', () => events.fast) });
  events.startAt = clock.addEvent({ delay: 200, startAt: 150, callback: tag('startAt', () => events.startAt) });
  events.paused = clock.addEvent({ delay: 60, paused: true, callback: tag('paused', () => events.paused) });
  const scope = { tag: 'scope' };
  events.args = clock.addEvent({
    delay: 25, repeat: 2, args: [7, 'x'], callbackScope: scope,
    callback: function (this: unknown, ...args: unknown[]) { log.push(['args', this === scope, ...args.map(describe), clock.now]); },
  });
  const deltas = [16.6, 16.6, 16.6, 170, 16.6, 16.6, 16.6, 16.6, 16.6, 16.6, 16.6, 16.6, 16.6, 16.6, 50, 50, 16.6, 16.6, 16.6, 16.6, 16.6, 16.6, 16.6, 16.6, 16.6, 16.6, 16.6, 16.6, 16.6, 16.6, 16.6, 16.6];
  let time = 5000;
  deltas.forEach((delta, i) => {
    if (i === 10) events.paused.paused = false;
    if (i === 12) clock.timeScale = 0.5;
    if (i === 16) clock.timeScale = 1;
    if (i === 17) clock.paused = true;
    if (i === 19) clock.paused = false;
    if (i === 20) events.loop.remove(false);
    if (i === 22) events.rep3.remove(true);
    if (i === 25) clock.removeAllEvents();
    if (i === 26) events.late = clock.delayedCall(20, tag('late', () => events.late));
    time += delta;
    frame(time, delta);
    log.push([i, clock.now, events.d100.getProgress(), events.rep3.getOverallProgress(), events.rep3.getRepeatCount(), events.loop.getElapsed(), events.startAt.getProgress()]);
  });
  shutdown();
  frame(time + 100, 100);
  log.push(['afterShutdown', clock.now]);
  return log;
});

/** Passos inteiros: o atraso fecha EXATAMENTE na conta (o resto igual ao atraso), o caso de borda do "recuperar". */
const runClockExact = (a: EngineAdapter): Log => withFakeNowAndRandom(() => {
  const log: Log = [];
  const { clock, frame, shutdown } = a.clock(0);
  const tag = (name: string, ev: () => TimerLike | undefined) => () => {
    const e = ev();
    log.push([name, clock.now, e ? e.getRepeatCount() : null]);
  };
  const events: Record<string, TimerLike> = {};
  events.r5 = clock.addEvent({ delay: 50, repeat: 5, callback: tag('r5', () => events.r5) });
  events.l25 = clock.addEvent({ delay: 25, loop: true, callback: tag('l25', () => events.l25) });
  events.d100 = clock.delayedCall(100, tag('d100', () => events.d100));
  events.d0 = clock.delayedCall(0, tag('d0', () => events.d0));
  let time = 0;
  [0, 50, 100, 150, 25, 25, 200, 50, 75, 0, 100].forEach((delta, i) => {
    time += delta;
    frame(time, delta);
    log.push([i, clock.now, events.r5.getRepeatCount(), events.r5.getElapsed(), events.l25.getElapsed(), events.d100.getProgress()]);
  });
  shutdown();
  return log;
});

// ── o emissor de eventos ──────────────────────────────────────────────────────────────────────────

const runEmitter = (a: EngineAdapter): Log => {
  const log: Log = [];
  const ee = a.emitter();
  const ctxA = { tag: 'ctxA' };
  const ctxB = { tag: 'ctxB' };
  const first = function (this: unknown, ...args: unknown[]) { log.push(['first', this === ee ? 'ee' : describe(this), ...args]); };
  const second = function (this: unknown, ...args: unknown[]) { log.push(['second', describe(this), ...args]); };
  const onceFn = function (this: unknown, ...args: unknown[]) { log.push(['once', describe(this), ...args]); };
  // Quem sai no meio da emissão ainda é chamado nesta (a lista é a do começo); quem entra, só na próxima.
  const remover = () => { log.push(['remover']); ee.off('go', second); ee.on('go', lateComer); };
  const lateComer = () => { log.push(['lateComer']); };
  ee.on('go', first);
  ee.on('go', remover);
  ee.on('go', second, ctxA);
  ee.on('go', second, ctxB);
  ee.once('go', onceFn, ctxA);
  log.push(['count', ee.listenerCount('go')]);
  log.push(['emit1', ee.emit('go', 1, 'a')]);
  log.push(['count', ee.listenerCount('go')]);
  log.push(['emit2', ee.emit('go', 2)]);
  // `off` com contexto tira só os daquele contexto; com contexto "falso", tira de qualquer contexto.
  ee.on('ctx', second, ctxA);
  ee.on('ctx', second, ctxB);
  ee.off('ctx', second, ctxB);
  log.push(['ctxEmit', ee.emit('ctx')]);
  ee.on('ctx', second, ctxB);
  ee.off('ctx', second, null);
  log.push(['ctxCount', ee.listenerCount('ctx')]);
  // `off(..., once=true)` só tira os `once`.
  ee.on('o', first);
  ee.once('o', first);
  ee.off('o', first, undefined, true);
  log.push(['onceOff', ee.listenerCount('o'), ee.emit('o', 'x')]);
  // Um `once` que se registra de novo dentro dele mesmo.
  const again = () => { log.push(['again']); ee.once('re', again); };
  ee.once('re', again);
  ee.emit('re');
  ee.emit('re');
  log.push(['reCount', ee.listenerCount('re')]);
  log.push(['nobody', ee.emit('nobody')]);
  ee.removeAllListeners('go');
  log.push(['afterRemoveGo', ee.listenerCount('go'), ee.listenerCount('o')]);
  ee.removeAllListeners();
  log.push(['afterRemoveAll', ee.listenerCount('o'), ee.listenerCount('re')]);
  return log;
};

// ── as curvas, a matemática e as cores ────────────────────────────────────────────────────────────

/** Os nomes que o jogo escreve (ver o teste que varre o src) e as variações que o GetEaseFunction normaliza. */
export const EASE_NAMES: readonly string[] = [
  'Linear', 'Power0', 'Power1', 'Power2', 'Power3', 'Power4',
  'Quad', 'Cubic', 'Quart', 'Quint', 'Sine', 'Expo', 'Circ', 'Back', 'Bounce', 'Stepped',
  'Quad.easeIn', 'Quad.easeOut', 'Quad.easeInOut',
  'Cubic.easeIn', 'Cubic.easeOut', 'Cubic.easeInOut',
  'Quart.easeIn', 'Quart.easeOut', 'Quart.easeInOut',
  'Quint.easeIn', 'Quint.easeOut', 'Quint.easeInOut',
  'Sine.easeIn', 'Sine.easeOut', 'Sine.easeInOut',
  'Expo.easeIn', 'Expo.easeOut', 'Expo.easeInOut',
  'Circ.easeIn', 'Circ.easeOut', 'Circ.easeInOut',
  'Back.easeIn', 'Back.easeOut', 'Back.easeInOut',
  'Bounce.easeIn', 'Bounce.easeOut', 'Bounce.easeInOut',
  // os nomes "PowerN.easeX" não existem lá: o jogo usa alguns, e eles caem no Linear
  'Power2.easeOut', 'Power2.easeIn', 'Power3.easeIn', 'Power3.easeOut',
  // a normalização ('X.in' → 'X.easeIn'…) e o que não existe
  'quad.in', 'Quad.out', 'Sine.inout', 'sine.InOut', 'linear', 'cubic', 'Nada.easeIn', 'Nada', '',
];

const SAMPLES = [...Array.from({ length: 21 }, (_, i) => i / 20), 0.001, 0.333, 0.5005, 0.999];

const runEases = (a: EngineAdapter): Log => {
  const log: Log = [];
  for (const name of EASE_NAMES) log.push([name, ...SAMPLES.map((v) => a.ease(name)(v))]);
  log.push(['fn', ...SAMPLES.map((v) => a.ease((x: number) => x * 0.5)(v))]);
  log.push(['number', ...SAMPLES.map((v) => a.ease(7)(v))]);
  log.push(['Back.easeOut[3]', ...SAMPLES.map((v) => a.ease('Back.easeOut', [3])(v))]);
  log.push(['Back.easeInOut[1]', ...SAMPLES.map((v) => a.ease('Back.easeInOut', [1])(v))]);
  log.push(['Stepped[4]', ...SAMPLES.map((v) => a.ease('Stepped', [4])(v))]);
  return log;
};

const runMath = (a: EngineAdapter): Log => withFakeNowAndRandom(() => {
  const values = [-721.5, -360, -180.0001, -180, -179.9, -1e-9, 0, 1e-9, 90, 179.999, 180, 181, 359.75, 360, 540.25, 1080.1];
  const log: Log = [];
  log.push(['wrap', ...values.map((v) => a.wrap(v, -50, 75))]);
  log.push(['wrapDegrees', ...values.map((v) => a.wrapDegrees(v))]);
  log.push(['wrapRadians', ...values.map((v) => a.wrapRadians(v / 57.29577951308232))]);
  log.push(['clamp', ...values.map((v) => a.clamp(v, -100, 200))]);
  log.push(['between', ...Array.from({ length: 30 }, () => a.between(-3, 7))]);
  log.push(['floatBetween', ...Array.from({ length: 10 }, () => a.floatBetween(0.5, 2.5))]);
  log.push(['shuffle', ...a.shuffle(Array.from({ length: 12 }, (_, i) => i))]);
  return log;
});

const colorFields = (c: ColorLike): unknown[] => [c.r, c.g, c.b, c.a, c.color, c.color32, c.rgba, ...Array.from(c.gl)];

const runColor = (a: EngineAdapter): Log => {
  const log: Log = [];
  for (const i of [0, 1, 17, 50, 99, 100]) log.push(['interp', i, ...Object.values(a.interpolateRGB(255, 10, 0, 3, 200, 128, 100, i))]);
  for (const i of [0, 3, 7]) log.push(['interp7', i, ...Object.values(a.interpolateRGB(12, 34, 56, 210, 190, 170, 7, i))]);
  for (const hex of ['#ff8800', '0x123456', 'abc', '#ABC', 'f0f0f0', 'nope', '#12345']) log.push(['hex', hex, ...colorFields(a.hexToColor(hex))]);
  for (const v of [0xff00ff, 0x80ff00ff, 0, 0xffffff, 'rgba(10,20,30,0.5)', 'rgb(1, 2, 3)', '#0f0']) log.push(['value', v, ...colorFields(a.valueToColor(v))]);
  const c = a.newColor(300, -20, 12.7, 128);
  log.push(['new', ...colorFields(c)]);
  return log;
};

/** Todos os cenários, pelo nome que eles têm no arquivo de fixtures. */
export const SCENARIOS: Readonly<Record<string, (a: EngineAdapter) => Log>> = {
  ...Object.fromEntries(Object.entries(TWEEN_CASES).map(([name, c]) => [`tween.${name}`, (a: EngineAdapter) => runTweenCase(a, c)])),
  'tweenManager.clock': runTweenManager,
  'clock.timers': runClock,
  'clock.exact': runClockExact,
  'events.emitter': runEmitter,
  'math.eases': runEases,
  'math.basics': runMath,
  'color.basics': runColor,
};
