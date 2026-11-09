/**
 * AS CENAS — a Scene, os Systems de cada uma, o SceneManager e o ScenePlugin (`this.scene`), com a
 * mesma máquina de estados e, principalmente, a mesma ORDEM: as trocas de cena pedidas por `this.scene.*` entram numa
 * fila que só roda no começo do quadro seguinte, as cenas atualizam de trás para frente e desenham de frente para trás,
 * e os sistemas de cada cena se inscrevem nos eventos dela numa ordem fixa de criação (câmeras, listas, relógio,
 * entrada, carregador, animações) — é essa ordem que decide quem anda primeiro dentro de um quadro.
 * Parte do motor próprio (src/game/engine); licenças em LICENSES.md.
 */
import { EventEmitter } from './events';
import { SceneEvents, SceneStatus } from './constants';
import { CameraManager } from './camera';
import { Clock } from './time';
import { TweenManager } from './tweens';
import { InputPlugin } from './input';
import { LoaderPlugin } from './loader';
import { GameObjectCreator, GameObjectFactory } from './gameobjects/factory';
import type { GameObject } from './gameobjects/GameObject';
import type { Game } from './game';
import type { DataManager } from './data';
import type { TextureManager } from './textures';
import type { CacheManager } from './loader';
import type { ScaleManager } from './scale';
import type { Renderer } from './renderer';

const NOOP = (): void => undefined;

export interface SceneSettings {
  status: number;
  key: string;
  active: boolean;
  visible: boolean;
  isBooted: boolean;
  isTransition: boolean;
  data: unknown;
}

// ── As listas da cena ───────────────────────────────────────────────────────────────────────────

/** A lista do que se desenha (DisplayList): ordem de entrada, reordenada por profundidade só quando pedido. */
export class DisplayList {
  public list: GameObject[] = [];
  public sortChildrenFlag = false;
  public readonly events: EventEmitter;

  public constructor(private readonly systems: Systems) {
    this.events = systems.events;
    this.events.once(SceneEvents.BOOT, this.boot, this);
    this.events.on(SceneEvents.START, this.start, this);
  }

  private boot(): void {
    this.events.once(SceneEvents.DESTROY, this.destroy, this);
  }

  private start(): void {
    this.events.once(SceneEvents.SHUTDOWN, this.shutdown, this);
  }

  public get length(): number {
    return this.list.length;
  }

  public exists(child: GameObject): boolean {
    return this.list.indexOf(child) > -1;
  }

  /** O `add` com callback (o que a fábrica usa): tira o objeto de outra lista/caixa e avisa a cena. */
  public add(child: GameObject, skipCallback = false): GameObject {
    if (this.list.indexOf(child) === -1) {
      this.list.push(child);
      if (!skipCallback) this.addChildCallback(child);
    }
    return child;
  }

  public remove(child: GameObject, skipCallback = false): GameObject | null {
    const i = this.list.indexOf(child);
    if (i === -1) return null;
    this.list.splice(i, 1);
    if (!skipCallback) this.removeChildCallback(child);
    return child;
  }

  private addChildCallback(gameObject: GameObject): void {
    if (gameObject.displayList && gameObject.displayList !== this) gameObject.removeFromDisplayList();
    if (gameObject.parentContainer) gameObject.parentContainer.remove(gameObject);
    if (!gameObject.displayList) {
      this.queueDepthSort();
      gameObject.displayList = this;
      gameObject.emit(SceneEvents.ADDED_TO_SCENE, gameObject, this.systems.scene);
      this.events.emit(SceneEvents.ADDED_TO_SCENE, gameObject, this.systems.scene);
    }
  }

  private removeChildCallback(gameObject: GameObject): void {
    this.queueDepthSort();
    gameObject.displayList = null;
    gameObject.emit(SceneEvents.REMOVED_FROM_SCENE, gameObject, this.systems.scene);
    this.events.emit(SceneEvents.REMOVED_FROM_SCENE, gameObject, this.systems.scene);
  }

  public queueDepthSort(): void {
    this.sortChildrenFlag = true;
  }

