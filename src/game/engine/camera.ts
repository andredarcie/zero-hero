/**
 * A CÂMERA 2D e o gerenciador de câmeras — a Camera e o CameraManager no que o jogo usa:
 * rolagem e zoom (o editor), viewport, cor de fundo, limites, `centerOn`, e os efeitos de escurecer/clarear
 * (`fadeIn/fadeOut`), clarão (`flash`) e tremor (`shake`). A matriz da câmera e o arredondamento dos pixels
 * seguem contas fixas, porque são elas que decidem em que pixel cada coisa cai.
 * Parte do motor próprio (src/game/engine); licenças em LICENSES.md.
 */
import { EventEmitter } from './events';
import { Clamp } from './math';
import { ScaleEvents, SceneEvents } from './constants';
import { Color, ValueToColor } from './color';
import { TransformMatrix } from './matrix';
import type { Systems, Scene, DisplayList } from './scene';
import type { GameObject } from './gameobjects/GameObject';
import type { Renderer } from './renderer';

export const CameraEvents = {
  DESTROY: 'cameradestroy',
  FADE_IN_COMPLETE: 'camerafadeincomplete',
  FADE_IN_START: 'camerafadeinstart',
  FADE_OUT_COMPLETE: 'camerafadeoutcomplete',
  FADE_OUT_START: 'camerafadeoutstart',
  FLASH_COMPLETE: 'cameraflashcomplete',
  FLASH_START: 'cameraflashstart',
  PRE_RENDER: 'prerender',
  POST_RENDER: 'postrender',
  SHAKE_COMPLETE: 'camerashakecomplete',
  SHAKE_START: 'camerashakestart',
} as const;

type FxCallback = ((camera: Camera, progress: number) => void) | null;

class FadeEffect {
  public isRunning = false;
  public isComplete = false;
  public direction = true;
  public duration = 0;
  public red = 0;
  public green = 0;
  public blue = 0;
  public alpha = 0;
  public progress = 0;
  private _elapsed = 0;
  private _onUpdate: FxCallback = null;
  private _onUpdateScope: unknown = null;

  public constructor(private readonly camera: Camera) {}

  public start(direction = true, duration = 1000, red = 0, green = 0, blue = 0, force = false, callback: FxCallback = null, context: unknown = this.camera.scene): Camera {
    if (!force && this.isRunning) return this.camera;
    this.isRunning = true;
    this.isComplete = false;
    this.duration = duration;
    this.direction = direction;
    this.progress = 0;
    this.red = red;
    this.green = green;
    this.blue = blue;
    this.alpha = direction ? Number.MIN_VALUE : 1;
    this._elapsed = 0;
    this._onUpdate = callback;
    this._onUpdateScope = context;
    this.camera.emit(direction ? CameraEvents.FADE_OUT_START : CameraEvents.FADE_IN_START, this.camera, this, duration, red, green, blue);
    return this.camera;
  }

  public update(_time: number, delta: number): void {
    if (!this.isRunning) return;
    this._elapsed += delta;
    this.progress = Clamp(this._elapsed / this.duration, 0, 1);
    if (this._onUpdate) this._onUpdate.call(this._onUpdateScope, this.camera, this.progress);
    if (this._elapsed < this.duration) {
      this.alpha = this.direction ? this.progress : 1 - this.progress;
    } else {
      this.alpha = this.direction ? 1 : 0;
      this.effectComplete();
    }
  }

  private effectComplete(): void {
    this._onUpdate = null;
    this._onUpdateScope = null;
    this.isRunning = false;
    this.isComplete = true;
    this.camera.emit(this.direction ? CameraEvents.FADE_OUT_COMPLETE : CameraEvents.FADE_IN_COMPLETE, this.camera, this);
  }

  public reset(): void {
    this.isRunning = false;
    this.isComplete = false;
    this._onUpdate = null;
    this._onUpdateScope = null;
  }
}

class FlashEffect {
  public isRunning = false;
  public duration = 0;
  public red = 0;
  public green = 0;
  public blue = 0;
  public alpha = 1;
  public progress = 0;
  private _alpha = 1;
  private _elapsed = 0;
  private _onUpdate: FxCallback = null;
  private _onUpdateScope: unknown = null;

  public constructor(private readonly camera: Camera) {}

