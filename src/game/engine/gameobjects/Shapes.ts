/**
 * AS FORMAS — Rectangle, Arc (o `add.circle`) e Ellipse: o mesmo contorno de pontos (o arco em
 * passos de 1%, a elipse em 64 pontos), preenchidos por triângulos da GPU e contornados pelas mesmas linhas.
 * O polígono é preenchido em leque a partir do primeiro ponto (e não pelo earcut). Num polígono convexo os
 * dois cobrem exatamente os mesmos pixels (cada pixel cai em um triângulo só), então a imagem é a mesma.
 * Parte do motor próprio (src/game/engine); licenças em LICENSES.md.
 */
import { OriginGameObject } from './GameObject';
import { getCalcMatrix } from './Graphics';
import { getTintAppendFloatAlpha } from '../renderer';
import { DegToRad } from '../math';
import type { Scene } from '../scene';
import type { Camera } from '../camera';
import type { Renderer } from '../renderer';
import type { TransformMatrix } from '../matrix';

export class Shape extends OriginGameObject {
  public pathData: number[] = [];
  public fillColor = 0xffffff;
  public fillAlpha = 1;
  public strokeColor = 0xffffff;
  public strokeAlpha = 1;
  public lineWidth = 1;
  public isFilled = false;
  public isStroked = false;
  public closePath = true;

  public constructor(scene: Scene, type: string) {
    super(scene, type);
  }

  public setFillStyle(color?: number, alpha = 1): this {
    if (color === undefined) {
      this.isFilled = false;
    } else {
      this.fillColor = color;
      this.fillAlpha = alpha;
      this.isFilled = true;
    }
    return this;
  }

  public setStrokeStyle(lineWidth?: number, color = 0xffffff, alpha = 1): this {
    if (lineWidth === undefined) {
      this.isStroked = false;
    } else {
      this.lineWidth = lineWidth;
      this.strokeColor = color;
      this.strokeAlpha = alpha;
      this.isStroked = true;
    }
    return this;
  }

  public setClosePath(value: boolean): this {
    this.closePath = value;
    return this;
  }

  // ── Size (as formas têm `displayWidth` pela escala) ──
  public get displayWidth(): number { return this.scaleX * this.width; }
  public set displayWidth(value: number) { this.scaleX = value / this.width; }
  public get displayHeight(): number { return this.scaleY * this.height; }
  public set displayHeight(value: number) { this.scaleY = value / this.height; }

  public setDisplaySize(width: number, height: number): this {
    this.displayWidth = width;
    this.displayHeight = height;
    return this;
  }

  /** O StrokePathWebGL. */
  protected strokePathWebGL(renderer: Renderer, alpha: number, dx: number, dy: number): void {
    const strokeTint = renderer.strokeTint;
    const strokeTintColor = getTintAppendFloatAlpha(this.strokeColor, this.strokeAlpha * alpha);
    strokeTint.TL = strokeTintColor;
    strokeTint.TR = strokeTintColor;
    strokeTint.BL = strokeTintColor;
    strokeTint.BR = strokeTintColor;
    const path = this.pathData;
    let pathLength = path.length - 1;
    const lineWidth = this.lineWidth;
    const halfLineWidth = lineWidth / 2;
    let px1 = path[0] - dx;
    let py1 = path[1] - dy;
    if (!this.closePath) pathLength -= 2;
    for (let i = 2; i < pathLength; i += 2) {
      const px2 = path[i] - dx;
      const py2 = path[i + 1] - dy;
      renderer.batch.batchLine(px1, py1, px2, py2, halfLineWidth, halfLineWidth, lineWidth, i - 2, this.closePath ? (i === pathLength - 1) : false);
      px1 = px2;
      py1 = py2;
    }
  }

