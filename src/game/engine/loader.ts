/**
 * O CARREGADOR (`this.load.image/spritesheet/json` no `preload` de uma cena) e o CACHE de JSON — o LoaderPlugin no
 * que o jogo usa: a fila começa no `start()` que o SceneManager chama depois do `preload`, cada arquivo
 * vai para o cache assim que termina, o `progress` é a fração de arquivos prontos e o `complete` sai quando a fila
 * esvazia — e só então o SceneManager roda o `create` da cena.
 * Parte do motor próprio (src/game/engine); licenças em LICENSES.md.
 */
import { EventEmitter } from './events';
import { SceneEvents } from './constants';
import type { Scene, Systems } from './scene';

class BaseCache {
  private readonly entries = new Map<string, unknown>();
  public add(key: string, data: unknown): this { this.entries.set(key, data); return this; }
  public has(key: string): boolean { return this.entries.has(key); }
  public exists(key: string): boolean { return this.entries.has(key); }
  public get<T>(key: string): T { return this.entries.get(key) as T; }
  public remove(key: string): this { this.entries.delete(key); return this; }
  public getKeys(): string[] { return [...this.entries.keys()]; }
  public destroy(): void { this.entries.clear(); }
}

export class CacheManager {
  public readonly json = new BaseCache();
  public readonly text = new BaseCache();
  public readonly binary = new BaseCache();
}

const LOADER_IDLE = 0;
const LOADER_LOADING = 1;
const LOADER_COMPLETE = 5;
const LOADER_SHUTDOWN = 6;

type FileType = 'image' | 'spritesheet' | 'json';

interface LoaderFile {
  readonly type: FileType;
  readonly key: string;
  readonly url: string;
  readonly config?: { frameWidth: number; frameHeight?: number };
  data?: unknown;
}

export class LoaderPlugin extends EventEmitter {
  public readonly scene: Scene;
  public path = '';
  public baseURL = '';
  public progress = 0;
  public totalToLoad = 0;
  public totalComplete = 0;
  public totalFailed = 0;
  public state = LOADER_IDLE;
  private readonly list = new Set<LoaderFile>();
  private readonly inflight = new Set<LoaderFile>();
  private readonly queue = new Set<LoaderFile>();

  public constructor(private readonly systems: Systems) {
    super();
    this.scene = systems.scene;
    systems.events.once(SceneEvents.BOOT, this.boot, this);
    systems.events.on(SceneEvents.START, this.pluginStart, this);
  }

  private boot(): void {
    this.systems.events.once(SceneEvents.DESTROY, this.destroy, this);
  }

  private pluginStart(): void {
    this.systems.events.once(SceneEvents.SHUTDOWN, this.shutdown, this);
  }

  private shutdown(): void {
    this.reset();
    this.state = LOADER_SHUTDOWN;
    this.removeAllListeners();
    this.systems.events.off(SceneEvents.UPDATE, this.update, this);
    this.systems.events.off(SceneEvents.SHUTDOWN, this.shutdown, this);
  }

  public setPath(path = ''): this {
    if (path !== '' && path.substr(-1) !== '/') path = path.concat('/');
    this.path = path;
    return this;
  }

  public setBaseURL(url = ''): this {
    if (url !== '' && url.substr(-1) !== '/') url = url.concat('/');
    this.baseURL = url;
    return this;
  }

  public isLoading(): boolean {
    return this.state === LOADER_LOADING;
  }

  public isReady(): boolean {
    return this.state === LOADER_IDLE || this.state === LOADER_COMPLETE;
  }

  public get loaderShutdown(): boolean {
    return this.state === LOADER_SHUTDOWN;
  }

  public reset(): void {
    this.list.clear();
    this.inflight.clear();
    this.queue.clear();
    this.setBaseURL('');
    this.setPath('');
    this.state = LOADER_IDLE;
  }

  public image(key: string, url: string): this {
    return this.addFile({ type: 'image', key, url });
  }

  public spritesheet(key: string, url: string, config: { frameWidth: number; frameHeight?: number }): this {
    return this.addFile({ type: 'spritesheet', key, url, config });
  }

  public json(key: string, url: string): this {
    return this.addFile({ type: 'json', key, url });
  }