  public start(duration = 250, red = 255, green = 255, blue = 255, force = false, callback: FxCallback = null, context: unknown = this.camera.scene): Camera {
    if (!force && this.isRunning) return this.camera;
    this.isRunning = true;
    this.duration = duration;
    this.progress = 0;
    this.red = red;
    this.green = green;
    this.blue = blue;
    this._alpha = this.alpha;
    this._elapsed = 0;
    this._onUpdate = callback;
    this._onUpdateScope = context;
    this.camera.emit(CameraEvents.FLASH_START, this.camera, this, duration, red, green, blue);
    return this.camera;
  }

  public update(_time: number, delta: number): void {
    if (!this.isRunning) return;
    this._elapsed += delta;
    this.progress = Clamp(this._elapsed / this.duration, 0, 1);
    if (this._onUpdate) this._onUpdate.call(this._onUpdateScope, this.camera, this.progress);
    if (this._elapsed < this.duration) this.alpha = this._alpha * (1 - this.progress);
    else this.effectComplete();
  }

  private effectComplete(): void {
    this.alpha = this._alpha;
    this._onUpdate = null;
    this._onUpdateScope = null;
    this.isRunning = false;
    this.camera.emit(CameraEvents.FLASH_COMPLETE, this.camera, this);
  }

  public reset(): void {
    this.isRunning = false;
    this._onUpdate = null;
    this._onUpdateScope = null;
  }
}

class ShakeEffect {
  public isRunning = false;
  public duration = 0;
  public readonly intensity = { x: 0, y: 0 };
  public progress = 0;
  private _elapsed = 0;
  private _offsetX = 0;
  private _offsetY = 0;
  private _onUpdate: FxCallback = null;
  private _onUpdateScope: unknown = null;

  public constructor(private readonly camera: Camera) {}

  public start(duration = 100, intensity: number | { x: number; y: number } = 0.05, force = false, callback: FxCallback = null, context: unknown = this.camera.scene): Camera {
    if (!force && this.isRunning) return this.camera;
    this.isRunning = true;
    this.duration = duration;
    this.progress = 0;
    if (typeof intensity === 'number') {
      this.intensity.x = intensity;
      this.intensity.y = intensity;
    } else {
      this.intensity.x = intensity.x;
      this.intensity.y = intensity.y;
    }
    this._elapsed = 0;
    this._offsetX = 0;
    this._offsetY = 0;
    this._onUpdate = callback;
    this._onUpdateScope = context;
    this.camera.emit(CameraEvents.SHAKE_START, this.camera, this, duration, intensity);
    return this.camera;
  }

  public preRender(): void {
    if (this.isRunning) this.camera.matrix.translate(this._offsetX, this._offsetY);
  }

  public update(_time: number, delta: number): void {
    if (!this.isRunning) return;
    this._elapsed += delta;
    this.progress = Clamp(this._elapsed / this.duration, 0, 1);
    if (this._onUpdate) this._onUpdate.call(this._onUpdateScope, this.camera, this.progress);
    if (this._elapsed < this.duration) {
      const intensity = this.intensity;
      const width = this.camera.width;
      const height = this.camera.height;
      const zoom = this.camera.zoom;
      this._offsetX = (Math.random() * intensity.x * width * 2 - intensity.x * width) * zoom;
      this._offsetY = (Math.random() * intensity.y * height * 2 - intensity.y * height) * zoom;
      if (this.camera.roundPixels) {
        this._offsetX = Math.round(this._offsetX);
        this._offsetY = Math.round(this._offsetY);
      }
    } else {
      this.effectComplete();
    }
  }

  private effectComplete(): void {
    this._offsetX = 0;
    this._offsetY = 0;
    this._onUpdate = null;
    this._onUpdateScope = null;
    this.isRunning = false;
    this.camera.emit(CameraEvents.SHAKE_COMPLETE, this.camera, this);
  }

  public reset(): void {
    this.isRunning = false;
    this._offsetX = 0;
    this._offsetY = 0;
    this._onUpdate = null;
    this._onUpdateScope = null;
  }
}

/**
 * O PONTO DO MUNDO debaixo de um ponto da tela: a inversa da matriz da câmera, mais a rolagem girada e escalada pelo
 * zoom. Matriz sem inversa (zoom zero) devolve o ponto como veio. Conta fixa: é a do getWorldPoint de sempre.
 */
