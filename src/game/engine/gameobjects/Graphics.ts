/**
 * O GRAPHICS: uma lista de comandos (cor de preenchimento, linha, retângulo, triângulo, linha entre
 * dois pontos, degradê de quatro cantos) que o desenho WebGL percorre a cada quadro — sem antialias, triângulos
 * da GPU. `generateTexture` desenha os mesmos comandos num canvas 2D (o caminho de canvas) e vira textura.
 * Parte do motor próprio (src/game/engine); licenças em LICENSES.md.
 */
import { GameObject } from './GameObject';

import { Camera } from '../camera';
import type { Scene } from '../scene';

import type { CanvasTexture } from '../textures';
import { isCanvasSource } from '../host';
import type { TransformMatrix } from '../matrix';
import type { Renderer } from '../renderer';
import { GraphicsCanvasRender, Commands } from './GraphicsCanvasRender';
import { GraphicsWebGLRender } from './GraphicsWebGLRender';
export { getCalcMatrix } from './GraphicsCanvasRender';

export class Graphics extends GameObject {
  public commandBuffer: number[] = [];
  public defaultFillColor = -1;
  public defaultFillAlpha = 1;
  public defaultStrokeWidth = 1;
  public defaultStrokeColor = -1;
  public defaultStrokeAlpha = 1;
  private _lineWidth = 1;
  private static targetCamera: Camera | null = null;
  /** O desenho no canvas 2D. (ver GraphicsCanvasRender) */
  private readonly canvasRender = new GraphicsCanvasRender(this);
  /** O desenho na GPU. (ver GraphicsWebGLRender) */
  private readonly webglRender = new GraphicsWebGLRender(this);

  public constructor(scene: Scene, options?: { x?: number; y?: number; lineStyle?: { width?: number; color?: number; alpha?: number }; fillStyle?: { color?: number; alpha?: number } }) {
    super(scene, 'Graphics');
    this.setPosition(options?.x ?? 0, options?.y ?? 0);
    this.lineStyle(1, 0, 0);
    this.fillStyle(0, 0);
    this.setDefaultStyles(options);
  }

  public setDefaultStyles(options?: { lineStyle?: { width?: number; color?: number; alpha?: number }; fillStyle?: { color?: number; alpha?: number } }): this {
    if (options?.lineStyle) {
      this.defaultStrokeWidth = options.lineStyle.width ?? 1;
      this.defaultStrokeColor = options.lineStyle.color ?? 0xffffff;
      this.defaultStrokeAlpha = options.lineStyle.alpha ?? 1;
      this.lineStyle(this.defaultStrokeWidth, this.defaultStrokeColor, this.defaultStrokeAlpha);
    }
    if (options?.fillStyle) {
      this.defaultFillColor = options.fillStyle.color ?? 0xffffff;
      this.defaultFillAlpha = options.fillStyle.alpha ?? 1;
      this.fillStyle(this.defaultFillColor, this.defaultFillAlpha);
    }
    return this;
  }

  public fillStyle(color: number, alpha = 1): this {
    this.commandBuffer.push(Commands.FILL_STYLE, color, alpha);
    return this;
  }

  public lineStyle(lineWidth: number, color: number, alpha = 1): this {
    this.commandBuffer.push(Commands.LINE_STYLE, lineWidth, color, alpha);
    this._lineWidth = lineWidth;
    return this;
  }

  public fillGradientStyle(topLeft: number, topRight: number, bottomLeft: number, bottomRight: number,
    alphaTopLeft = 1, alphaTopRight = alphaTopLeft, alphaBottomLeft = alphaTopLeft, alphaBottomRight = alphaTopLeft): this {
    this.commandBuffer.push(Commands.GRADIENT_FILL_STYLE, alphaTopLeft, alphaTopRight, alphaBottomLeft, alphaBottomRight, topLeft, topRight, bottomLeft, bottomRight);
    return this;
  }

  public beginPath(): this { this.commandBuffer.push(Commands.BEGIN_PATH); return this; }
  public closePath(): this { this.commandBuffer.push(Commands.CLOSE_PATH); return this; }
  public fillPath(): this { this.commandBuffer.push(Commands.FILL_PATH); return this; }
  public strokePath(): this { this.commandBuffer.push(Commands.STROKE_PATH); return this; }

