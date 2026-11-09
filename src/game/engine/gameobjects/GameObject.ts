/**
 * A BASE DE TODO OBJETO 2D — o GameObject com os componentes que todos têm: Transform (posição,
 * escala, ângulo, com a mesma volta de ângulo), Visible, Depth, BlendMode, ScrollFactor e o alfa único
 * (AlphaSingle). Os `renderFlags`: invisível, alfa 0, escala 0 ou quadro vazio não desenham.
 * Parte do motor próprio (src/game/engine); licenças em LICENSES.md.
 */
import { EventEmitter } from '../events';
import { Clamp, DEG_TO_RAD, RAD_TO_DEG, WrapDegrees, WrapRadians } from '../math';
import { BlendModes, SceneEvents } from '../constants';
import { TransformMatrix } from '../matrix';
import type { Scene, DisplayList } from '../scene';
import type { Camera } from '../camera';
import type { Renderer } from '../renderer';
import type { InteractiveObject } from '../input';
import type { Container } from './Container';

const RENDER_MASK = 15;
const FLAG_VISIBLE = 1;
const FLAG_ALPHA = 2;
const FLAG_SCALE = 4;

export class GameObject extends EventEmitter {
  public scene: Scene;
  public displayList: DisplayList | null = null;
  public readonly type: string;
  public state: number | string = 0;
  public parentContainer: Container | null | undefined = null;
  public name = '';
  public active = true;
  public renderFlags = RENDER_MASK;
  public cameraFilter = 0;
  public input: InteractiveObject | null | undefined = null;
  public ignoreDestroy = false;
  public width = 0;
  public height = 0;
  public x = 0;
  public y = 0;
  public z = 0;
  public w = 0;
  public scrollFactorX = 1;
  public scrollFactorY = 1;
  protected _scaleX = 1;
  protected _scaleY = 1;
  protected _rotation = 0;
  protected _visible = true;
  protected _depth = 0;
  protected _blendMode: number = BlendModes.NORMAL;
  protected _alpha = 1;

  public constructor(scene: Scene, type: string) {
    super();
    this.scene = scene;
    this.type = type;
    this.on(SceneEvents.ADDED_TO_SCENE, this.addedToScene, this);
    this.on(SceneEvents.REMOVED_FROM_SCENE, this.removedFromScene, this);
    scene.sys.queueDepthSort();
  }

  // ── A origem: quem não tem o componente Origin não desloca o acerto do ponteiro ──
  public get displayOriginX(): number { return 0; }
  public get displayOriginY(): number { return 0; }

  // ── Visible ──
  public get visible(): boolean { return this._visible; }
  public set visible(value: boolean) {
    if (value) {
      this._visible = true;
      this.renderFlags |= FLAG_VISIBLE;
    } else {
      this._visible = false;
      this.renderFlags &= ~FLAG_VISIBLE;
    }
  }

  public setVisible(value: boolean): this {
    this.visible = value;
    return this;
  }

  // ── Depth ──
  public get depth(): number { return this._depth; }
  public set depth(value: number) {
    if (this.displayList) this.displayList.queueDepthSort();
    this._depth = value;
  }

  public setDepth(value = 0): this {
    this.depth = value;
    return this;
  }

  // ── BlendMode ──
  public get blendMode(): number { return this._blendMode; }
  public set blendMode(value: number | string) {
    let v = typeof value === 'string' ? (BlendModes as Record<string, number>)[value] : value;
    v |= 0;
    if (v >= -1) this._blendMode = v;
  }

  public setBlendMode(value: number | string): this {
    this.blendMode = value;
    return this;
  }

  // ── ScrollFactor ──
  public setScrollFactor(x: number, y = x): this {
    this.scrollFactorX = x;
    this.scrollFactorY = y;
    return this;
  }