const worldPointOf = (
  m: ArrayLike<number>, rotation: number, scrollX: number, scrollY: number, zoomX: number, zoomY: number,
  x: number, y: number, output: { x: number; y: number },
): { x: number; y: number } => {
  const mva = m[0];
  const mvb = m[1];
  const mvc = m[2];
  const mvd = m[3];
  const mve = m[4];
  const mvf = m[5];
  let determinant = (mva * mvd) - (mvb * mvc);
  if (!determinant) {
    output.x = x;
    output.y = y;
    return output;
  }
  determinant = 1 / determinant;
  const ima = mvd * determinant;
  const imb = -mvb * determinant;
  const imc = -mvc * determinant;
  const imd = mva * determinant;
  const ime = (mvc * mvf - mvd * mve) * determinant;
  const imf = (mvb * mve - mva * mvf) * determinant;
  const c = Math.cos(rotation);
  const s = Math.sin(rotation);
  const sx = x + ((scrollX * c - scrollY * s) * zoomX);
  const sy = y + ((scrollX * s + scrollY * c) * zoomY);
  output.x = (sx * ima + sy * imc) + ime;
  output.y = (sx * imb + sy * imd) + imf;
  return output;
};

/**
 * A CÂMERA SEM OS EFEITOS (a BaseCamera): a janela na tela, a rolagem e o zoom, os limites, o centrar, o ponto do
 * mundo sob um ponto da tela, e o preRender que monta a matriz. Os efeitos (fade, flash, tremor) são da Camera.
 */
export class BaseCamera extends EventEmitter {
  public scene!: Scene;
  private sceneManager: { customViewports: number } | null = null;
  private scaleManager: { width: number; height: number } | null = null;
  public isSceneCamera = true;
  public id = 0;
  public name = '';
  public roundPixels = false;
  public renderRoundPixels = true;
  public visible = true;
  public alpha = 1;
  public inputEnabled = true;
  public useBounds = false;
  public dirty = true;
  public readonly worldView = { x: 0, y: 0, width: 0, height: 0 };
  public readonly midPoint: { x: number; y: number };
  public originX = 0.5;
  public originY = 0.5;
  public rotation = 0;
  public readonly matrix = new TransformMatrix();
  public backgroundColor: Color = ValueToColor('rgba(0,0,0,0)');
  public transparent = true;
  public renderList: GameObject[] = [];
  private _x: number;
  private _y: number;
  private _width: number;
  private _height: number;
  private _scrollX = 0;
  private _scrollY = 0;
  private _zoomX = 1;
  private _zoomY = 1;
  private _customViewport = false;
  private readonly _bounds = { x: 0, y: 0, width: 0, height: 0 };

  public constructor(x = 0, y = 0, width = 0, height = 0) {
    super();
    this._x = x;
    this._y = y;
    this._width = width;
    this._height = height;
    this.midPoint = { x: width / 2, y: height / 2 };
  }

  public setScene(scene: Scene, isSceneCamera = true): this {
    if (this.scene && this._customViewport && this.sceneManager) this.sceneManager.customViewports--;
    this.scene = scene;
    this.isSceneCamera = isSceneCamera;
    this.sceneManager = scene.sys.game.scene;
    this.scaleManager = scene.sys.scale;
    this.updateSystem();
    return this;
  }

  private updateSystem(): void {
    if (!this.scaleManager || !this.isSceneCamera) return;
    const custom = this._x !== 0 || this._y !== 0 || this.scaleManager.width !== this._width || this.scaleManager.height !== this._height;
    const sceneManager = this.sceneManager!;
    if (custom && !this._customViewport) sceneManager.customViewports++;
    else if (!custom && this._customViewport) sceneManager.customViewports--;
    this.dirty = true;
    this._customViewport = custom;
  }

  public get x(): number { return this._x; }
  public set x(value: number) { this._x = value; this.updateSystem(); }
  public get y(): number { return this._y; }
  public set y(value: number) { this._y = value; this.updateSystem(); }
  public get width(): number { return this._width; }
  public set width(value: number) { this._width = value; this.updateSystem(); }
  public get height(): number { return this._height; }
  public set height(value: number) { this._height = value; this.updateSystem(); }

