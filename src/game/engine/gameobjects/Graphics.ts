/**
 * O GRAPHICS: uma lista de comandos (cor de preenchimento, linha, retângulo, triângulo, linha entre
 * dois pontos, degradê de quatro cantos) que o desenho WebGL percorre a cada quadro — sem antialias, triângulos
 * da GPU. `generateTexture` desenha os mesmos comandos num canvas 2D (o caminho de canvas) e vira textura.
 * Parte do motor próprio (src/game/engine); licenças em LICENSES.md.
 */
import { GameObject } from './GameObject';
import { TransformMatrix } from '../matrix';
import { getTintAppendFloatAlpha } from '../renderer';
import { Camera } from '../camera';
import type { Scene } from '../scene';
import type { Renderer } from '../renderer';
import type { CanvasTexture } from '../textures';
import { isCanvasSource } from '../host';

const Commands = {
  ARC: 0,
  BEGIN_PATH: 1,
  CLOSE_PATH: 2,
  FILL_RECT: 3,
  LINE_TO: 4,
  MOVE_TO: 5,
  LINE_STYLE: 6,
  FILL_STYLE: 7,
  FILL_PATH: 8,
  STROKE_PATH: 9,
  FILL_TRIANGLE: 10,
  STROKE_TRIANGLE: 11,
  SAVE: 14,
  RESTORE: 15,
  TRANSLATE: 16,
  SCALE: 17,
  ROTATE: 18,
  GRADIENT_FILL_STYLE: 21,
  GRADIENT_LINE_STYLE: 22,
} as const;

type Point = { x: number; y: number; width: number };

/** A matriz de cálculo (GetCalcMatrix): câmera × objeto, descontando a rolagem. */
const tempCam = new TransformMatrix();
const tempSprite = new TransformMatrix();
const tempCalc = new TransformMatrix();
export const getCalcMatrix = (src: GameObject, camera: Camera, parentMatrix?: TransformMatrix): TransformMatrix => {
  tempSprite.applyITRS(src.x, src.y, src.rotation, src.scaleX, src.scaleY);
  tempCam.copyFrom(camera.matrix);
  if (parentMatrix) {
    tempCam.multiplyWithOffset(parentMatrix, -camera.scrollX * src.scrollFactorX, -camera.scrollY * src.scrollFactorY);
    tempSprite.e = src.x;
    tempSprite.f = src.y;
  } else {
    tempSprite.e -= camera.scrollX * src.scrollFactorX;
    tempSprite.f -= camera.scrollY * src.scrollFactorY;
  }
  tempCam.multiply(tempSprite, tempCalc);
  return tempCalc;
};

const currentMatrixTemp = new TransformMatrix();