  private hasCacheConflict(file: LoaderFile): boolean {
    if (file.type === 'json') return this.systems.cache.json.exists(file.key);
    return this.systems.textures.exists(file.key);
  }

  private keyExists(file: LoaderFile): boolean {
    if (this.hasCacheConflict(file)) return true;
    for (const set of [this.list, this.inflight, this.queue]) {
      for (const f of set) if (f.key === file.key && f.type === file.type) return true;
    }
    return false;
  }

  private addFile(file: LoaderFile): this {
    const resolved = { ...file, url: this.resolveUrl(file.url) };
    if (!this.keyExists(resolved)) {
      this.list.add(resolved);
      this.emit('addfile', resolved.key, resolved.type, this, resolved);
      if (this.isLoading()) {
        this.totalToLoad++;
        this.updateProgress();
      }
    }
    return this;
  }

  private resolveUrl(url: string): string {
    if (/^(?:blob:|data:|capacitor:\/\/|http:\/\/|https:\/\/|\/\/)/.test(url)) return url;
    return this.baseURL + this.path + url;
  }

  public start(): void {
    if (!this.isReady()) return;
    this.progress = 0;
    this.totalFailed = 0;
    this.totalComplete = 0;
    this.totalToLoad = this.list.size;
    this.emit('start', this);
    if (this.list.size === 0) {
      this.loadComplete();
    } else {
      this.state = LOADER_LOADING;
      this.inflight.clear();
      this.queue.clear();
      this.updateProgress();
      this.checkLoadQueue();
      this.systems.events.on(SceneEvents.UPDATE, this.update, this);
    }
  }

  private updateProgress(): void {
    this.progress = 1 - ((this.list.size + this.inflight.size) / this.totalToLoad);
    this.emit('progress', this.progress);
  }

  /** Quantos arquivos baixam de uma vez (menos no Android). */
  private get maxParallel(): number {
    return this.systems.game.host.page?.android ? 6 : 32;
  }

  private update(): void {
    if (this.state === LOADER_LOADING && this.list.size > 0 && this.inflight.size < this.maxParallel) this.checkLoadQueue();
  }

  private checkLoadQueue(): void {
    const maxParallel = this.maxParallel;
    for (const file of [...this.list]) {
      if (this.inflight.size >= maxParallel) break;
      this.inflight.add(file);
      this.list.delete(file);
      this.loadFile(file);
    }
  }

  private loadFile(file: LoaderFile): void {
    const host = this.systems.game.host;
    if (file.type === 'json') {
      host.fetchText(file.url)
        .then((text) => {
          file.data = JSON.parse(text);
          this.nextFile(file, true);
        })
        .catch(() => this.nextFile(file, false));
      return;
    }
    host.loadImage(file.url, (image) => {
      file.data = image;
      this.nextFile(file, true);
    }, () => this.nextFile(file, false));
  }

  private nextFile(file: LoaderFile, success: boolean): void {
    if (!this.inflight.has(file)) return;
    this.inflight.delete(file);
    this.updateProgress();
    if (success) {
      this.totalComplete++;
      this.queue.add(file);
      this.emit('load', file);
      this.addToCache(file);
    } else {
      this.totalFailed++;
      console.error(`Failed to process file: ${file.type} "${file.key}"`);
      this.emit('loaderror', file);
    }
    this.queue.delete(file);
    if (this.list.size === 0 && this.inflight.size === 0 && this.queue.size === 0) this.loadComplete();
  }

  private addToCache(file: LoaderFile): void {
    const textures = this.systems.textures;
    if (file.type === 'json') this.systems.cache.json.add(file.key, file.data);
    else if (file.type === 'spritesheet') textures.addSpriteSheet(file.key, file.data as HTMLImageElement, file.config!);
    else textures.addImage(file.key, file.data as HTMLImageElement);
  }

  private loadComplete(): void {
    this.emit('postprocess', this);
    this.list.clear();
    this.inflight.clear();
    this.queue.clear();
    this.progress = 1;
    this.state = LOADER_COMPLETE;
    this.systems.events.off(SceneEvents.UPDATE, this.update, this);
    this.emit('complete', this, this.totalComplete, this.totalFailed);
  }

  private destroy(): void {
    this.removeAllListeners();
    this.list.clear();
    this.inflight.clear();
    this.queue.clear();
  }
}