  public get scrollX(): number { return this._scrollX; }
  public set scrollX(value: number) {
    if (value !== this._scrollX) {
      this._scrollX = value;
      this.dirty = true;
    }
  }

  public get scrollY(): number { return this._scrollY; }
  public set scrollY(value: number) {
    if (value !== this._scrollY) {
      this._scrollY = value;
      this.dirty = true;
    }
  }

  public get zoom(): number { return (this._zoomX + this._zoomY) / 2; }
  public set zoom(value: number) {
    this._zoomX = value;
    this._zoomY = value;
    this.dirty = true;
  }

  public get zoomX(): number { return this._zoomX; }
  public set zoomX(value: number) { this._zoomX = value; this.dirty = true; }
  public get zoomY(): number { return this._zoomY; }
  public set zoomY(value: number) { this._zoomY = value; this.dirty = true; }

  public get centerX(): number { return this.x + 0.5 * this.width; }
  public get centerY(): number { return this.y + 0.5 * this.height; }
  public get displayWidth(): number { return this.width / this.zoomX; }
  public get displayHeight(): number { return this.height / this.zoomY; }

  public setName(value = ''): this { this.name = value; return this; }
  public setRoundPixels(value: boolean): this { this.roundPixels = value; return this; }
  public setAlpha(value = 1): this { this.alpha = value; return this; }
  public setVisible(value: boolean): this { this.visible = value; return this; }

  public setViewport(x: number, y: number, width: number, height: number): this {
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
    return this;
  }

  public setSize(width: number, height = width): this {
    this.width = width;
    this.height = height;
    return this;
  }

  public setPosition(x: number, y = x): this {
    this.x = x;
    this.y = y;
    return this;
  }

  public setScroll(x: number, y = x): this {
    this.scrollX = x;
    this.scrollY = y;
    return this;
  }

  public setZoom(x = 1, y = x): this {
    if (x === 0) x = 0.001;
    if (y === 0) y = 0.001;
    this.zoomX = x;
    this.zoomY = y;
    return this;
  }

  public setBackgroundColor(color: string | number = 'rgba(0,0,0,0)'): this {
    this.backgroundColor = ValueToColor(color);
    this.transparent = this.backgroundColor.alpha === 0;
    return this;
  }

  public setBounds(x: number, y: number, width: number, height: number, centerOn = false): this {
    this._bounds.x = x;
    this._bounds.y = y;
    this._bounds.width = width;
    this._bounds.height = height;
    this.dirty = true;
    this.useBounds = true;
    if (centerOn) {
      this.centerToBounds();
    } else {
      this.scrollX = this.clampX(this.scrollX);
      this.scrollY = this.clampY(this.scrollY);
    }
    return this;
  }

  public removeBounds(): this {
    this.useBounds = false;
    this.dirty = true;
    this._bounds.x = 0;
    this._bounds.y = 0;
    this._bounds.width = 0;
    this._bounds.height = 0;
    return this;
  }

  public getBounds(): { x: number; y: number; width: number; height: number } {
    return { ...this._bounds };
  }

  public centerToBounds(): this {
    if (this.useBounds) {
      const b = this._bounds;
      const originX = this.width * 0.5;
      const originY = this.height * 0.5;
      this.midPoint.x = b.x + b.width / 2;
      this.midPoint.y = b.y + b.height / 2;
      this.scrollX = this.midPoint.x - originX;
      this.scrollY = this.midPoint.y - originY;
    }
    return this;
  }

  public centerOnX(x: number): this {
    const originX = this.width * 0.5;
    this.midPoint.x = x;
    this.scrollX = x - originX;
    if (this.useBounds) this.scrollX = this.clampX(this.scrollX);
    return this;
  }

  public centerOnY(y: number): this {
    const originY = this.height * 0.5;
    this.midPoint.y = y;
    this.scrollY = y - originY;
    if (this.useBounds) this.scrollY = this.clampY(this.scrollY);
    return this;
  }

  public centerOn(x: number, y: number): this {
    this.centerOnX(x);
    this.centerOnY(y);
    return this;
  }

  public clampX(x: number): number {
    const bounds = this._bounds;
    const dw = this.displayWidth;
    const bx = bounds.x + ((dw - this.width) / 2);
    const bw = Math.max(bx, bx + bounds.width - dw);
    if (x < bx) x = bx;
    else if (x > bw) x = bw;
    return x;
  }

