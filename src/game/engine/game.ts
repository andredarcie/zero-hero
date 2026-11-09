/**
 * O JOGO e o LAÇO DE QUADROS — o Game, o TimeStep e o VisibilityHandler. O laço: o delta
 * de cada quadro é a média dos últimos 10 (com teto de 200 ms e um "esfriamento" de 120 quadros depois de pausar), e
 * o quadro anda em PRE_STEP → STEP → cenas → POST_STEP → desenho (PRE_RENDER → cenas → POST_RENDER). O jogo inteiro
 * mede o tempo por este delta (`game.loop.delta`), então mudar a conta mudaria o ritmo do vale.
 * Parte do motor próprio (src/game/engine); licenças em LICENSES.md.
 */
import { EventEmitter } from './events';
import { CoreEvents } from './constants';
import { SceneManager, type Scene } from './scene';
import { TextureManager } from './textures';
import { CacheManager } from './loader';
import { DataManager } from './data';
import { InputManager } from './input';
import { ScaleManager } from './scale';
import type { Renderer } from './renderer';
import { Color, ValueToColor } from './color';
import { browserHost } from './browserHost';
import type { EngineHost } from './host';

export interface GameConfig {
  /** Onde o motor roda (ver host.ts); sem ele, o navegador. */
  host?: EngineHost;
  type?: number;
  parent?: string | HTMLElement;
  width?: number;
  height?: number;
  backgroundColor?: string | number;
  transparent?: boolean;
  pixelArt?: boolean;
  roundPixels?: boolean;
  scale?: { mode?: number; autoCenter?: number; width?: number; height?: number };
  scene?: Array<new () => Scene>;
}

/** O que sobra da config depois de lida: só os campos que o motor usa. */
export class Config {
  public readonly host: EngineHost;
  public readonly parent: string | HTMLElement | undefined;
  public readonly width: number;
  public readonly height: number;
  public readonly transparent: boolean;
  public readonly pixelArt: boolean;
  public readonly antialias: boolean;
  public readonly roundPixels: boolean;
  public readonly backgroundColor: Color;
  public readonly sceneConfig: Array<new () => Scene>;
  public readonly autoFocus = true;
  public readonly inputTouch: boolean;

  public constructor(config: GameConfig) {
    // A semente do gerador de antes era sorteada aqui (`Date.now() * Math.random()`). O sorteio fica, para a
    // sequência do `Math.random` do jogo inteiro continuar a mesma de antes.
    void (Date.now() * Math.random());
    this.host = config.host ?? browserHost;
    this.parent = config.parent;
    this.width = config.scale?.width ?? config.width ?? 1024;
    this.height = config.scale?.height ?? config.height ?? 768;
    this.transparent = config.transparent ?? false;
    this.pixelArt = config.pixelArt ?? false;
    this.antialias = !this.pixelArt;
    this.roundPixels = this.pixelArt ? true : (config.roundPixels ?? false);
    if (this.transparent) {
      this.backgroundColor = ValueToColor(0x000000);
      this.backgroundColor.alpha = 0;
    } else {
      this.backgroundColor = ValueToColor(config.backgroundColor ?? 0);
    }
    this.sceneConfig = config.scene ?? [];
    this.inputTouch = this.host.page?.touch ?? false;
  }
}

// ── O laço ──────────────────────────────────────────────────────────────────────────────────────

export class TimeStep {
  public started = false;
  public running = false;
  public readonly minFps = 5;
  public readonly targetFps = 60;
  public actualFps = 60;
  public nextFpsUpdate = 0;
  public framesThisSecond = 0;
  public time = 0;
  public startTime = 0;
  public lastTime = 0;
  public frame = 0;
  public inFocus = true;
  public pauseDuration = 0;
  public delta = 0;
  public deltaIndex = 0;
  public deltaHistory: number[] = [];
  public readonly deltaSmoothingMax = 10;
  public readonly panicMax = 120;
  public rawDelta = 0;
  public now = 0;
  public smoothStep = true;
  private readonly _min = 1000 / 5;
  private readonly _target = 1000 / 60;
  private _pauseTime = 0;
  private _coolDown = 0;
  private callback: (time: number, delta: number) => void = () => undefined;
  private rafId: number | null = null;
  private rafRunning = false;

  public constructor(private readonly host: EngineHost) {}

  private readonly rafStep = (time: number): void => {
    this.step(time);
    if (this.rafRunning) this.rafId = this.host.requestFrame(this.rafStep);
  };

  public start(callback: (time: number, delta: number) => void): void {
    if (this.started) return;
    this.started = true;
    this.running = true;
    for (let i = 0; i < this.deltaSmoothingMax; i++) this.deltaHistory[i] = this._target;
    this.resetDelta();
    this.startTime = this.host.now();
    this.callback = callback;
    this.rafStart();
  }

