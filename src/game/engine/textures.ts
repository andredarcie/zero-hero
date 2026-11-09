/**
 * AS TEXTURAS — o TextureManager, a Texture, o Frame, a TextureSource e a CanvasTexture: a mesma
 * tabela de chaves, os mesmos quadros (o `__BASE` e os de folha de sprite, com o mesmo corte), e a mesma subida
 * para a GPU (canvas e imagem com alfa pré-multiplicado, NEAREST no jogo em pixel art, REPEAT + mipmap em textura
 * de lado potência de dois) — é ela que decide cada pixel amostrado no desenho 2D.
 * Parte do motor próprio (src/game/engine); licenças em LICENSES.md.
 */
import { EventEmitter } from './events';
import { FilterMode } from './constants';
import type { Game } from './game';
import type { GLTexture } from './renderer';
import { isCanvasSource, type EngineHost } from './host';

type Source = HTMLImageElement | HTMLCanvasElement;

export const isSizePowerOfTwo = (width: number, height: number): boolean =>
  width > 0 && (width & (width - 1)) === 0 && height > 0 && (height & (height - 1)) === 0;

/**
 * Um canvas 2D como o CanvasPool os cria: o PRIMEIRO contexto pedido decide onde o canvas mora (GPU,
 * sem `willReadFrequently`) e, em pixel art, já nasce sem suavização. Quem pedir o contexto depois recebe este.
 */
export const createPoolCanvas = (host: EngineHost, width: number, height: number, disableSmoothing: boolean): HTMLCanvasElement => {
  const canvas = host.createCanvas(width, height);
  if (disableSmoothing) {
    const ctx = canvas.getContext('2d', { willReadFrequently: false });
    if (ctx) ctx.imageSmoothingEnabled = false;
  }
  return canvas;
};

export class TextureSource {
  public image: Source;
  public width: number;
  public height: number;
  public scaleMode: number = FilterMode.LINEAR;
  public readonly isCanvas: boolean;
  public isPowerOf2: boolean;
  public glTexture: GLTexture | null = null;
  public readonly resolution = 1;
  public readonly isRenderTexture = false;
  public readonly isGLTexture = false;

  public constructor(public readonly texture: Texture, public readonly source: Source, width?: number, height?: number) {
    this.image = source;
    this.width = width || (source as HTMLImageElement).naturalWidth || source.width || 0;
    this.height = height || (source as HTMLImageElement).naturalHeight || source.height || 0;
    this.isCanvas = isCanvasSource(source);
    this.isPowerOf2 = isSizePowerOfTwo(this.width, this.height);
    const game = texture.manager.game;
    const renderer = game.renderer;
    if (renderer) {
      this.glTexture = this.isCanvas
        ? renderer.glTextures.createCanvasTexture(source as HTMLCanvasElement)
        : renderer.glTextures.createTextureFromSource(source, this.width, this.height);
    }
    if (!game.config.antialias) this.setFilter(FilterMode.NEAREST);
  }

  public setFilter(filterMode: number): void {
    const renderer = this.texture.manager.game.renderer;
    if (renderer && this.glTexture) renderer.glTextures.setTextureFilter(this.glTexture, filterMode);
    this.scaleMode = filterMode;
  }

  /** O canvas mudou: sobe de novo. */
  public update(): void {
    const renderer = this.texture.manager.game.renderer;
    if (renderer && this.isCanvas && this.glTexture) renderer.glTextures.updateCanvasTexture(this.image as HTMLCanvasElement, this.glTexture);
  }

  public destroy(): void {
    const renderer = this.texture.manager.game.renderer;
    if (this.glTexture && renderer) renderer.glTextures.deleteTexture(this.glTexture);
    this.glTexture = null;
  }
}

export class Frame {
  public readonly source: TextureSource;
  public cutX = 0;
  public cutY = 0;
  public cutWidth = 0;
  public cutHeight = 0;
  public x = 0;
  public y = 0;
  public width = 0;
  public height = 0;
  public halfWidth = 0;
  public halfHeight = 0;
  public centerX = 0;
  public centerY = 0;
  public pivotX = 0;
  public pivotY = 0;
  public customPivot = false;
  public u0 = 0;
  public v0 = 0;
  public u1 = 0;
  public v1 = 0;
  private sourceW = 0;
  private sourceH = 0;
  public readonly canvasData = { x: 0, y: 0, width: 0, height: 0 };

  public constructor(public readonly texture: Texture, public readonly name: string | number, public readonly sourceIndex: number,
    x: number, y: number, width: number, height: number) {
    this.source = texture.source[sourceIndex];
    this.setSize(width, height, x, y);
  }