  /** O StableSort: empate de profundidade mantém a ordem de entrada. */
  public depthSort(): void {
    if (!this.sortChildrenFlag) return;
    const indexed = this.list.map((child, i) => ({ child, i }));
    indexed.sort((a, b) => (a.child.depth - b.child.depth) || (a.i - b.i));
    for (let i = 0; i < indexed.length; i++) this.list[i] = indexed[i].child;
    this.sortChildrenFlag = false;
  }

  public getChildren(): GameObject[] {
    return this.list;
  }

  private shutdown(): void {
    const list = this.list;
    let i = list.length;
    while (i--) {
      if (list[i]) list[i].destroy(true);
    }
    list.length = 0;
    this.events.off(SceneEvents.SHUTDOWN, this.shutdown, this);
  }

  private destroy(): void {
    this.shutdown();
    this.events.off(SceneEvents.START, this.start, this);
  }
}

type Updatable = GameObject & { preUpdate(time: number, delta: number): void };

/** A lista de quem anda por quadro (UpdateList): quem entra só anda a partir do PRE_UPDATE seguinte. */
export class UpdateList {
  private _pending: Updatable[] = [];
  private _active: Updatable[] = [];
  private _destroy: Updatable[] = [];
  private _toProcess = 0;

  public constructor(private readonly systems: Systems) {
    systems.events.once(SceneEvents.BOOT, this.boot, this);
    systems.events.on(SceneEvents.START, this.start, this);
  }

  private boot(): void {
    this.systems.events.once(SceneEvents.DESTROY, this.destroy, this);
  }

  private start(): void {
    const ee = this.systems.events;
    ee.on(SceneEvents.PRE_UPDATE, this.update, this);
    ee.on(SceneEvents.UPDATE, this.sceneUpdate, this);
    ee.once(SceneEvents.SHUTDOWN, this.shutdown, this);
  }

  private isActive(item: Updatable): boolean { return this._active.indexOf(item) > -1; }
  private isPending(item: Updatable): boolean { return this._toProcess > 0 && this._pending.indexOf(item) > -1; }
  private isDestroying(item: Updatable): boolean { return this._destroy.indexOf(item) > -1; }

  public add(item: Updatable): Updatable {
    if ((this.isActive(item) && !this.isDestroying(item)) || this.isPending(item)) return item;
    this._pending.push(item);
    this._toProcess++;
    return item;
  }

  public remove(item: Updatable): Updatable {
    if (this.isPending(item)) {
      const idx = this._pending.indexOf(item);
      if (idx !== -1) this._pending.splice(idx, 1);
    } else if (this.isActive(item)) {
      this._destroy.push(item);
      this._toProcess++;
    }
    return item;
  }

  private update(): void {
    if (this._toProcess === 0) return;
    const active = this._active;
    for (const item of this._destroy) {
      const idx = active.indexOf(item);
      if (idx !== -1) active.splice(idx, 1);
    }
    this._destroy.length = 0;
    for (const item of this._pending) {
      if (active.indexOf(item) === -1) active.push(item);
    }
    this._pending.length = 0;
    this._toProcess = 0;
  }

  private sceneUpdate(time: number, delta: number): void {
    const list = this._active;
    const length = list.length;
    for (let i = 0; i < length; i++) {
      const gameObject = list[i];
      if (gameObject.active) gameObject.preUpdate(time, delta);
    }
  }

  private shutdown(): void {
    let i = this._active.length;
    while (i--) this._active[i].destroy(true);
    i = this._pending.length;
    while (i--) this._pending[i].destroy(true);
    i = this._destroy.length;
    while (i--) this._destroy[i].destroy(true);
    this._toProcess = 0;
    this._pending = [];
    this._active = [];
    this._destroy = [];
    const ee = this.systems.events;
    ee.off(SceneEvents.PRE_UPDATE, this.update, this);
    ee.off(SceneEvents.UPDATE, this.sceneUpdate, this);
    ee.off(SceneEvents.SHUTDOWN, this.shutdown, this);
  }

  private destroy(): void {
    this.shutdown();
    this.systems.events.off(SceneEvents.START, this.start, this);
  }
}

// ── Os sistemas de uma cena ─────────────────────────────────────────────────────────────────────