  // ── AlphaSingle (Image, Sprite e Text trocam pelo alfa de quatro cantos) ──
  public get alpha(): number { return this._alpha; }
  public set alpha(value: number) {
    const v = Clamp(value, 0, 1);
    this._alpha = v;
    if (v === 0) this.renderFlags &= ~FLAG_ALPHA;
    else this.renderFlags |= FLAG_ALPHA;
  }

  public setAlpha(value = 1, ..._corners: number[]): this {
    this.alpha = value;
    return this;
  }

  public clearAlpha(): this {
    return this.setAlpha(1);
  }

  // ── Transform ──
  public get scale(): number { return (this._scaleX + this._scaleY) / 2; }
  public set scale(value: number) {
    this._scaleX = value;
    this._scaleY = value;
    if (value === 0) this.renderFlags &= ~FLAG_SCALE;
    else this.renderFlags |= FLAG_SCALE;
  }

  public get scaleX(): number { return this._scaleX; }
  public set scaleX(value: number) {
    this._scaleX = value;
    if (value === 0) this.renderFlags &= ~FLAG_SCALE;
    else if (this._scaleY !== 0) this.renderFlags |= FLAG_SCALE;
  }

  public get scaleY(): number { return this._scaleY; }
  public set scaleY(value: number) {
    this._scaleY = value;
    if (value === 0) this.renderFlags &= ~FLAG_SCALE;
    else if (this._scaleX !== 0) this.renderFlags |= FLAG_SCALE;
  }

  public get angle(): number { return WrapDegrees(this._rotation * RAD_TO_DEG); }
  public set angle(value: number) { this.rotation = WrapDegrees(value) * DEG_TO_RAD; }

  public get rotation(): number { return this._rotation; }
  public set rotation(value: number) { this._rotation = WrapRadians(value); }

  public setPosition(x = 0, y = x, z = 0, w = 0): this {
    this.x = x;
    this.y = y;
    this.z = z;
    this.w = w;
    return this;
  }

  public setX(value = 0): this { this.x = value; return this; }
  public setY(value = 0): this { this.y = value; return this; }
  public setZ(value = 0): this { this.z = value; return this; }

  public setScale(x = 1, y = x): this {
    this.scaleX = x;
    this.scaleY = y;
    return this;
  }

  public setRotation(radians = 0): this {
    this.rotation = radians;
    return this;
  }

  public setAngle(degrees = 0): this {
    this.angle = degrees;
    return this;
  }

  public getLocalTransformMatrix(tempMatrix: TransformMatrix = new TransformMatrix()): TransformMatrix {
    return tempMatrix.applyITRS(this.x, this.y, this._rotation, this._scaleX, this._scaleY);
  }

  public getWorldTransformMatrix(tempMatrix: TransformMatrix = new TransformMatrix(), parentMatrix?: TransformMatrix): TransformMatrix {
    let parent = this.parentContainer;
    if (!parent) return this.getLocalTransformMatrix(tempMatrix);
    const pm = parentMatrix ?? new TransformMatrix();
    tempMatrix.applyITRS(this.x, this.y, this._rotation, this._scaleX, this._scaleY);
    while (parent) {
      pm.applyITRS(parent.x, parent.y, parent._rotation, parent._scaleX, parent._scaleY);
      pm.multiply(tempMatrix, tempMatrix);
      parent = parent.parentContainer;
    }
    return tempMatrix;
  }

  // ── GameObject ──
  public setActive(value: boolean): this {
    this.active = value;
    return this;
  }

  public setName(value: string): this {
    this.name = value;
    return this;
  }

  public setState(value: number | string): this {
    this.state = value;
    return this;
  }

  public setInteractive(hitArea?: unknown): this {
    this.scene.sys.input.enable(this, hitArea);
    return this;
  }

  public disableInteractive(resetCursor = false): this {
    this.scene.sys.input.disable(this, resetCursor);
    return this;
  }

  public removeInteractive(resetCursor = false): this {
    this.scene.sys.input.clear(this);
    if (resetCursor) this.scene.sys.input.resetCursor();
    this.input = undefined;
    return this;
  }