  public get realWidth(): number { return this.sourceW; }
  public get realHeight(): number { return this.sourceH; }
  public get glTexture(): GLTexture | null { return this.source.glTexture; }

  public setSize(width: number, height: number, x = 0, y = 0): this {
    this.cutX = x;
    this.cutY = y;
    this.cutWidth = width;
    this.cutHeight = height;
    this.width = width;
    this.height = height;
    this.halfWidth = Math.floor(width * 0.5);
    this.halfHeight = Math.floor(height * 0.5);
    this.centerX = Math.floor(width / 2);
    this.centerY = Math.floor(height / 2);
    this.sourceW = width;
    this.sourceH = height;
    this.canvasData.x = x;
    this.canvasData.y = y;
    return this.updateUVs();
  }

  public updateUVs(): this {
    const cx = this.cutX;
    const cy = this.cutY;
    const cw = this.cutWidth;
    const ch = this.cutHeight;
    this.canvasData.width = cw;
    this.canvasData.height = ch;
    const tw = this.source.width;
    const th = this.source.height;
    this.u0 = cx / tw;
    this.v0 = cy / th;
    this.u1 = (cx + cw) / tw;
    this.v1 = (cy + ch) / th;
    return this;
  }

  public destroy(): void {
    // nada: o quadro só aponta para a fonte
  }
}

export class Texture {
  public readonly source: TextureSource[] = [];
  public frames: Record<string, Frame> = {};
  public firstFrame: string | number = '__BASE';
  public frameTotal = 0;
  public readonly customData: Record<string, unknown> = {};

  public constructor(public readonly manager: TextureManager, public readonly key: string, source: Source, width?: number, height?: number) {
    this.source.push(new TextureSource(this, source, width, height));
  }

  public add(name: string | number, sourceIndex: number, x: number, y: number, width: number, height: number): Frame | null {
    if (this.has(name)) return null;
    const frame = new Frame(this, name, sourceIndex, x, y, width, height);
    this.frames[name] = frame;
    if (this.firstFrame === '__BASE') this.firstFrame = name;
    this.frameTotal++;
    return frame;
  }

  public has(name: string | number): boolean {
    return Object.prototype.hasOwnProperty.call(this.frames, name);
  }

  public get(name?: string | number | null): Frame {
    if (!name) name = this.firstFrame;
    let frame = this.frames[name];
    if (!frame) {
      console.warn('Frame "%s" not found in texture "%s"', name, this.key);
      frame = this.frames[this.firstFrame];
    }
    return frame;
  }

  public getFrameNames(includeBase = false): Array<string | number> {
    const out = Object.keys(this.frames).map((k) => (/^\d+$/.test(k) ? Number(k) : k));
    return includeBase ? out : out.filter((k) => k !== '__BASE');
  }

  public getSourceImage(name?: string | number | null): Source {
    if (name === undefined || name === null || this.frameTotal === 1) name = '__BASE';
    const frame = this.frames[name];
    if (frame) return frame.source.image;
    console.warn('Frame "%s" not found in texture "%s"', name, this.key);
    return this.frames.__BASE.source.image;
  }

  public setFilter(filterMode: number): this {
    for (const s of this.source) s.setFilter(filterMode);
    return this;
  }

  public destroy(): void {
    for (const s of this.source) s.destroy();
    this.source.length = 0;
    this.frames = {};
    this.manager.removeKey(this.key);
  }
}

/** A textura desenhável (`textures.createCanvas`/`addCanvas`): o canvas é a fonte, `refresh()` sobe de novo. */
export class CanvasTexture extends Texture {
  public readonly canvas: HTMLCanvasElement;
  public readonly context: CanvasRenderingContext2D;
  public width: number;
  public height: number;

  public constructor(manager: TextureManager, key: string, source: HTMLCanvasElement, width: number, height: number) {
    super(manager, key, source, width, height);
    this.add('__BASE', 0, 0, 0, width, height);
    this.canvas = source;
    // O mesmo contexto de sempre. Se o canvas já tinha contexto (o do CanvasPool, ou o de quem desenhou
    // nele), é ESSE que volta — e é nele que o jogo continua desenhando.
    this.context = source.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D;
    this.width = width;
    this.height = height;
    // Os pixels de todo canvas que vira textura são lidos (o `imageData` da CanvasTexture). A leitura fica: o
    // navegador pode decidir onde o canvas mora (GPU/CPU) pelas leituras, e é isso que decide como o texto e as
    // pinturas seguintes saem.
    if (width > 0 && height > 0 && this.context) this.context.getImageData(0, 0, width, height);
  }