export class Systems {
  public readonly settings: SceneSettings;
  public readonly events = new EventEmitter();
  public game!: Game;
  public sceneUpdate: (time: number, delta: number) => void = NOOP;
  public cameras!: CameraManager;
  public add!: GameObjectFactory;
  public make!: GameObjectCreator;
  public scenePlugin!: ScenePlugin;
  public displayList!: DisplayList;
  public updateList!: UpdateList;
  public time!: Clock;
  public input!: InputPlugin;
  public load!: LoaderPlugin;
  public tweens!: TweenManager;
  public registry!: DataManager;
  public textures!: TextureManager;
  public cache!: CacheManager;
  public scale!: ScaleManager;
  /** O desenho 2D do jogo (`null` sem GPU, ver host.ts). */
  public renderer: Renderer | null = null;

  public constructor(public readonly scene: Scene, config?: string | { key?: string; active?: boolean; visible?: boolean }) {
    const c = typeof config === 'string' ? { key: config } : (config ?? {});
    this.settings = {
      status: SceneStatus.PENDING,
      key: c.key ?? '',
      active: c.active ?? false,
      visible: c.visible ?? true,
      isBooted: false,
      isTransition: false,
      data: {},
    };
  }

  /** Cria os sistemas da cena NA ORDEM fixa (Global, CoreScene, DefaultScene) e os pendura na cena. */
  public init(game: Game): void {
    this.settings.status = SceneStatus.INIT;
    this.sceneUpdate = NOOP;
    this.game = game;
    this.renderer = game.renderer;
    this.registry = game.registry;
    this.textures = game.textures;
    this.cache = game.cache;
    this.scale = game.scale;
    this.cameras = new CameraManager(this);
    this.make = new GameObjectCreator(this);
    this.add = new GameObjectFactory(this);
    this.scenePlugin = new ScenePlugin(this);
    this.displayList = new DisplayList(this);
    this.updateList = new UpdateList(this);
    this.time = new Clock(this);
    this.input = new InputPlugin(this);
    this.load = new LoaderPlugin(this);
    this.tweens = new TweenManager(this);
    const s = this.scene;
    s.game = game;
    s.registry = this.registry;
    s.textures = this.textures;
    s.cache = this.cache;
    s.scale = this.scale;
    s.renderer = this.renderer;
    s.events = this.events;
    s.cameras = this.cameras;
    s.add = this.add;
    s.make = this.make;
    s.scene = this.scenePlugin;
    s.children = this.displayList;
    s.time = this.time;
    s.input = this.input;
    s.load = this.load;
    s.tweens = this.tweens;
    this.events.emit(SceneEvents.BOOT, this);
    this.settings.isBooted = true;
  }

  public step(time: number, delta: number): void {
    const events = this.events;
    events.emit(SceneEvents.PRE_UPDATE, time, delta);
    events.emit(SceneEvents.UPDATE, time, delta);
    this.sceneUpdate.call(this.scene, time, delta);
    events.emit(SceneEvents.POST_UPDATE, time, delta);
  }

  public render(renderer: Renderer): void {
    const displayList = this.displayList;
    displayList.depthSort();
    this.events.emit(SceneEvents.PRE_RENDER, renderer);
    this.cameras.render(renderer, displayList);
    this.events.emit(SceneEvents.RENDER, renderer);
  }

  public queueDepthSort(): void {
    this.displayList.queueDepthSort();
  }

  public depthSort(): void {
    this.displayList.depthSort();
  }

  public pause(data?: unknown): this {
    const settings = this.settings;
    const status = settings.status;
    if (status !== SceneStatus.CREATING && status !== SceneStatus.RUNNING) {
      console.warn('Cannot pause non-running Scene', settings.key);
    } else if (settings.active) {
      settings.status = SceneStatus.PAUSED;
      settings.active = false;
      this.events.emit(SceneEvents.PAUSE, this, data);
    }
    return this;
  }

  public resume(data?: unknown): this {
    const settings = this.settings;
    if (!settings.active) {
      settings.status = SceneStatus.RUNNING;
      settings.active = true;
      this.events.emit(SceneEvents.RESUME, this, data);
    }
    return this;
  }

  public sleep(data?: unknown): this {
    const settings = this.settings;
    const status = settings.status;
    if (status !== SceneStatus.CREATING && status !== SceneStatus.RUNNING) {
      console.warn('Cannot sleep non-running Scene', settings.key);
    } else {
      settings.status = SceneStatus.SLEEPING;
      settings.active = false;
      settings.visible = false;
      this.events.emit(SceneEvents.SLEEP, this, data);
    }
    return this;
  }