  public addedToScene(): void {
    // ganchos de quem precisa (Sprite, emissor de partículas)
  }

  public removedFromScene(): void {
    // ganchos de quem precisa
  }

  public addToDisplayList(displayList: DisplayList = this.scene.sys.displayList): this {
    if (this.displayList && this.displayList !== displayList) this.removeFromDisplayList();
    if (!displayList.exists(this)) {
      this.displayList = displayList;
      displayList.add(this, true);
      displayList.queueDepthSort();
      this.emit(SceneEvents.ADDED_TO_SCENE, this, this.scene);
      displayList.events.emit(SceneEvents.ADDED_TO_SCENE, this, this.scene);
    }
    return this;
  }

  public removeFromDisplayList(): this {
    const displayList = this.displayList || this.scene?.sys.displayList;
    if (displayList && displayList.exists(this)) {
      displayList.remove(this, true);
      displayList.queueDepthSort();
      this.displayList = null;
      this.emit(SceneEvents.REMOVED_FROM_SCENE, this, this.scene);
      displayList.events.emit(SceneEvents.REMOVED_FROM_SCENE, this, this.scene);
    }
    return this;
  }

  public addToUpdateList(): this {
    const self = this as unknown as { preUpdate?: unknown };
    if (this.scene && self.preUpdate) this.scene.sys.updateList.add(this as never);
    return this;
  }

  public removeFromUpdateList(): this {
    const self = this as unknown as { preUpdate?: unknown };
    if (this.scene && self.preUpdate) this.scene.sys.updateList.remove(this as never);
    return this;
  }

  public willRender(camera: Camera): boolean {
    return !(RENDER_MASK !== this.renderFlags || (this.cameraFilter !== 0 && (this.cameraFilter & camera.id)));
  }

  /** O desenho WebGL do objeto; cada tipo põe o seu. */
  public renderWebGL(_renderer: Renderer, _src: GameObject, _camera: Camera, _parentMatrix?: TransformMatrix): void {
    // nada a desenhar
  }

  protected preDestroy(): void {
    // cada tipo solta o que é dele
  }

  public destroy(fromScene = false): void {
    if (!this.scene || this.ignoreDestroy) return;
    this.preDestroy();
    this.emit(SceneEvents.DESTROY, this, fromScene);
    this.removeAllListeners();
    this.removeFromDisplayList();
    this.removeFromUpdateList();
    if (this.input) {
      this.scene.sys.input.clear(this);
      this.input = undefined;
    }
    this.active = false;
    this.visible = false;
    (this as { scene: Scene | undefined }).scene = undefined;
    this.parentContainer = undefined;
  }
}

/** O componente Origin (posição do ponto de apoio em fração do tamanho). */
export class OriginGameObject extends GameObject {
  public originX = 0.5;
  public originY = 0.5;
  protected _displayOriginX = 0;
  protected _displayOriginY = 0;

  public override get displayOriginX(): number { return this._displayOriginX; }
  public override set displayOriginX(value: number) {
    this._displayOriginX = value;
    this.originX = value / this.width;
  }

  public override get displayOriginY(): number { return this._displayOriginY; }
  public override set displayOriginY(value: number) {
    this._displayOriginY = value;
    this.originY = value / this.height;
  }

  public setOrigin(x = 0.5, y = x): this {
    this.originX = x;
    this.originY = y;
    return this.updateDisplayOrigin();
  }

  public setDisplayOrigin(x = 0, y = x): this {
    this.displayOriginX = x;
    this.displayOriginY = y;
    return this;
  }

  public updateDisplayOrigin(): this {
    this._displayOriginX = this.originX * this.width;
    this._displayOriginY = this.originY * this.height;
    return this;
  }
}

/** O alfa de quatro cantos, a tinta e o espelho (Image, Sprite e Text). */
export class QuadGameObject extends OriginGameObject {
  public _alphaTL = 1;
  public _alphaTR = 1;
  public _alphaBL = 1;
  public _alphaBR = 1;
  public tintTopLeft = 0xffffff;
  public tintTopRight = 0xffffff;
  public tintBottomLeft = 0xffffff;
  public tintBottomRight = 0xffffff;
  public tintFill = false;
  public flipX = false;
  public flipY = false;