  public refresh(): this {
    this.source[0].update();
    return this;
  }

  public getContext(): CanvasRenderingContext2D {
    return this.context;
  }

  public getCanvas(): HTMLCanvasElement {
    return this.canvas;
  }

  public clear(x = 0, y = 0, width = this.width, height = this.height, update = true): this {
    this.context.clearRect(x, y, width, height);
    if (update) this.refresh();
    return this;
  }

  public setSize(width: number, height = width): this {
    if (width !== this.width || height !== this.height) {
      this.canvas.width = width;
      this.canvas.height = height;
      const src = this.source[0];
      src.width = width;
      src.height = height;
      src.isPowerOf2 = isSizePowerOfTwo(width, height);
      this.frames.__BASE.setSize(width, height, 0, 0);
      this.width = width;
      this.height = height;
      this.refresh();
    }
    return this;
  }
}

const PNG_PREFIX = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAg';
const DEFAULT_IMAGE = `${PNG_PREFIX}AQMAAABJtOi3AAAAA1BMVEX///+nxBvIAAAAAXRSTlMAQObYZgAAABVJREFUeF7NwIEAAAAAgKD9qdeocAMAoAABm3DkcAAAAABJRU5ErkJggg==`;
const MISSING_IMAGE = `${PNG_PREFIX}CAIAAAD8GO2jAAAAGXRFWHRTb2Z0d2FyZQBBZG9iZSBJbWFnZVJlYWR5ccllPAAAAJ9JREFUeNq01ssOwyAMRFG46v//Mt1ESmgh+DFmE2GPOBARKb2NVjo+17PXLD8a1+pl5+A+wSgFygymWYHBb0FtsKhJDdZlncG2IzJ4ayoMDv20wTmSMzClEgbWYNTAkQ0Z+OJ+A/eWnAaR9+oxCF4Os0H8htsMUp+pwcgBBiMNnAwF8GqIgL2hAzaGFFgZauDPKABmowZ4GL369/0rwACp2yA/ttmvsQAAAABJRU5ErkJggg==`;
const WHITE_IMAGE = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAGXRFWHRTb2Z0d2FyZQBBZG9iZSBJbWFnZVJlYWR5ccllPAAAABdJREFUeNpi/P//PwMMMDEgAdwcgAADAJZuAwXJYZOzAAAAAElFTkSuQmCC';

export class TextureManager extends EventEmitter {
  public list: Record<string, Texture> = {};
  private _pending = 0;

  public constructor(public readonly game: Game) {
    super();
  }

  /** As três texturas de fábrica (vazia, faltando, branca), em base64: o READY sai quando as três carregam. */
  public boot(): void {
    this._pending = 3;
    this.on('onload', this.updatePending, this);
    this.on('onerror', this.updatePending, this);
    this.addBase64('__DEFAULT', DEFAULT_IMAGE);
    this.addBase64('__MISSING', MISSING_IMAGE);
    this.addBase64('__WHITE', WHITE_IMAGE);
  }

  private updatePending(): void {
    this._pending--;
    if (this._pending === 0) {
      this.off('onload');
      this.off('onerror');
      this.emit('ready');
    }
  }

  private checkKey(key: string): boolean {
    if (!key || typeof key !== 'string' || this.exists(key)) {
      console.error(`Texture key already in use: ${key}`);
      return false;
    }
    return true;
  }

  public removeKey(key: string): this {
    if (Object.prototype.hasOwnProperty.call(this.list, key)) delete this.list[key];
    return this;
  }

  public remove(key: string | Texture): this {
    let texture: Texture;
    if (typeof key === 'string') {
      if (!this.exists(key)) {
        console.warn(`No texture found matching key: ${key}`);
        return this;
      }
      texture = this.get(key);
    } else {
      texture = key;
    }
    if (Object.prototype.hasOwnProperty.call(this.list, texture.key)) {
      texture.destroy();
      this.emit('removetexture', texture.key);
    }
    return this;
  }

  public addBase64(key: string, data: string): this {
    if (this.checkKey(key)) {
      this.game.host.loadImage(data, (image) => {
        const texture = this.create(key, image);
        if (!texture) return;
        texture.add('__BASE', 0, 0, 0, texture.source[0].width, texture.source[0].height);
        this.emit('addtexture', key, texture);
        this.emit('onload', key, texture);
      }, () => { this.emit('onerror', key); });
    }
    return this;
  }