  public fillRect(x: number, y: number, width: number, height: number): this {
    this.commandBuffer.push(Commands.FILL_RECT, x, y, width, height);
    return this;
  }

  public strokeRect(x: number, y: number, width: number, height: number): this {
    const lineWidthHalf = this._lineWidth / 2;
    const minx = x - lineWidthHalf;
    const maxx = x + lineWidthHalf;
    this.beginPath();
    this.moveTo(x, y);
    this.lineTo(x, y + height);
    this.strokePath();
    this.beginPath();
    this.moveTo(x + width, y);
    this.lineTo(x + width, y + height);
    this.strokePath();
    this.beginPath();
    this.moveTo(minx, y);
    this.lineTo(maxx + width, y);
    this.strokePath();
    this.beginPath();
    this.moveTo(minx, y + height);
    this.lineTo(maxx + width, y + height);
    this.strokePath();
    return this;
  }

  public fillTriangle(x0: number, y0: number, x1: number, y1: number, x2: number, y2: number): this {
    this.commandBuffer.push(Commands.FILL_TRIANGLE, x0, y0, x1, y1, x2, y2);
    return this;
  }

  public strokeTriangle(x0: number, y0: number, x1: number, y1: number, x2: number, y2: number): this {
    this.commandBuffer.push(Commands.STROKE_TRIANGLE, x0, y0, x1, y1, x2, y2);
    return this;
  }

  public lineBetween(x1: number, y1: number, x2: number, y2: number): this {
    this.beginPath();
    this.moveTo(x1, y1);
    this.lineTo(x2, y2);
    this.strokePath();
    return this;
  }

  public moveTo(x: number, y: number): this {
    this.commandBuffer.push(Commands.MOVE_TO, x, y);
    return this;
  }

  public lineTo(x: number, y: number): this {
    this.commandBuffer.push(Commands.LINE_TO, x, y);
    return this;
  }

  public clear(): this {
    this.commandBuffer.length = 0;
    if (this.defaultFillColor > -1) this.fillStyle(this.defaultFillColor, this.defaultFillAlpha);
    if (this.defaultStrokeColor > -1) this.lineStyle(this.defaultStrokeWidth, this.defaultStrokeColor, this.defaultStrokeAlpha);
    return this;
  }

  /** Desenha os comandos num canvas (o GraphicsCanvasRenderer) e guarda como textura. */
  public generateTexture(key: string | HTMLCanvasElement, width?: number, height?: number): this {
    const sys = this.scene.sys;
    if (width === undefined) width = sys.scale.width;
    if (height === undefined) height = sys.scale.height;
    if (!Graphics.targetCamera) Graphics.targetCamera = new Camera();
    const camera = Graphics.targetCamera;
    camera.setScene(this.scene);
    camera.setViewport(0, 0, width, height);
    camera.scrollX = this.x;
    camera.scrollY = this.y;
    let texture: CanvasTexture | null = null;
    let ctx: CanvasRenderingContext2D | null = null;
    const willRead: CanvasRenderingContext2DSettings = { willReadFrequently: true };
    if (typeof key === 'string') {
      if (sys.textures.exists(key)) {
        const existing = sys.textures.get(key);
        const src = existing.getSourceImage();
        if (isCanvasSource(src)) ctx = src.getContext('2d', willRead);
        texture = existing as CanvasTexture;
      } else {
        texture = sys.textures.createCanvas(key, width, height);
        ctx = texture ? (texture.getSourceImage() as HTMLCanvasElement).getContext('2d', willRead) : null;
      }
    } else {
      ctx = key.getContext('2d', willRead);
    }
    if (ctx) {
      this.canvasRender.renderCanvas(ctx, camera);
      if (texture && 'refresh' in texture) texture.refresh();
    }
    return this;
  }

  /** O desenho na GPU (ver GraphicsWebGLRender). */
  public override renderWebGL(renderer: Renderer, src: Graphics, camera: Camera, parentMatrix?: TransformMatrix): void {
    this.webglRender.drawWebGL(renderer, src, camera, parentMatrix);
  }

  protected override preDestroy(): void {
    this.commandBuffer = [];
  }
}