  private rafStart(): void {
    if (this.rafRunning) return;
    this.rafRunning = true;
    this.rafId = this.host.requestFrame(this.rafStep);
  }

  private rafStop(): void {
    this.rafRunning = false;
    if (this.rafId !== null) this.host.cancelFrame(this.rafId);
  }

  public step(time: number): void {
    this.now = time;
    let delta = Math.max(0, time - this.lastTime);
    this.rawDelta = delta;
    this.time += this.rawDelta;
    if (this.smoothStep) delta = this.smoothDelta(delta);
    this.delta = delta;
    if (time >= this.nextFpsUpdate) this.updateFPS(time);
    this.framesThisSecond++;
    this.callback(time, delta);
    this.lastTime = time;
    this.frame++;
  }

  /** Um quadro na mão, fora do rAF (a aba escondida congela o rAF; o harness de playtest anda o jogo assim). */
  public tick(): void {
    this.step(this.host.now());
  }

  private updateFPS(time: number): void {
    this.actualFps = 0.25 * this.framesThisSecond + 0.75 * this.actualFps;
    this.nextFpsUpdate = time + 1000;
    this.framesThisSecond = 0;
  }

  public sleep(): void {
    if (this.running) {
      this.rafStop();
      this.running = false;
    }
  }

  public wake(seamless = false): void {
    const now = this.host.now();
    if (this.running) return;
    if (seamless) this.startTime += -this.lastTime + (this.lastTime + now);
    this.rafStart();
    this.running = true;
    this.nextFpsUpdate = now + 1000;
    this.framesThisSecond = 0;
    this.tick();
  }

  public getDuration(): number { return Math.round(this.lastTime - this.startTime) / 1000; }
  public getDurationMS(): number { return Math.round(this.lastTime - this.startTime); }

  public pause(): void {
    this._pauseTime = this.host.now();
  }

  public resume(): void {
    this.resetDelta();
    this.pauseDuration = this.time - this._pauseTime;
    this.startTime += this.pauseDuration;
  }

  public blur(): void {
    this.inFocus = false;
  }

  public focus(): void {
    this.inFocus = true;
    this.resetDelta();
  }

  public resetDelta(): void {
    const now = this.host.now();
    this.time = now;
    this.lastTime = now;
    this.nextFpsUpdate = now + 1000;
    this.framesThisSecond = 0;
    for (let i = 0; i < this.deltaSmoothingMax; i++) this.deltaHistory[i] = Math.min(this._target, this.deltaHistory[i]);
    this.delta = 0;
    this.deltaIndex = 0;
    this._coolDown = this.panicMax;
  }

  private smoothDelta(delta: number): number {
    const idx = this.deltaIndex;
    const history = this.deltaHistory;
    const max = this.deltaSmoothingMax;
    if (this._coolDown > 0 || !this.inFocus) {
      this._coolDown--;
      delta = Math.min(delta, this._target);
    }
    if (delta > this._min) {
      delta = history[idx];
      delta = Math.min(delta, this._min);
    }
    history[idx] = delta;
    this.deltaIndex++;
    if (this.deltaIndex >= max) this.deltaIndex = 0;
    let avg = 0;
    for (let i = 0; i < max; i++) avg += history[i];
    avg /= max;
    return avg;
  }

  public stop(): this {
    this.running = false;
    this.started = false;
    this.rafStop();
    return this;
  }

  public destroy(): void {
    this.stop();
    this.callback = () => undefined;
  }
}

// ── O jogo ──────────────────────────────────────────────────────────────────────────────────────

export class Game {
  public readonly config: Config;
  public readonly events = new EventEmitter();
  public readonly textures: TextureManager;
  public readonly cache = new CacheManager();
  public readonly registry = new DataManager();
  public readonly input: InputManager;
  public readonly scene: SceneManager;
  public readonly scale: ScaleManager;
  public readonly loop: TimeStep;
  /** O desenho 2D; `null` quando o anfitrião roda sem GPU (o quadro anda igual, só não desenha). */
  public renderer: Renderer | null = null;
  public canvas!: HTMLCanvasElement;
  public context: WebGLRenderingContext | null = null;
  public isBooted = false;
  public isRunning = false;
  public hasFocus = false;
  public isPaused = false;
  private pendingDestroy = false;
  private removeCanvas = false;