  /** O FillPathWebGL, em leque (ver o topo do arquivo). */
  protected fillPathWebGL(renderer: Renderer, calcMatrix: TransformMatrix, alpha: number, dx: number, dy: number): void {
    const fillTintColor = getTintAppendFloatAlpha(this.fillColor, this.fillAlpha * alpha);
    const path = this.pathData;
    // O último ponto repete o primeiro: o leque vai do ponto 0 ao penúltimo.
    const count = path.length / 2 - 1;
    const x0 = path[0] - dx;
    const y0 = path[1] - dy;
    const tx0 = calcMatrix.getX(x0, y0);
    const ty0 = calcMatrix.getY(x0, y0);
    for (let i = 1; i < count - 1; i++) {
      const x1 = path[i * 2] - dx;
      const y1 = path[i * 2 + 1] - dy;
      const x2 = path[i * 2 + 2] - dx;
      const y2 = path[i * 2 + 3] - dy;
      renderer.batch.batchTri(tx0, ty0, calcMatrix.getX(x1, y1), calcMatrix.getY(x1, y1), calcMatrix.getX(x2, y2), calcMatrix.getY(x2, y2),
        0, 0, 1, 1, fillTintColor, fillTintColor, fillTintColor, 2);
    }
  }
}

export class Rectangle extends Shape {
  public constructor(scene: Scene, x = 0, y = 0, width = 128, height = 128, fillColor?: number, fillAlpha?: number) {
    super(scene, 'Rectangle');
    this.setPosition(x, y);
    this.setSize(width, height);
    if (fillColor !== undefined) this.setFillStyle(fillColor, fillAlpha);
    this.updateDisplayOrigin();
    this.updateData();
  }

  public setSize(width: number, height: number): this {
    this.width = width;
    this.height = height;
    this.updateData();
    this.updateDisplayOrigin();
    const input = this.input;
    if (input && !input.customHitArea && input.hitArea) {
      input.hitArea.width = width;
      input.hitArea.height = height;
    }
    return this;
  }

  private updateData(): this {
    const w = this.width;
    const h = this.height;
    this.pathData = [0, 0, w, 0, w, h, 0, h, 0, 0];
    return this;
  }

  public override renderWebGL(renderer: Renderer, _src: Rectangle, camera: Camera, parentMatrix?: TransformMatrix): void {
    camera.addToRenderList(this);
    const calc = getCalcMatrix(this, camera, parentMatrix);
    renderer.calcMatrix.copyFrom(calc);
    const dx = this._displayOriginX;
    const dy = this._displayOriginY;
    const alpha = camera.alpha * this.alpha;
    if (this.isFilled) {
      const fillTint = renderer.fillTint;
      const fillTintColor = getTintAppendFloatAlpha(this.fillColor, this.fillAlpha * alpha);
      fillTint.TL = fillTintColor;
      fillTint.TR = fillTintColor;
      fillTint.BL = fillTintColor;
      fillTint.BR = fillTintColor;
      renderer.batch.batchFillRect(-dx, -dy, this.width, this.height);
    }
    if (this.isStroked) this.strokePathWebGL(renderer, alpha, dx, dy);
  }
}

export class Arc extends Shape {
  private readonly geom = { radius: 0 };
  private _startAngle: number;
  private _endAngle: number;
  private _anticlockwise: boolean;
  private _iterations = 0.01;

  public constructor(scene: Scene, x = 0, y = 0, radius = 128, startAngle = 0, endAngle = 360, anticlockwise = false, fillColor?: number, fillAlpha?: number) {
    super(scene, 'Arc');
    this.geom.radius = radius;
    this._startAngle = startAngle;
    this._endAngle = endAngle;
    this._anticlockwise = anticlockwise;
    this.setPosition(x, y);
    const diameter = this.geom.radius * 2;
    this.setSize(diameter, diameter);
    if (fillColor !== undefined) this.setFillStyle(fillColor, fillAlpha);
    this.updateDisplayOrigin();
    this.updateData();
  }

  public get radius(): number { return this.geom.radius; }
  public set radius(value: number) {
    this.geom.radius = value;
    const diameter = value * 2;
    this.setSize(diameter, diameter);
    this.updateDisplayOrigin();
    this.updateData();
  }

  public setRadius(value: number): this {
    this.radius = value;
    return this;
  }

  public setSize(width: number, height: number): this {
    this.width = width;
    this.height = height;
    return this;
  }