  public getBase64(key: string, frame?: string | number, type = 'image/png', encoderOptions = 0.92): string {
    const textureFrame = this.getFrame(key, frame);
    if (!textureFrame) return '';
    const cd = textureFrame.canvasData;
    const canvas = this.game.host.createCanvas(cd.width, cd.height);
    const ctx = canvas.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D;
    ctx.imageSmoothingEnabled = false;
    if (cd.width > 0 && cd.height > 0) {
      ctx.drawImage(textureFrame.source.image, cd.x, cd.y, cd.width, cd.height, 0, 0, cd.width, cd.height);
    }
    return canvas.toDataURL(type, encoderOptions);
  }

  public addImage(key: string, source: HTMLImageElement | HTMLCanvasElement): Texture | null {
    let texture: Texture | null = null;
    if (this.checkKey(key)) {
      texture = this.create(key, source);
      if (texture) {
        texture.add('__BASE', 0, 0, 0, texture.source[0].width, texture.source[0].height);
        this.emit('addtexture', key, texture);
      }
    }
    return texture;
  }

  public addCanvas(key: string, source: HTMLCanvasElement, skipCache = false): CanvasTexture | null {
    let texture: CanvasTexture | null = null;
    if (skipCache) {
      texture = new CanvasTexture(this, key, source, source.width, source.height);
    } else if (this.checkKey(key)) {
      texture = new CanvasTexture(this, key, source, source.width, source.height);
      this.list[key] = texture;
      this.emit('addtexture', key, texture);
    }
    return texture;
  }

  public createCanvas(key: string, width = 256, height = 256): CanvasTexture | null {
    if (this.checkKey(key)) return this.addCanvas(key, createPoolCanvas(this.game.host, width, height, !this.game.config.antialias));
    return null;
  }

  /** A folha de sprite: o `__BASE` e os quadros numerados, cortados pelo parser de folha. */
  public addSpriteSheet(key: string, source: HTMLImageElement, config: { frameWidth: number; frameHeight?: number; startFrame?: number; endFrame?: number; margin?: number; spacing?: number }): Texture | null {
    if (!this.checkKey(key)) return null;
    const texture = this.create(key, source);
    if (!texture) return null;
    const width = texture.source[0].width;
    const height = texture.source[0].height;
    const frameWidth = config.frameWidth;
    const frameHeight = config.frameHeight ?? frameWidth;
    texture.add('__BASE', 0, 0, 0, width, height);
    let startFrame = config.startFrame ?? 0;
    let endFrame = config.endFrame ?? -1;
    const margin = config.margin ?? 0;
    const spacing = config.spacing ?? 0;
    const row = Math.floor((width - margin + spacing) / (frameWidth + spacing));
    const column = Math.floor((height - margin + spacing) / (frameHeight + spacing));
    const total = row * column;
    if (total === 0) console.warn('SpriteSheet frame dimensions will result in zero frames for texture:', key);
    if (startFrame > total || startFrame < -total) startFrame = 0;
    if (startFrame < 0) startFrame = total + startFrame;
    if (endFrame === -1 || endFrame > total || endFrame < startFrame) endFrame = total;
    let fx = margin;
    let fy = margin;
    let c = 0;
    for (let i = 0; i < total; i++) {
      let ax = 0;
      let ay = 0;
      const w = fx + frameWidth;
      const h = fy + frameHeight;
      if (w > width) ax = w - width;
      if (h > height) ay = h - height;
      if (i >= startFrame && i <= endFrame) {
        texture.add(c, 0, fx, fy, frameWidth - ax, frameHeight - ay);
        c++;
      }
      fx += frameWidth + spacing;
      if (fx + frameWidth > width) {
        fx = margin;
        fy += frameHeight + spacing;
      }
    }
    this.emit('addtexture', key, texture);
    return texture;
  }

  public exists(key: string): boolean {
    return Object.prototype.hasOwnProperty.call(this.list, key);
  }

  public get(key: string | Texture | Frame = '__DEFAULT'): Texture {
    if (typeof key === 'string' && this.list[key]) return this.list[key];
    if (key instanceof Texture) return key;
    if (key instanceof Frame) return key.texture;
    return this.list.__MISSING;
  }

  /** O quadro, ou `undefined` se a textura não existe (o tipo diz Frame). */
  public getFrame(key: string, frame?: string | number | null): Frame {
    return this.list[key]?.get(frame) as Frame;
  }

  public getTextureKeys(): string[] {
    return Object.keys(this.list).filter((k) => k !== '__DEFAULT' && k !== '__MISSING' && k !== '__WHITE' && k !== '__NORMAL');
  }

  private create(key: string, source: Source, width?: number, height?: number): Texture | null {
    if (!this.checkKey(key)) return null;
    const texture = new Texture(this, key, source, width, height);
    this.list[key] = texture;
    return texture;
  }
}