  public clampY(y: number): number {
    const bounds = this._bounds;
    const dh = this.displayHeight;
    const by = bounds.y + ((dh - this.height) / 2);
    const bh = Math.max(by, by + bounds.height - dh);
    if (y < by) y = by;
    else if (y > bh) y = bh;
    return y;
  }

  /** O ponto do mundo debaixo do ponto (x, y) da tela (ver worldPointOf). */
  public getWorldPoint(x: number, y: number, output: { x: number; y: number } = { x: 0, y: 0 }): { x: number; y: number } {
    return worldPointOf(this.matrix.matrix, this.rotation, this.scrollX, this.scrollY, this.zoomX, this.zoomY, x, y, output);
  }

  public addToRenderList(child: GameObject): void {
    this.renderList.push(child);
  }

  /** O preRender da câmera: rolagem arredondada e a matriz da tela, conta fixa. */
  public preRender(): void {
    this.renderList.length = 0;
    const width = this.width;
    const height = this.height;
    const halfWidth = width * 0.5;
    const halfHeight = height * 0.5;
    const zoomX = this.zoomX;
    const zoomY = this.zoomY;
    this.renderRoundPixels = this.roundPixels && Number.isInteger(zoomX) && Number.isInteger(zoomY);
    const originX = width * this.originX;
    const originY = height * this.originY;
    let sx = this.scrollX;
    let sy = this.scrollY;
    if (this.roundPixels) {
      sx = Math.floor(sx);
      sy = Math.floor(sy);
    }
    if (this.useBounds) {
      sx = this.clampX(sx);
      sy = this.clampY(sy);
    }
    this.scrollX = sx;
    this.scrollY = sy;
    const midX = sx + halfWidth;
    const midY = sy + halfHeight;
    this.midPoint.x = midX;
    this.midPoint.y = midY;
    const displayWidth = Math.floor((width / zoomX) + 0.5);
    const displayHeight = Math.floor((height / zoomY) + 0.5);
    this.worldView.x = Math.floor((midX - (displayWidth / 2)) + 0.5);
    this.worldView.y = Math.floor((midY - (displayHeight / 2)) + 0.5);
    this.worldView.width = displayWidth;
    this.worldView.height = displayHeight;
    this.matrix.applyITRS(Math.floor(this.x + originX + 0.5), Math.floor(this.y + originY + 0.5), this.rotation, zoomX, zoomY);
    this.matrix.translate(-originX, -originY);
  }

  public destroy(): void {
    this.emit(CameraEvents.DESTROY, this);
    this.removeAllListeners();
    if (this._customViewport && this.sceneManager) this.sceneManager.customViewports--;
    this.renderList = [];
    this.sceneManager = null;
    this.scaleManager = null;
  }
}

/** A CÂMERA COM OS EFEITOS: o fade, o flash e o tremor, e o passo deles a cada quadro. */
export class Camera extends BaseCamera {
  public readonly fadeEffect = new FadeEffect(this);
  public readonly flashEffect = new FlashEffect(this);
  public readonly shakeEffect = new ShakeEffect(this);

  /** O preRender da base, e então o tremor (ele mexe na matriz que a base acabou de montar). */
  public override preRender(): void {
    super.preRender();
    this.shakeEffect.preRender();
  }

  public update(time: number, delta: number): void {
    if (this.visible) {
      this.shakeEffect.update(time, delta);
      this.flashEffect.update(time, delta);
      this.fadeEffect.update(time, delta);
    }
  }

  public fadeIn(duration?: number, red?: number, green?: number, blue?: number, callback?: FxCallback, context?: unknown): Camera {
    return this.fadeEffect.start(false, duration, red, green, blue, true, callback ?? null, context);
  }

  public fadeOut(duration?: number, red?: number, green?: number, blue?: number, callback?: FxCallback, context?: unknown): Camera {
    return this.fadeEffect.start(true, duration, red, green, blue, true, callback ?? null, context);
  }

  public flash(duration?: number, red?: number, green?: number, blue?: number, force?: boolean, callback?: FxCallback, context?: unknown): Camera {
    return this.flashEffect.start(duration, red, green, blue, force, callback ?? null, context);
  }