  private updateData(): this {
    const step = this._iterations;
    let iteration = step;
    const radius = this.geom.radius;
    const startAngle = DegToRad(this._startAngle);
    let endAngle = DegToRad(this._endAngle);
    const anticlockwise = this._anticlockwise;
    const x = radius;
    const y = radius;
    const PI2 = Math.PI * 2;
    endAngle -= startAngle;
    if (anticlockwise) {
      if (endAngle < -PI2) endAngle = -PI2;
      else if (endAngle > 0) endAngle = -PI2 + endAngle % PI2;
    } else if (endAngle > PI2) {
      endAngle = PI2;
    } else if (endAngle < 0) {
      endAngle = PI2 + endAngle % PI2;
    }
    const path = [x + Math.cos(startAngle) * radius, y + Math.sin(startAngle) * radius];
    let ta: number;
    while (iteration < 1) {
      ta = endAngle * iteration + startAngle;
      path.push(x + Math.cos(ta) * radius, y + Math.sin(ta) * radius);
      iteration += step;
    }
    ta = endAngle + startAngle;
    path.push(x + Math.cos(ta) * radius, y + Math.sin(ta) * radius);
    path.push(x + Math.cos(startAngle) * radius, y + Math.sin(startAngle) * radius);
    this.pathData = path;
    return this;
  }

  public override renderWebGL(renderer: Renderer, _src: Arc, camera: Camera, parentMatrix?: TransformMatrix): void {
    camera.addToRenderList(this);
    const calc = getCalcMatrix(this, camera, parentMatrix);
    const calcMatrix = renderer.calcMatrix.copyFrom(calc);
    const dx = this._displayOriginX;
    const dy = this._displayOriginY;
    const alpha = camera.alpha * this.alpha;
    if (this.isFilled) this.fillPathWebGL(renderer, calcMatrix, alpha, dx, dy);
    if (this.isStroked) this.strokePathWebGL(renderer, alpha, dx, dy);
  }
}

export class Ellipse extends Shape {
  private readonly geom = { x: 0, y: 0, width: 0, height: 0 };
  private readonly _smoothness = 64;

  public constructor(scene: Scene, x = 0, y = 0, width = 128, height = 128, fillColor?: number, fillAlpha?: number) {
    super(scene, 'Ellipse');
    this.geom.x = width / 2;
    this.geom.y = height / 2;
    this.geom.width = width;
    this.geom.height = height;
    this.setPosition(x, y);
    this.width = width;
    this.height = height;
    if (fillColor !== undefined) this.setFillStyle(fillColor, fillAlpha);
    this.updateDisplayOrigin();
    this.updateData();
  }

  public setSize(width: number, height: number): this {
    this.width = width;
    this.height = height;
    this.geom.x = width / 2;
    this.geom.y = height / 2;
    this.geom.width = width;
    this.geom.height = height;
    this.updateDisplayOrigin();
    return this.updateData();
  }

  private updateData(): this {
    const path: number[] = [];
    const quantity = this._smoothness;
    const PI2 = Math.PI * 2;
    const halfWidth = this.geom.width / 2;
    const halfHeight = this.geom.height / 2;
    let firstX = 0;
    let firstY = 0;
    for (let i = 0; i < quantity; i++) {
      // O FromPercent: (max - min) * clamp(p) + min.
      const percent = Math.max(0, Math.min(1, i / quantity));
      const angle = (PI2 - 0) * percent + 0;
      const px = this.geom.x + halfWidth * Math.cos(angle);
      const py = this.geom.y + halfHeight * Math.sin(angle);
      if (i === 0) {
        firstX = px;
        firstY = py;
      }
      path.push(px, py);
    }
    path.push(firstX, firstY);
    this.pathData = path;
    return this;
  }

  public override renderWebGL(renderer: Renderer, _src: Ellipse, camera: Camera, parentMatrix?: TransformMatrix): void {
    camera.addToRenderList(this);
    const calc = getCalcMatrix(this, camera, parentMatrix);
    const calcMatrix = renderer.calcMatrix.copyFrom(calc);
    const dx = this._displayOriginX;
    const dy = this._displayOriginY;
    const alpha = camera.alpha * this.alpha;
    if (this.isFilled) this.fillPathWebGL(renderer, calcMatrix, alpha, dx, dy);
    if (this.isStroked) this.strokePathWebGL(renderer, alpha, dx, dy);
  }
}