  public wake(data?: unknown): this {
    const settings = this.settings;
    settings.status = SceneStatus.RUNNING;
    settings.active = true;
    settings.visible = true;
    this.events.emit(SceneEvents.WAKE, this, data);
    return this;
  }

  public getStatus(): number { return this.settings.status; }
  public isSleeping(): boolean { return this.settings.status === SceneStatus.SLEEPING; }
  public isActive(): boolean { return this.settings.status === SceneStatus.RUNNING; }
  public isPaused(): boolean { return this.settings.status === SceneStatus.PAUSED; }
  public isTransitioning(): boolean { return this.settings.isTransition; }
  public isVisible(): boolean { return this.settings.visible; }

  public canInput(): boolean {
    const status = this.settings.status;
    return status > SceneStatus.PENDING && status <= SceneStatus.RUNNING;
  }

  public setVisible(value: boolean): this {
    this.settings.visible = value;
    return this;
  }

  public start(data?: unknown): void {
    const settings = this.settings;
    if (data) settings.data = data;
    settings.status = SceneStatus.START;
    settings.active = true;
    settings.visible = true;
    this.events.emit(SceneEvents.START, this);
    this.events.emit(SceneEvents.READY, this, data);
  }

  public shutdown(data?: unknown): void {
    const settings = this.settings;
    settings.status = SceneStatus.SHUTDOWN;
    settings.active = false;
    settings.visible = false;
    this.events.emit(SceneEvents.SHUTDOWN, this, data);
  }

  public destroy(): void {
    const settings = this.settings;
    settings.status = SceneStatus.DESTROYED;
    settings.active = false;
    settings.visible = false;
    this.events.emit(SceneEvents.DESTROY, this);
    this.events.removeAllListeners();
  }
}

// ── A cena ──────────────────────────────────────────────────────────────────────────────────────

export class Scene {
  public readonly sys: Systems;
  public game!: Game;
  public registry!: DataManager;
  public textures!: TextureManager;
  public cache!: CacheManager;
  public scale!: ScaleManager;
  public renderer: Renderer | null = null;
  public events!: EventEmitter;
  public cameras!: CameraManager;
  public add!: GameObjectFactory;
  public make!: GameObjectCreator;
  public scene!: ScenePlugin;
  public children!: DisplayList;
  public time!: Clock;
  public input!: InputPlugin;
  public load!: LoaderPlugin;
  public tweens!: TweenManager;

  public constructor(config?: string | { key?: string; active?: boolean; visible?: boolean }) {
    this.sys = new Systems(this, config);
  }

  public init?(data?: unknown): void;
  public preload?(): void;
  public create?(data?: unknown): void;
  public update?(time: number, delta: number): void;
}

// ── O `this.scene` de cada cena ─────────────────────────────────────────────────────────────────

export class ScenePlugin {
  public readonly key: string;
  public readonly manager: SceneManager;

  public constructor(private readonly systems: Systems) {
    this.key = systems.settings.key;
    this.manager = systems.game.scene;
  }

  public get settings(): SceneSettings { return this.systems.settings; }

  public start(key?: string, data?: unknown): this {
    if (key === undefined) key = this.key;
    this.manager.queueOp('stop', this.key);
    this.manager.queueOp('start', key, data);
    return this;
  }

  public restart(data?: unknown): this {
    const key = this.key;
    this.manager.queueOp('stop', key);
    this.manager.queueOp('start', key, data);
    return this;
  }

  public launch(key: string, data?: unknown): this {
    if (key && key !== this.key) this.manager.queueOp('start', key, data);
    return this;
  }

  public run(key: string, data?: unknown): this {
    if (key && key !== this.key) this.manager.queueOp('run', key, data);
    return this;
  }

  public pause(key?: string, data?: unknown): this {
    this.manager.queueOp('pause', key ?? this.key, data);
    return this;
  }

  public resume(key?: string, data?: unknown): this {
    this.manager.queueOp('resume', key ?? this.key, data);
    return this;
  }

  public sleep(key?: string, data?: unknown): this {
    this.manager.queueOp('sleep', key ?? this.key, data);
    return this;
  }

  public wake(key?: string, data?: unknown): this {
    this.manager.queueOp('wake', key ?? this.key, data);
    return this;
  }