  public override get alpha(): number { return this._alpha; }
  public override set alpha(value: number) {
    const v = Clamp(value, 0, 1);
    this._alpha = v;
    this._alphaTL = v;
    this._alphaTR = v;
    this._alphaBL = v;
    this._alphaBR = v;
    if (v === 0) this.renderFlags &= ~FLAG_ALPHA;
    else this.renderFlags |= FLAG_ALPHA;
  }

  public get alphaTopLeft(): number { return this._alphaTL; }
  public set alphaTopLeft(value: number) {
    const v = Clamp(value, 0, 1);
    this._alphaTL = v;
    if (v !== 0) this.renderFlags |= FLAG_ALPHA;
  }

  public get alphaTopRight(): number { return this._alphaTR; }
  public set alphaTopRight(value: number) {
    const v = Clamp(value, 0, 1);
    this._alphaTR = v;
    if (v !== 0) this.renderFlags |= FLAG_ALPHA;
  }

  public get alphaBottomLeft(): number { return this._alphaBL; }
  public set alphaBottomLeft(value: number) {
    const v = Clamp(value, 0, 1);
    this._alphaBL = v;
    if (v !== 0) this.renderFlags |= FLAG_ALPHA;
  }

  public get alphaBottomRight(): number { return this._alphaBR; }
  public set alphaBottomRight(value: number) {
    const v = Clamp(value, 0, 1);
    this._alphaBR = v;
    if (v !== 0) this.renderFlags |= FLAG_ALPHA;
  }

  public override setAlpha(topLeft = 1, topRight?: number, bottomLeft?: number, bottomRight?: number): this {
    if (topRight === undefined) {
      this.alpha = topLeft;
    } else {
      this._alphaTL = Clamp(topLeft, 0, 1);
      this._alphaTR = Clamp(topRight, 0, 1);
      this._alphaBL = Clamp(bottomLeft ?? 1, 0, 1);
      this._alphaBR = Clamp(bottomRight ?? 1, 0, 1);
    }
    return this;
  }

  public get tint(): number { return this.tintTopLeft; }
  public set tint(value: number) { this.setTint(value, value, value, value); }

  public get isTinted(): boolean {
    const white = 0xffffff;
    return this.tintFill || this.tintTopLeft !== white || this.tintTopRight !== white || this.tintBottomLeft !== white || this.tintBottomRight !== white;
  }

  public setTint(topLeft = 0xffffff, topRight?: number, bottomLeft?: number, bottomRight?: number): this {
    if (topRight === undefined) {
      topRight = topLeft;
      bottomLeft = topLeft;
      bottomRight = topLeft;
    }
    this.tintTopLeft = topLeft;
    this.tintTopRight = topRight;
    this.tintBottomLeft = bottomLeft ?? topLeft;
    this.tintBottomRight = bottomRight ?? topLeft;
    this.tintFill = false;
    return this;
  }

  public setTintFill(topLeft?: number, topRight?: number, bottomLeft?: number, bottomRight?: number): this {
    this.setTint(topLeft, topRight, bottomLeft, bottomRight);
    this.tintFill = true;
    return this;
  }

  public clearTint(): this {
    this.setTint(0xffffff);
    return this;
  }

  public setFlipX(value: boolean): this { this.flipX = value; return this; }
  public setFlipY(value: boolean): this { this.flipY = value; return this; }
  public setFlip(x: boolean, y: boolean): this { this.flipX = x; this.flipY = y; return this; }
  public toggleFlipX(): this { this.flipX = !this.flipX; return this; }
  public toggleFlipY(): this { this.flipY = !this.flipY; return this; }
  public resetFlip(): this { this.flipX = false; this.flipY = false; return this; }
}