  public shake(duration?: number, intensity?: number | { x: number; y: number }, force?: boolean, callback?: FxCallback, context?: unknown): Camera {
    return this.shakeEffect.start(duration, intensity, force, callback ?? null, context);
  }

  public resetFX(): this {
    this.shakeEffect.reset();
    this.flashEffect.reset();
    this.fadeEffect.reset();
    return this;
  }

  public override destroy(): void {
    this.resetFX();
    super.destroy();
  }
}

export class CameraManager {
  public readonly roundPixels: boolean;
  public cameras: Camera[] = [];
  public main!: Camera;
  public default!: Camera;

  public constructor(private readonly systems: Systems) {
    this.roundPixels = systems.game.config.roundPixels;
    systems.events.once(SceneEvents.BOOT, this.boot, this);
    systems.events.on(SceneEvents.START, this.start, this);
  }

  private boot(): void {
    this.add();
    this.main = this.cameras[0];
    this.default = new Camera(0, 0, this.systems.scale.width, this.systems.scale.height).setScene(this.systems.scene);
    this.systems.game.scale.on(ScaleEvents.RESIZE, this.onResize, this);
    this.systems.events.once(SceneEvents.DESTROY, this.destroy, this);
  }

  private start(): void {
    if (!this.main) {
      this.add();
      this.main = this.cameras[0];
    }
    const ee = this.systems.events;
    ee.on(SceneEvents.UPDATE, this.update, this);
    ee.once(SceneEvents.SHUTDOWN, this.shutdown, this);
  }

  public add(x = 0, y = 0, width = this.systems.scale.width, height = this.systems.scale.height, makeMain = false, name = ''): Camera {
    const camera = new Camera(x, y, width, height);
    camera.setName(name);
    camera.setScene(this.systems.scene);
    camera.setRoundPixels(this.roundPixels);
    camera.id = this.getNextID();
    this.cameras.push(camera);
    if (makeMain) this.main = camera;
    return camera;
  }

  private update(time: number, delta: number): void {
    for (let i = 0; i < this.cameras.length; i++) this.cameras[i].update(time, delta);
  }

  /** Os objetos que a câmera desenha, na ordem da lista (o `willRender` decide). */
  public render(renderer: Renderer, displayList: DisplayList): void {
    for (const camera of this.cameras) {
      if (camera.visible && camera.alpha > 0) {
        camera.preRender();
        const visibleChildren = displayList.getChildren().filter((child) => child.willRender(camera));
        renderer.render(this.systems.scene, visibleChildren, camera);
      }
    }
  }

  /** As câmeras sob o ponteiro, a de cima primeiro (o RectangleContains: bordas inclusas). */
  public getCamerasBelowPointer(pointer: { x: number; y: number }): Camera[] {
    const output: Camera[] = [];
    const x = pointer.x;
    const y = pointer.y;
    for (const camera of this.cameras) {
      if (camera.visible && camera.inputEnabled && camera.width > 0 && camera.height > 0
        && camera.x <= x && camera.x + camera.width >= x && camera.y <= y && camera.y + camera.height >= y) {
        output.unshift(camera);
      }
    }
    return output;
  }

  private getNextID(): number {
    let testID = 1;
    for (let t = 0; t < 32; t++) {
      if (this.cameras.some((camera) => camera && camera.id === testID)) testID <<= 1;
      else return testID;
    }
    return 0;
  }

  private onResize(_gameSize: unknown, baseSize: { width: number; height: number }, _displaySize: unknown, previousWidth: number, previousHeight: number): void {
    for (const cam of this.cameras) {
      if (cam.x === 0 && cam.y === 0 && cam.width === previousWidth && cam.height === previousHeight) cam.setSize(baseSize.width, baseSize.height);
    }
  }

  private shutdown(): void {
    (this as { main: Camera | undefined }).main = undefined;
    for (const camera of this.cameras) camera.destroy();
    this.cameras = [];
    const ee = this.systems.events;
    ee.off(SceneEvents.UPDATE, this.update, this);
    ee.off(SceneEvents.SHUTDOWN, this.shutdown, this);
  }

  private destroy(): void {
    this.shutdown();
    this.default.destroy();
    this.systems.events.off(SceneEvents.START, this.start, this);
    this.systems.game.scale.off(ScaleEvents.RESIZE, this.onResize, this);
  }
}