  public constructor(config: GameConfig) {
    this.config = new Config(config);
    this.loop = new TimeStep(this.config.host);
    this.textures = new TextureManager(this);
    this.input = new InputManager(this);
    this.scene = new SceneManager(this, this.config.sceneConfig);
    this.scale = new ScaleManager(this);
    this.events.once(CoreEvents.READY, () => this.scene.bootQueue());
    const page = this.config.host.page;
    if (page) page.whenReady(() => this.boot());
    else this.boot();
  }

  /** O anfitrião (ver host.ts). */
  public get host(): EngineHost {
    return this.config.host;
  }

  private boot(): void {
    if (this.isBooted) return;
    this.isBooted = true;
    this.scale.preBoot();
    // O CreateRenderer: o canvas com o tamanho da base e o desenho sem suavização (pixelArt).
    const host = this.config.host;
    this.canvas = host.createCanvas(this.scale.baseSize.width, this.scale.baseSize.height);
    this.renderer = host.createRenderer(this);
    this.context = this.renderer?.gl ?? null;
    host.page?.mountCanvas(this.canvas, this.config.parent, !this.config.antialias);
    this.textures.once('ready', this.texturesReady, this);
    this.events.emit(CoreEvents.BOOT);
    this.textures.boot();
  }

  private texturesReady(): void {
    this.events.emit(CoreEvents.READY);
    this.start();
  }

  private start(): void {
    this.isRunning = true;
    this.loop.start(this.step.bind(this));
    this.installVisibilityHandler();
    const ee = this.events;
    ee.on(CoreEvents.HIDDEN, this.onHidden, this);
    ee.on(CoreEvents.VISIBLE, this.onVisible, this);
    ee.on(CoreEvents.BLUR, this.onBlur, this);
    ee.on(CoreEvents.FOCUS, this.onFocus, this);
  }

  /** O VisibilityHandler: aba escondida/visível e foco da janela viram eventos do jogo. */
  private installVisibilityHandler(): void {
    const page = this.config.host.page;
    if (!page) return;
    const ee = this.events;
    page.watchVisibility({
      hidden: () => { ee.emit(CoreEvents.HIDDEN); },
      visible: () => { ee.emit(CoreEvents.VISIBLE); },
      blur: () => { ee.emit(CoreEvents.BLUR); },
      focus: () => { ee.emit(CoreEvents.FOCUS); },
    });
    if (this.config.autoFocus) page.focus();
  }

  public step(time: number, delta: number): void {
    if (this.pendingDestroy) {
      this.runDestroy();
      return;
    }
    if (this.isPaused) return;
    const ee = this.events;
    ee.emit(CoreEvents.PRE_STEP, time, delta);
    ee.emit(CoreEvents.STEP, time, delta);
    this.scene.update(time, delta);
    ee.emit(CoreEvents.POST_STEP, time, delta);
    const renderer = this.renderer;
    // Sem GPU, só o desenho fica de fora: os dois avisos saem igual (o ponteiro é lido no PRE_RENDER).
    if (!renderer) {
      ee.emit(CoreEvents.PRE_RENDER, null, time, delta);
      ee.emit(CoreEvents.POST_RENDER, null, time, delta);
      return;
    }
    renderer.preRender();
    ee.emit(CoreEvents.PRE_RENDER, renderer, time, delta);
    this.scene.render(renderer);
    renderer.postRender();
    ee.emit(CoreEvents.POST_RENDER, renderer, time, delta);
  }

  private onHidden(): void {
    this.loop.pause();
    this.events.emit(CoreEvents.PAUSE);
  }

  private onVisible(): void {
    this.loop.resume();
    this.events.emit(CoreEvents.RESUME, this.loop.pauseDuration);
  }

  private onBlur(): void {
    this.hasFocus = false;
    this.loop.blur();
  }

  private onFocus(): void {
    this.hasFocus = true;
    this.loop.focus();
  }

  public getFrame(): number { return this.loop.frame; }
  public getTime(): number { return this.loop.now; }

  public pause(): void {
    const was = this.isPaused;
    this.isPaused = true;
    if (!was) this.events.emit(CoreEvents.PAUSE);
  }

  public resume(): void {
    const was = this.isPaused;
    this.isPaused = false;
    if (was) this.events.emit(CoreEvents.RESUME, 0);
  }

  public destroy(removeCanvas = false): void {
    this.pendingDestroy = true;
    this.removeCanvas = removeCanvas;
  }

  private runDestroy(): void {
    this.scene.destroy();
    this.events.emit(CoreEvents.DESTROY);
    this.events.removeAllListeners();
    this.renderer?.destroy();
    if (this.removeCanvas && this.canvas?.parentNode) this.canvas.parentNode.removeChild(this.canvas);
    this.loop.destroy();
    this.pendingDestroy = false;
  }
}
