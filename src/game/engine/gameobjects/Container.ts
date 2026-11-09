/**
 * O CONTÊINER: leva filhos consigo — eles saem da lista da cena, herdam a transformação, o alfa e o
 * fator de rolagem do pai na hora de desenhar, na ordem em que entraram.
 * Parte do motor próprio (src/game/engine); licenças em LICENSES.md.
 */
import { GameObject } from './GameObject';
import { BlendModes, SceneEvents } from '../constants';
import { TransformMatrix } from '../matrix';
import type { Scene } from '../scene';
import type { Camera } from '../camera';
import type { Renderer } from '../renderer';

type Child = GameObject & { alphaTopLeft?: number; alphaTopRight?: number; alphaBottomLeft?: number; alphaBottomRight?: number };

export class Container extends GameObject {
  public list: Child[] = [];
  public readonly exclusive = true;
  public readonly localTransform = new TransformMatrix();

  public constructor(scene: Scene, x = 0, y = 0, children?: GameObject | GameObject[]) {
    super(scene, 'Container');
    this.setPosition(x, y);
    this.setBlendMode(BlendModes.SKIP_CHECK);
    if (children) this.add(children);
  }

  // ── ComputedSize ──
  public get displayWidth(): number { return this.scaleX * this.width; }
  public set displayWidth(value: number) { this.scaleX = value / this.width; }
  public get displayHeight(): number { return this.scaleY * this.height; }
  public set displayHeight(value: number) { this.scaleY = value / this.height; }

  public setSize(width: number, height: number): this {
    this.width = width;
    this.height = height;
    return this;
  }

  public setDisplaySize(width: number, height: number): this {
    this.displayWidth = width;
    this.displayHeight = height;
    return this;
  }

  private addHandler(gameObject: GameObject): void {
    gameObject.once(SceneEvents.DESTROY, this.onChildDestroyed, this);
    if (gameObject.parentContainer) gameObject.parentContainer.remove(gameObject);
    gameObject.parentContainer = this;
    gameObject.removeFromDisplayList();
    gameObject.addedToScene();
  }

  private removeHandler(gameObject: GameObject): void {
    // (sic) tira um ouvinte que nunca pôs (o `remove`, não o `onChildDestroyed`)
    gameObject.off(SceneEvents.DESTROY, this.remove as never, this);
    gameObject.parentContainer = null;
    gameObject.removedFromScene();
    gameObject.addToDisplayList();
  }

  private onChildDestroyed(gameObject: GameObject): void {
    const i = this.list.indexOf(gameObject);
    if (i > -1) this.list.splice(i, 1);
    gameObject.parentContainer = null;
    gameObject.removedFromScene();
  }

  public add(child: GameObject | GameObject[]): this {
    const items = Array.isArray(child) ? child : [child];
    for (const item of items) {
      if (this.list.indexOf(item) === -1) {
        this.list.push(item);
        this.addHandler(item);
      }
    }
    return this;
  }

  public addAt(child: GameObject | GameObject[], index = 0): this {
    const items = (Array.isArray(child) ? child : [child]).filter((c) => this.list.indexOf(c) === -1);
    this.list.splice(index, 0, ...items);
    for (const item of items) this.addHandler(item);
    return this;
  }

  public remove(child: GameObject | GameObject[], destroyChild = false): this {
    const items = Array.isArray(child) ? child : [child];
    const removed: GameObject[] = [];
    for (const item of items) {
      const i = this.list.indexOf(item);
      if (i > -1) {
        this.list.splice(i, 1);
        this.removeHandler(item);
        removed.push(item);
      }
    }
    if (destroyChild) for (const r of removed) r.destroy();
    return this;
  }