  public stop(key?: string, data?: unknown): this {
    this.manager.queueOp('stop', key ?? this.key, data);
    return this;
  }

  public isActive(key?: string): boolean | null {
    return this.manager.isActive(key ?? this.key);
  }

  public isPaused(key?: string): boolean | null {
    return this.manager.isPaused(key ?? this.key);
  }

  public isSleeping(key?: string): boolean | null {
    return this.manager.isSleeping(key ?? this.key);
  }

  public isVisible(key?: string): boolean | null {
    return this.manager.isVisible(key ?? this.key);
  }

  public get(key: string): Scene | null {
    return this.manager.getScene(key);
  }

  public getStatus(key: string): number | undefined {
    return this.manager.getScene(key)?.sys.getStatus();
  }

  public setVisible(value: boolean, key?: string): this {
    this.manager.getScene(key ?? this.key)?.sys.setVisible(value);
    return this;
  }
}

// ── O gerenciador ───────────────────────────────────────────────────────────────────────────────

type SceneOp = 'start' | 'stop' | 'run' | 'pause' | 'resume' | 'sleep' | 'wake';
type SceneClass = new () => Scene;

export class SceneManager {
  public readonly keys: Record<string, Scene> = {};
  public readonly scenes: Scene[] = [];
  public isProcessing = false;
  public isBooted = false;
  public customViewports = 0;
  private readonly _pending: Array<{ scene: SceneClass; autoStart: boolean }> = [];
  private readonly _start: string[] = [];
  private readonly _queue: Array<{ op: SceneOp; keyA?: string; keyB?: unknown }> = [];
  private readonly _data: Record<string, { autoStart?: boolean; data: unknown }> = {};

  public constructor(private readonly game: Game, sceneConfig: SceneClass[]) {
    sceneConfig.forEach((scene, i) => this._pending.push({ scene, autoStart: i === 0 }));
  }

  /** O READY do jogo: instancia as cenas e liga a primeira. */
  public bootQueue(): void {
    if (this.isBooted) return;
    for (const entry of this._pending) {
      const newScene = new entry.scene();
      newScene.sys.init(this.game);
      const key = newScene.sys.settings.key;
      this.keys[key] = newScene;
      this.scenes.push(newScene);
      if (this._data[key]) {
        newScene.sys.settings.data = this._data[key].data;
        if (this._data[key].autoStart) entry.autoStart = true;
      }
      if (entry.autoStart || newScene.sys.settings.active) this._start.push(key);
    }
    this._pending.length = 0;
    this.isBooted = true;
    for (const key of this._start) this.start(key);
    this._start.length = 0;
  }

  private processQueue(): void {
    if (this._queue.length === 0) return;
    for (let i = 0; i < this._queue.length; i++) {
      const entry = this._queue[i];
      // A ordem dos argumentos é `this[op](keyA, keyB, data)`, então o dado vai no keyB.
      (this[entry.op] as (a?: string, b?: unknown) => unknown).call(this, entry.keyA, entry.keyB);
    }
    this._queue.length = 0;
  }

  private bootScene(scene: Scene): void {
    const sys = scene.sys;
    const settings = sys.settings;
    sys.sceneUpdate = NOOP;
    if (scene.init) {
      scene.init.call(scene, settings.data);
      settings.status = SceneStatus.INIT;
    }
    const loader = sys.load;
    loader.reset();
    if (scene.preload) {
      scene.preload.call(scene);
      settings.status = SceneStatus.LOADING;
      loader.once('complete', this.loadComplete, this);
      loader.start();
    } else {
      this.create(scene);
    }
  }

  private loadComplete(loader: LoaderPlugin): void {
    this.create(loader.scene);
  }

  public update(time: number, delta: number): void {
    this.processQueue();
    this.isProcessing = true;
    for (let i = this.scenes.length - 1; i >= 0; i--) {
      const sys = this.scenes[i].sys;
      if (sys.settings.status > SceneStatus.START && sys.settings.status <= SceneStatus.RUNNING) sys.step(time, delta);
    }
  }

  public render(renderer: Renderer): void {
    for (let i = 0; i < this.scenes.length; i++) {
      const sys = this.scenes[i].sys;
      if (sys.settings.visible && sys.settings.status >= SceneStatus.LOADING && sys.settings.status < SceneStatus.SLEEPING) {
        sys.render(renderer);
      }
    }
    this.isProcessing = false;
  }