export class Graphics extends GameObject {
  public commandBuffer: number[] = [];
  public defaultFillColor = -1;
  public defaultFillAlpha = 1;
  public defaultStrokeWidth = 1;
  public defaultStrokeColor = -1;
  public defaultStrokeAlpha = 1;
  private _lineWidth = 1;
  private static targetCamera: Camera | null = null;

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
      this.renderCanvas(ctx, camera);
      if (texture && 'refresh' in texture) texture.refresh();
    }
    return this;
  }

  private renderCanvas(ctx: CanvasRenderingContext2D, camera: Camera): void {
    const commandBuffer = this.commandBuffer;
    const commandBufferLength = commandBuffer.length;
    if (commandBufferLength === 0) return;
    // O SetTransform do caminho de canvas: alfa, composição e a matriz câmera × objeto.
    const alpha = camera.alpha * this.alpha;
    if (alpha <= 0) return;
    const calcMatrix = getCalcMatrix(this, camera);
    ctx.globalAlpha = alpha;
    ctx.save();
    calcMatrix.setToContext(ctx);
    ctx.imageSmoothingEnabled = false;
    camera.addToRenderList(this);
    ctx.beginPath();
    for (let index = 0; index < commandBufferLength; ++index) {
      const commandID = commandBuffer[index];
      switch (commandID) {
        case Commands.ARC:
          ctx.arc(commandBuffer[index + 1], commandBuffer[index + 2], commandBuffer[index + 3], commandBuffer[index + 4], commandBuffer[index + 5], Boolean(commandBuffer[index + 6]));
          index += 7;
          break;
        case Commands.LINE_STYLE: {
          const lineColor = commandBuffer[index + 2];
          const red = (lineColor & 0xFF0000) >>> 16;
          const green = (lineColor & 0xFF00) >>> 8;
          const blue = lineColor & 0xFF;
          ctx.strokeStyle = `rgba(${red},${green},${blue},${commandBuffer[index + 3]})`;
          ctx.lineWidth = commandBuffer[index + 1];
          index += 3;
          break;
        }
        case Commands.FILL_STYLE: {
          const fillColor = commandBuffer[index + 1];
          const red = (fillColor & 0xFF0000) >>> 16;
          const green = (fillColor & 0xFF00) >>> 8;
          const blue = fillColor & 0xFF;
          ctx.fillStyle = `rgba(${red},${green},${blue},${commandBuffer[index + 2]})`;
          index += 2;
          break;
        }
        case Commands.BEGIN_PATH:
          ctx.beginPath();
          break;
        case Commands.CLOSE_PATH:
          ctx.closePath();
          break;
        case Commands.FILL_PATH:
          ctx.fill();
          break;
        case Commands.STROKE_PATH:
          ctx.stroke();
          break;
        case Commands.FILL_RECT:
          ctx.fillRect(commandBuffer[index + 1], commandBuffer[index + 2], commandBuffer[index + 3], commandBuffer[index + 4]);
          index += 4;
          break;
        case Commands.FILL_TRIANGLE:
          ctx.beginPath();
          ctx.moveTo(commandBuffer[index + 1], commandBuffer[index + 2]);
          ctx.lineTo(commandBuffer[index + 3], commandBuffer[index + 4]);
          ctx.lineTo(commandBuffer[index + 5], commandBuffer[index + 6]);
          ctx.closePath();
          ctx.fill();
          index += 6;
          break;
        case Commands.STROKE_TRIANGLE:
          ctx.beginPath();
          ctx.moveTo(commandBuffer[index + 1], commandBuffer[index + 2]);
          ctx.lineTo(commandBuffer[index + 3], commandBuffer[index + 4]);
          ctx.lineTo(commandBuffer[index + 5], commandBuffer[index + 6]);
          ctx.closePath();
          ctx.stroke();
          index += 6;
          break;
        case Commands.LINE_TO:
          ctx.lineTo(commandBuffer[index + 1], commandBuffer[index + 2]);
          index += 2;
          break;
        case Commands.MOVE_TO:
          ctx.moveTo(commandBuffer[index + 1], commandBuffer[index + 2]);
          index += 2;
          break;
        case Commands.SAVE:
          ctx.save();
          break;
        case Commands.RESTORE:
          ctx.restore();
          break;
        case Commands.TRANSLATE:
          ctx.translate(commandBuffer[index + 1], commandBuffer[index + 2]);
          index += 2;
          break;
        case Commands.SCALE:
          ctx.scale(commandBuffer[index + 1], commandBuffer[index + 2]);
          index += 2;
          break;
        case Commands.ROTATE:
          ctx.rotate(commandBuffer[index + 1]);
          index += 1;
          break;
        case Commands.GRADIENT_FILL_STYLE:
          // (sic) o caminho de canvas pula só 5 dos 8 argumentos
          index += 5;
          break;
        case Commands.GRADIENT_LINE_STYLE:
          index += 6;
          break;
        default:
          break;
      }
    }
    ctx.restore();
  }

  protected override preDestroy(): void {
    this.commandBuffer = [];
  }

  public override renderWebGL(renderer: Renderer, _src: Graphics, camera: Camera, parentMatrix?: TransformMatrix): void {
    const commands = this.commandBuffer;
    if (commands.length === 0) return;
    camera.addToRenderList(this);
    const calcMatrix = getCalcMatrix(this, camera, parentMatrix);
    const currentMatrix = currentMatrixTemp.loadIdentity();
    const alpha = camera.alpha * this.alpha;
    let lineWidth = 1;
    const fillTint = renderer.fillTint;
    const strokeTint = renderer.strokeTint;
    const PI2 = Math.PI * 2;
    const iterStep = 0.01;
    const path: Array<{ points: Point[] }> = [];
    let pathOpen = true;
    let lastPath: { points: Point[] } | null = null;
    const newPath = (x: number, y: number, width: number): { points: Point[] } => ({ points: [{ x, y, width }] });
    for (let cmdIndex = 0; cmdIndex < commands.length; cmdIndex++) {
      const cmd = commands[cmdIndex];
      switch (cmd) {
        case Commands.BEGIN_PATH:
          path.length = 0;
          lastPath = null;
          pathOpen = true;
          break;
        case Commands.CLOSE_PATH:
          pathOpen = false;
          if (lastPath && lastPath.points.length) lastPath.points.push(lastPath.points[0]);
          break;
        case Commands.FILL_PATH:
          // Nenhuma tela do jogo preenche caminho livre; isso pediria triangular (earcut).
          break;
        case Commands.STROKE_PATH:
          for (let pathIndex = 0; pathIndex < path.length; pathIndex++) {
            renderer.batchStrokePath(path[pathIndex].points, lineWidth, pathOpen, currentMatrix, calcMatrix);
          }
          break;
        case Commands.LINE_STYLE: {
          lineWidth = commands[++cmdIndex];
          const strokeColor = commands[++cmdIndex];
          const strokeAlpha = commands[++cmdIndex] * alpha;
          const strokeTintColor = getTintAppendFloatAlpha(strokeColor, strokeAlpha);
          strokeTint.TL = strokeTintColor;
          strokeTint.TR = strokeTintColor;
          strokeTint.BL = strokeTintColor;
          strokeTint.BR = strokeTintColor;
          break;
        }
        case Commands.FILL_STYLE: {
          const fillColor = commands[++cmdIndex];
          const fillAlpha = commands[++cmdIndex] * alpha;
          const fillTintColor = getTintAppendFloatAlpha(fillColor, fillAlpha);
          fillTint.TL = fillTintColor;
          fillTint.TR = fillTintColor;
          fillTint.BL = fillTintColor;
          fillTint.BR = fillTintColor;
          break;
        }
        case Commands.GRADIENT_FILL_STYLE: {
          const alphaTL = commands[++cmdIndex] * alpha;
          const alphaTR = commands[++cmdIndex] * alpha;
          const alphaBL = commands[++cmdIndex] * alpha;
          const alphaBR = commands[++cmdIndex] * alpha;
          fillTint.TL = getTintAppendFloatAlpha(commands[++cmdIndex], alphaTL);
          fillTint.TR = getTintAppendFloatAlpha(commands[++cmdIndex], alphaTR);
          fillTint.BL = getTintAppendFloatAlpha(commands[++cmdIndex], alphaBL);
          fillTint.BR = getTintAppendFloatAlpha(commands[++cmdIndex], alphaBR);
          break;
        }
        case Commands.GRADIENT_LINE_STYLE: {
          lineWidth = commands[++cmdIndex];
          const gradientLineAlpha = commands[++cmdIndex] * alpha;
          strokeTint.TL = getTintAppendFloatAlpha(commands[++cmdIndex], gradientLineAlpha);
          strokeTint.TR = getTintAppendFloatAlpha(commands[++cmdIndex], gradientLineAlpha);
          strokeTint.BL = getTintAppendFloatAlpha(commands[++cmdIndex], gradientLineAlpha);
          strokeTint.BR = getTintAppendFloatAlpha(commands[++cmdIndex], gradientLineAlpha);
          break;
        }
        case Commands.ARC: {
          let iteration = 0;
          const x = commands[++cmdIndex];
          const y = commands[++cmdIndex];
          const radius = commands[++cmdIndex];
          const startAngle = commands[++cmdIndex];
          let endAngle = commands[++cmdIndex];
          const anticlockwise = commands[++cmdIndex];
          const overshoot = commands[++cmdIndex];
          endAngle -= startAngle;
          if (anticlockwise) {
            if (endAngle < -PI2) endAngle = -PI2;
            else if (endAngle > 0) endAngle = -PI2 + endAngle % PI2;
          } else if (endAngle > PI2) {
            endAngle = PI2;
          } else if (endAngle < 0) {
            endAngle = PI2 + endAngle % PI2;
          }
          if (lastPath === null) {
            lastPath = newPath(x + Math.cos(startAngle) * radius, y + Math.sin(startAngle) * radius, lineWidth);
            path.push(lastPath);
            iteration += iterStep;
          }
          while (iteration < 1 + overshoot) {
            const ta = endAngle * iteration + startAngle;
            lastPath.points.push({ x: x + Math.cos(ta) * radius, y: y + Math.sin(ta) * radius, width: lineWidth });
            iteration += iterStep;
          }
          const ta = endAngle + startAngle;
          lastPath.points.push({ x: x + Math.cos(ta) * radius, y: y + Math.sin(ta) * radius, width: lineWidth });
          break;
        }
        case Commands.FILL_RECT:
          renderer.batchFillRect(commands[++cmdIndex], commands[++cmdIndex], commands[++cmdIndex], commands[++cmdIndex], currentMatrix, calcMatrix);
          break;
        case Commands.FILL_TRIANGLE:
          renderer.batchFillTriangle(commands[++cmdIndex], commands[++cmdIndex], commands[++cmdIndex], commands[++cmdIndex], commands[++cmdIndex], commands[++cmdIndex], currentMatrix, calcMatrix);
          break;
        case Commands.STROKE_TRIANGLE: {
          const x0 = commands[++cmdIndex];
          const y0 = commands[++cmdIndex];
          const x1 = commands[++cmdIndex];
          const y1 = commands[++cmdIndex];
          const x2 = commands[++cmdIndex];
          const y2 = commands[++cmdIndex];
          renderer.batchStrokePath([
            { x: x0, y: y0, width: lineWidth }, { x: x1, y: y1, width: lineWidth },
            { x: x2, y: y2, width: lineWidth }, { x: x0, y: y0, width: lineWidth },
          ], lineWidth, false, currentMatrix, calcMatrix);
          break;
        }
        case Commands.LINE_TO:
          if (lastPath !== null) {
            lastPath.points.push({ x: commands[++cmdIndex], y: commands[++cmdIndex], width: lineWidth });
          } else {
            lastPath = newPath(commands[++cmdIndex], commands[++cmdIndex], lineWidth);
            path.push(lastPath);
          }
          break;
        case Commands.MOVE_TO:
          lastPath = newPath(commands[++cmdIndex], commands[++cmdIndex], lineWidth);
          path.push(lastPath);
          break;
        case Commands.TRANSLATE:
          currentMatrix.translate(commands[++cmdIndex], commands[++cmdIndex]);
          break;
        case Commands.SCALE:
          currentMatrix.scale(commands[++cmdIndex], commands[++cmdIndex]);
          break;
        case Commands.ROTATE:
          currentMatrix.rotate(commands[++cmdIndex]);
          break;
        default:
          break;
      }
    }
  }
}