  public removeAll(destroyChild = false): this {
    const list = this.list;
    if (destroyChild) {
      for (let i = 0; i < list.length; i++) {
        if (list[i] && list[i].scene) {
          list[i].off(SceneEvents.DESTROY, this.onChildDestroyed, this);
          list[i].destroy();
        }
      }
      this.list = [];
    } else {
      const items = list.splice(0, list.length);
      for (const item of items) this.removeHandler(item);
    }
    return this;
  }

  public getAll(): GameObject[] { return this.list.slice(); }
  public getAt(index: number): GameObject | undefined { return this.list[index]; }
  public getIndex(child: GameObject): number { return this.list.indexOf(child); }
  public exists(child: GameObject): boolean { return this.list.indexOf(child) > -1; }
  public get length(): number { return this.list.length; }

  public override setScrollFactor(x: number, y = x, updateChildren = false): this {
    this.scrollFactorX = x;
    this.scrollFactorY = y;
    if (updateChildren) {
      for (const c of this.list) {
        c.scrollFactorX = x;
        c.scrollFactorY = y;
      }
    }
    return this;
  }

  protected override preDestroy(): void {
    this.removeAll(true);
    this.list = [];
  }

  public override renderWebGL(renderer: Renderer, _src: Container, camera: Camera, parentMatrix?: TransformMatrix): void {
    camera.addToRenderList(this);
    const children = this.list;
    const childCount = children.length;
    if (childCount === 0) return;
    const transformMatrix = this.localTransform;
    if (parentMatrix) {
      transformMatrix.loadIdentity();
      transformMatrix.multiply(parentMatrix);
      transformMatrix.translate(this.x, this.y);
      transformMatrix.rotate(this.rotation);
      transformMatrix.scale(this.scaleX, this.scaleY);
    } else {
      transformMatrix.applyITRS(this.x, this.y, this.rotation, this.scaleX, this.scaleY);
    }
    const containerHasBlendMode = this.blendMode !== -1;
    if (!containerHasBlendMode) renderer.setBlendMode(0);
    const alpha = this.alpha;
    const scrollFactorX = this.scrollFactorX;
    const scrollFactorY = this.scrollFactorY;
    for (let i = 0; i < childCount; i++) {
      const child = children[i];
      if (!child.willRender(camera)) continue;
      let childAlphaTopLeft: number;
      let childAlphaTopRight: number;
      let childAlphaBottomLeft: number;
      let childAlphaBottomRight: number;
      if (child.alphaTopLeft !== undefined) {
        childAlphaTopLeft = child.alphaTopLeft;
        childAlphaTopRight = child.alphaTopRight!;
        childAlphaBottomLeft = child.alphaBottomLeft!;
        childAlphaBottomRight = child.alphaBottomRight!;
      } else {
        const childAlpha = child.alpha;
        childAlphaTopLeft = childAlpha;
        childAlphaTopRight = childAlpha;
        childAlphaBottomLeft = childAlpha;
        childAlphaBottomRight = childAlpha;
      }
      const childScrollFactorX = child.scrollFactorX;
      const childScrollFactorY = child.scrollFactorY;
      if (!containerHasBlendMode && child.blendMode !== renderer.currentBlendMode) renderer.setBlendMode(child.blendMode);
      const type = child.type;
      if (type !== renderer.currentType) {
        renderer.newType = true;
        renderer.currentType = type;
      }
      renderer.nextTypeMatch = i < childCount - 1 ? children[i + 1].type === renderer.currentType : false;
      child.setScrollFactor(childScrollFactorX * scrollFactorX, childScrollFactorY * scrollFactorY);
      child.setAlpha(childAlphaTopLeft * alpha, childAlphaTopRight * alpha, childAlphaBottomLeft * alpha, childAlphaBottomRight * alpha);
      child.renderWebGL(renderer, child, camera, transformMatrix);
      child.setAlpha(childAlphaTopLeft, childAlphaTopRight, childAlphaBottomLeft, childAlphaBottomRight);
      child.setScrollFactor(childScrollFactorX, childScrollFactorY);
      renderer.newType = false;
    }
  }
}
