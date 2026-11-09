/**
 * A IMAGEM e o SPRITE: uma textura com quadro, tamanho tirado do quadro, origem no meio, desenhada
 * pelo batchSprite. O Sprite é a mesma coisa (o jogo não usa animação de sprite), e entra na lista de atualização.
 * Parte do motor próprio (src/game/engine); licenças em LICENSES.md.
 */
import { QuadGameObject } from './GameObject';
import { Frame, type Texture } from '../textures';
import type { Scene } from '../scene';
import type { Camera } from '../camera';
import type { Renderer } from '../renderer';
import type { TransformMatrix } from '../matrix';

const FLAG_TEXTURE = 8;

export class Image extends QuadGameObject {
  public texture!: Texture;
  public frame!: Frame;
  public readonly isCropped = false;

  public constructor(scene: Scene, x: number, y: number, texture?: string | Texture, frame?: string | number, type = 'Image') {
    super(scene, type);
    this.setTexture(texture, frame);
    this.setPosition(x, y);
    this.setSizeToFrame();
    this.setOriginFromFrame();
  }

  public setTexture(key?: string | Texture, frame?: string | number | Frame, updateSize = true, updateOrigin = true): this {
    this.texture = this.scene.sys.textures.get(key);
    return this.setFrame(frame, updateSize, updateOrigin);
  }

  public setFrame(frame?: string | number | Frame | null, updateSize = true, updateOrigin = true): this {
    if (frame instanceof Frame) {
      this.texture = this.scene.sys.textures.get(frame.texture.key);
      this.frame = frame;
    } else {
      this.frame = this.texture.get(frame);
    }
    if (!this.frame.cutWidth || !this.frame.cutHeight) this.renderFlags &= ~FLAG_TEXTURE;
    else this.renderFlags |= FLAG_TEXTURE;
    if (updateSize) this.setSizeToFrame();
    if (updateOrigin) {
      if (this.frame.customPivot) this.setOrigin(this.frame.pivotX, this.frame.pivotY);
      else this.updateDisplayOrigin();
    }
    return this;
  }

  public setOriginFromFrame(): this {
    if (!this.frame || !this.frame.customPivot) return this.setOrigin();
    this.originX = this.frame.pivotX;
    this.originY = this.frame.pivotY;
    return this.updateDisplayOrigin();
  }

  // ── Size ──
  public get displayWidth(): number { return Math.abs(this.scaleX * this.frame.realWidth); }
  public set displayWidth(value: number) { this.scaleX = value / this.frame.realWidth; }
  public get displayHeight(): number { return Math.abs(this.scaleY * this.frame.realHeight); }
  public set displayHeight(value: number) { this.scaleY = value / this.frame.realHeight; }

  public setSizeToFrame(frame: Frame = this.frame): this {
    this.width = frame.realWidth;
    this.height = frame.realHeight;
    const input = this.input;
    if (input && !input.customHitArea && input.hitArea) {
      input.hitArea.width = this.width;
      input.hitArea.height = this.height;
    }
    return this;
  }

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

  public override renderWebGL(renderer: Renderer, _src: Image, camera: Camera, parentMatrix?: TransformMatrix): void {
    camera.addToRenderList(this);
    renderer.batchSprite(this, camera, parentMatrix);
  }
}

export class Sprite extends Image {
  public constructor(scene: Scene, x: number, y: number, texture?: string | Texture, frame?: string | number) {
    super(scene, x, y, texture, frame, 'Sprite');
  }

  public override addedToScene(): void {
    this.scene.sys.updateList.add(this);
  }

  public override removedFromScene(): void {
    this.scene.sys.updateList.remove(this);
  }

  /** As animações de sprite andariam aqui; o jogo não usa nenhuma. */
  public preUpdate(_time: number, _delta: number): void {
    // nada
  }
}