  private create(scene: Scene): void {
    const sys = scene.sys;
    const settings = sys.settings;
    if (scene.create) {
      settings.status = SceneStatus.CREATING;
      scene.create.call(scene, settings.data);
      if (settings.status === SceneStatus.DESTROYED) return;
    }
    if (scene.update) sys.sceneUpdate = scene.update;
    settings.status = SceneStatus.RUNNING;
    sys.events.emit(SceneEvents.CREATE, scene);
  }

  public getScene(key: string | Scene): Scene | null {
    if (typeof key === 'string') return this.keys[key] ?? null;
    return this.scenes.indexOf(key) > -1 ? key : null;
  }

  public isActive(key: string): boolean | null {
    const scene = this.getScene(key);
    return scene ? scene.sys.isActive() : null;
  }

  public isPaused(key: string): boolean | null {
    const scene = this.getScene(key);
    return scene ? scene.sys.isPaused() : null;
  }

  public isVisible(key: string): boolean | null {
    const scene = this.getScene(key);
    return scene ? scene.sys.isVisible() : null;
  }

  public isSleeping(key: string): boolean | null {
    const scene = this.getScene(key);
    return scene ? scene.sys.isSleeping() : null;
  }

  public pause(key: string, data?: unknown): this {
    this.getScene(key)?.sys.pause(data);
    return this;
  }

  public resume(key: string, data?: unknown): this {
    this.getScene(key)?.sys.resume(data);
    return this;
  }

  public sleep(key: string, data?: unknown): this {
    const scene = this.getScene(key);
    if (scene && !scene.sys.isTransitioning()) scene.sys.sleep(data);
    return this;
  }

  public wake(key: string, data?: unknown): this {
    this.getScene(key)?.sys.wake(data);
    return this;
  }

  public run(key: string, data?: unknown): this {
    const scene = this.getScene(key);
    if (!scene) return this;
    if (scene.sys.isSleeping()) scene.sys.wake(data);
    else if (scene.sys.isPaused()) scene.sys.resume(data);
    else this.start(key, data);
    return this;
  }

  public start(key: string, data?: unknown): this {
    if (!this.isBooted) {
      this._data[key] = { autoStart: true, data };
      return this;
    }
    const scene = this.getScene(key);
    if (!scene) {
      console.warn(`Scene key not found: ${key}`);
      return this;
    }
    const sys = scene.sys;
    const status = sys.settings.status;
    if (status >= SceneStatus.START && status <= SceneStatus.CREATING) return this;
    if (status >= SceneStatus.RUNNING && status <= SceneStatus.SLEEPING) {
      sys.shutdown();
      sys.sceneUpdate = NOOP;
      sys.start(data);
    } else {
      sys.sceneUpdate = NOOP;
      sys.start(data);
    }
    this.bootScene(scene);
    return this;
  }

  public stop(key: string, data?: unknown): this {
    const scene = this.getScene(key);
    if (scene && !scene.sys.isTransitioning() && scene.sys.settings.status !== SceneStatus.SHUTDOWN) {
      scene.sys.load.off('complete', this.loadComplete, this);
      scene.sys.shutdown(data);
    }
    return this;
  }

  public getScenes(isActive = true, inReverse = false): Scene[] {
    const out: Scene[] = [];
    for (const scene of this.scenes) {
      if (scene && (!isActive || scene.sys.isActive())) out.push(scene);
    }
    return inReverse ? out.reverse() : out;
  }

  public queueOp(op: SceneOp, keyA?: string, keyB?: unknown): this {
    this._queue.push({ op, keyA, keyB });
    return this;
  }

  public getAt(index: number): Scene | undefined {
    return this.scenes[index];
  }

  public getIndex(key: string | Scene): number {
    const scene = this.getScene(key);
    return scene ? this.scenes.indexOf(scene) : -1;
  }

  public destroy(): void {
    for (let i = 0; i < this.scenes.length; i++) this.scenes[i].sys.destroy();
    this.scenes.length = 0;
    for (const k of Object.keys(this.keys)) delete this.keys[k];
    this._queue.length = 0;
  }
}
