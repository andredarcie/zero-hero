// O LOTE DE DESENHO: cada objeto 2D vira quads e triângulos no mesmo buffer (sprite, textura, retângulo, triângulo,
// linha, caminho), com a cor e o alfa de cada canto. Quem esvazia o lote na GPU é o Renderer. Licenças em LICENSES.md.

import { TransformMatrix } from './matrix';
import type { Camera } from './camera';
import type { GameObject } from './gameobjects/GameObject';
import type { GLTexture } from './rendererTextures';
import type { Renderer } from './renderer';
import type { Frame } from './textures';

/** A tinta com o alfa nos 8 bits de cima (o getTintAppendFloatAlpha: o alfa é TRUNCADO para 0–255). */
export const getTintAppendFloatAlpha = (rgb: number, a: number): number => ((((a * 255) | 0) & 0xff) << 24 | rgb) >>> 0;
const getTintAppendFloatAlphaAndSwap = (rgb: number, a: number): number => {
  const ur = ((rgb >> 16) | 0) & 0xff;
  const ug = ((rgb >> 8) | 0) & 0xff;
  const ub = (rgb | 0) & 0xff;
  const ua = ((a * 255) | 0) & 0xff;
  return ((ua << 24) | (ub << 16) | (ug << 8) | ur) >>> 0;
};
/** 7 componentes de 4 bytes por vértice: x, y, u, v, unidade, efeito de tinta, tinta (4 bytes). */
export const VERTEX_COMPONENTS = 7;
/** O batchSize padrão (4096 quads). */
export const VERTEX_CAPACITY = 4096 * 6;
/** O que o batchSprite lê de uma Image/Sprite. */
export interface SpriteLike {
  frame: Frame;
  displayOriginX: number;
  displayOriginY: number;
  flipX: boolean;
  flipY: boolean;
  x: number;
  y: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
  scrollFactorX: number;
  scrollFactorY: number;
  tintTopLeft: number;
  tintTopRight: number;
  tintBottomLeft: number;
  tintBottomRight: number;
  tintFill: boolean;
  _alphaTL: number;
  _alphaTR: number;
  _alphaBL: number;
  _alphaBR: number;
}

/** O que SpriteBatch usa de Renderer. */
export type SpriteBatchHost = Pick<Renderer,
  '_tempMatrix1' | '_tempMatrix2' | '_tempMatrix3' | 'calcMatrix' | 'ensureCleared' | 'fillTint' | 'firstQuad'
  | 'flush' | 'pendingClear' | 'prevQuad' | 'setTexture2D' | 'strokeTint' | 'vertexCount' | 'vertexViewF32'
  | 'vertexViewU32' | 'whiteTexture'
>;

export class SpriteBatch {
  public constructor(private readonly host: SpriteBatchHost) {}

  public batchQuad(x0: number, y0: number, x1: number, y1: number, x2: number, y2: number, x3: number, y3: number,
    u0: number, v0: number, u1: number, v1: number, tintTL: number, tintTR: number, tintBL: number, tintBR: number,
    tintEffect: number | boolean, texture?: GLTexture | null): boolean {
    if (this.host.pendingClear) this.host.ensureCleared();
    let hasFlushed = false;
    if (this.host.vertexCount + 6 > VERTEX_CAPACITY) {
      this.host.flush();
      hasFlushed = true;
    }
    this.host.setTexture2D(texture);
    const f32 = this.host.vertexViewF32;
    const u32 = this.host.vertexViewU32;
    const effect = +tintEffect;
    let o = (this.host.vertexCount * VERTEX_COMPONENTS) - 1;
    f32[++o] = x0; f32[++o] = y0; f32[++o] = u0; f32[++o] = v0; f32[++o] = 0; f32[++o] = effect; u32[++o] = tintTL;
    f32[++o] = x1; f32[++o] = y1; f32[++o] = u0; f32[++o] = v1; f32[++o] = 0; f32[++o] = effect; u32[++o] = tintBL;
    f32[++o] = x2; f32[++o] = y2; f32[++o] = u1; f32[++o] = v1; f32[++o] = 0; f32[++o] = effect; u32[++o] = tintBR;
    f32[++o] = x0; f32[++o] = y0; f32[++o] = u0; f32[++o] = v0; f32[++o] = 0; f32[++o] = effect; u32[++o] = tintTL;
    f32[++o] = x2; f32[++o] = y2; f32[++o] = u1; f32[++o] = v1; f32[++o] = 0; f32[++o] = effect; u32[++o] = tintBR;
    f32[++o] = x3; f32[++o] = y3; f32[++o] = u1; f32[++o] = v0; f32[++o] = 0; f32[++o] = effect; u32[++o] = tintTR;
    this.host.vertexCount += 6;
    return hasFlushed;
  }

  public batchTri(x0: number, y0: number, x1: number, y1: number, x2: number, y2: number,
    u0: number, v0: number, u1: number, v1: number, tintTL: number, tintTR: number, tintBL: number,
    tintEffect: number | boolean, texture?: GLTexture | null): boolean {
    if (this.host.pendingClear) this.host.ensureCleared();
    let hasFlushed = false;
    if (this.host.vertexCount + 3 > VERTEX_CAPACITY) {
      this.host.flush();
      hasFlushed = true;
    }
    this.host.setTexture2D(texture);
    const f32 = this.host.vertexViewF32;
    const u32 = this.host.vertexViewU32;
    const effect = +tintEffect;
    let o = (this.host.vertexCount * VERTEX_COMPONENTS) - 1;
    f32[++o] = x0; f32[++o] = y0; f32[++o] = u0; f32[++o] = v0; f32[++o] = 0; f32[++o] = effect; u32[++o] = tintTL;
    f32[++o] = x1; f32[++o] = y1; f32[++o] = u0; f32[++o] = v1; f32[++o] = 0; f32[++o] = effect; u32[++o] = tintTR;
    f32[++o] = x2; f32[++o] = y2; f32[++o] = u1; f32[++o] = v1; f32[++o] = 0; f32[++o] = effect; u32[++o] = tintBL;
    this.host.vertexCount += 3;
    return hasFlushed;
  }

  /** Um retângulo de cor da câmera (fundo, clarão, escurecer) — o drawFillRect, com a textura branca. */
  public drawFillRect(x: number, y: number, width: number, height: number, color: number, alpha: number): void {
    x = Math.floor(x);
    y = Math.floor(y);
    const xw = Math.floor(x + width);
    const yh = Math.floor(y + height);
    const tint = getTintAppendFloatAlphaAndSwap(color, alpha);
    this.batchQuad(x, y, x, yh, xw, yh, xw, y, 0, 1, 1, 0, tint, tint, tint, tint, 0, this.host.whiteTexture);
  }

  /** Image/Sprite (o batchSprite). */
  public batchSprite(gameObject: GameObject & SpriteLike, camera: Camera, parentTransformMatrix?: TransformMatrix): void {
    const camMatrix = this.host._tempMatrix1;
    const spriteMatrix = this.host._tempMatrix2;
    const calcMatrix = this.host._tempMatrix3;
    const frame = gameObject.frame;
    const texture = frame.glTexture;
    const u0 = frame.u0;
    const v0 = frame.v0;
    const u1 = frame.u1;
    const v1 = frame.v1;
    const frameX = frame.x;
    const frameY = frame.y;
    const frameWidth = frame.cutWidth;
    const frameHeight = frame.cutHeight;
    const customPivot = frame.customPivot;
    const displayOriginX = gameObject.displayOriginX;
    const displayOriginY = gameObject.displayOriginY;
    let x = -displayOriginX + frameX;
    let y = -displayOriginY + frameY;
    let flipX = 1;
    let flipY = 1;
    if (gameObject.flipX) {
      if (!customPivot) x += (-frame.realWidth + (displayOriginX * 2));
      flipX = -1;
    }
    if (gameObject.flipY) {
      if (!customPivot) y += (-frame.realHeight + (displayOriginY * 2));
      flipY = -1;
    }
    let gx = gameObject.x;
    let gy = gameObject.y;
    if (camera.roundPixels) {
      gx = Math.floor(gx);
      gy = Math.floor(gy);
    }
    spriteMatrix.applyITRS(gx, gy, gameObject.rotation, gameObject.scaleX * flipX, gameObject.scaleY * flipY);
    camMatrix.copyFrom(camera.matrix);
    if (parentTransformMatrix) {
      camMatrix.multiplyWithOffset(parentTransformMatrix, -camera.scrollX * gameObject.scrollFactorX, -camera.scrollY * gameObject.scrollFactorY);
      spriteMatrix.e = gx;
      spriteMatrix.f = gy;
    } else {
      spriteMatrix.e -= camera.scrollX * gameObject.scrollFactorX;
      spriteMatrix.f -= camera.scrollY * gameObject.scrollFactorY;
    }
    camMatrix.multiply(spriteMatrix, calcMatrix);
    const quad = calcMatrix.setQuad(x, y, x + frameWidth, y + frameHeight, camera.renderRoundPixels);
    const cameraAlpha = camera.alpha;
    const tintTL = getTintAppendFloatAlpha(gameObject.tintTopLeft, cameraAlpha * gameObject._alphaTL);
    const tintTR = getTintAppendFloatAlpha(gameObject.tintTopRight, cameraAlpha * gameObject._alphaTR);
    const tintBL = getTintAppendFloatAlpha(gameObject.tintBottomLeft, cameraAlpha * gameObject._alphaBL);
    const tintBR = getTintAppendFloatAlpha(gameObject.tintBottomRight, cameraAlpha * gameObject._alphaBR);
    if (this.host.vertexCount + 6 > VERTEX_CAPACITY) this.host.flush();
    this.batchQuad(quad[0], quad[1], quad[2], quad[3], quad[4], quad[5], quad[6], quad[7], u0, v0, u1, v1, tintTL, tintTR, tintBL, tintBR, gameObject.tintFill, texture);
  }

  /** Textura avulsa (o batchTexture — o texto passa por aqui). */
  public batchTexture(gameObject: GameObject, texture: GLTexture | null, textureWidth: number, textureHeight: number,
    srcX: number, srcY: number, srcWidth: number, srcHeight: number, scaleX: number, scaleY: number, rotation: number,
    flipX: boolean, flipY: boolean, scrollFactorX: number, scrollFactorY: number, displayOriginX: number, displayOriginY: number,
    frameX: number, frameY: number, frameWidth: number, frameHeight: number,
    tintTL: number, tintTR: number, tintBL: number, tintBR: number, tintEffect: number | boolean,
    uOffset: number, vOffset: number, camera: Camera, parentTransformMatrix?: TransformMatrix): void {
    const camMatrix = this.host._tempMatrix1;
    const spriteMatrix = this.host._tempMatrix2;
    const calcMatrix = this.host._tempMatrix3;
    const u0 = (frameX / textureWidth) + uOffset;
    const v0 = (frameY / textureHeight) + vOffset;
    const u1 = (frameX + frameWidth) / textureWidth + uOffset;
    const v1 = (frameY + frameHeight) / textureHeight + vOffset;
    let width = srcWidth;
    let height = srcHeight;
    let x = -displayOriginX;
    let y = -displayOriginY;
    if (flipX) {
      width *= -1;
      x += srcWidth;
    }
    if (flipY) {
      height *= -1;
      y += srcHeight;
    }
    if (camera.roundPixels) {
      srcX = Math.floor(srcX);
      srcY = Math.floor(srcY);
    }
    spriteMatrix.applyITRS(srcX, srcY, rotation, scaleX, scaleY);
    camMatrix.copyFrom(camera.matrix);
    if (parentTransformMatrix) {
      camMatrix.multiplyWithOffset(parentTransformMatrix, -camera.scrollX * scrollFactorX, -camera.scrollY * scrollFactorY);
      spriteMatrix.e = srcX;
      spriteMatrix.f = srcY;
    } else {
      spriteMatrix.e -= camera.scrollX * scrollFactorX;
      spriteMatrix.f -= camera.scrollY * scrollFactorY;
    }
    camMatrix.multiply(spriteMatrix, calcMatrix);
    const quad = calcMatrix.setQuad(x, y, x + width, y + height, camera.renderRoundPixels);
    void gameObject;
    this.batchQuad(quad[0], quad[1], quad[2], quad[3], quad[4], quad[5], quad[6], quad[7], u0, v0, u1, v1, tintTL, tintTR, tintBL, tintBR, tintEffect, texture);
  }

  public batchFillRect(x: number, y: number, width: number, height: number, currentMatrix?: TransformMatrix, parentMatrix?: TransformMatrix): void {
    const calcMatrix = this.host.calcMatrix;
    if (parentMatrix && currentMatrix) parentMatrix.multiply(currentMatrix, calcMatrix);
    const quad = calcMatrix.setQuad(x, y, x + width, y + height);
    const tint = this.host.fillTint;
    this.batchQuad(quad[0], quad[1], quad[2], quad[3], quad[4], quad[5], quad[6], quad[7], 0, 0, 1, 1, tint.TL, tint.TR, tint.BL, tint.BR, 2);
  }

  public batchFillTriangle(x0: number, y0: number, x1: number, y1: number, x2: number, y2: number, currentMatrix?: TransformMatrix, parentMatrix?: TransformMatrix): void {
    const calcMatrix = this.host.calcMatrix;
    if (parentMatrix && currentMatrix) parentMatrix.multiply(currentMatrix, calcMatrix);
    const tx0 = calcMatrix.getX(x0, y0);
    const ty0 = calcMatrix.getY(x0, y0);
    const tx1 = calcMatrix.getX(x1, y1);
    const ty1 = calcMatrix.getY(x1, y1);
    const tx2 = calcMatrix.getX(x2, y2);
    const ty2 = calcMatrix.getY(x2, y2);
    const tint = this.host.fillTint;
    this.batchTri(tx0, ty0, tx1, ty1, tx2, ty2, 0, 0, 1, 1, tint.TL, tint.TR, tint.BL, 2);
  }

  public batchStrokePath(path: Array<{ x: number; y: number; width: number }>, lineWidth: number, pathOpen: boolean, currentMatrix?: TransformMatrix, parentMatrix?: TransformMatrix): void {
    this.host.prevQuad[4] = 0;
    this.host.firstQuad[4] = 0;
    const pathLength = path.length - 1;
    for (let pathIndex = 0; pathIndex < pathLength; pathIndex++) {
      const point0 = path[pathIndex];
      const point1 = path[pathIndex + 1];
      this.batchLine(point0.x, point0.y, point1.x, point1.y, point0.width / 2, point1.width / 2, lineWidth, pathIndex,
        !pathOpen && (pathIndex === pathLength - 1), currentMatrix, parentMatrix);
    }
  }

  public batchLine(ax: number, ay: number, bx: number, by: number, aLineWidth: number, bLineWidth: number, lineWidth: number,
    index: number, closePath: boolean, currentMatrix?: TransformMatrix, parentMatrix?: TransformMatrix): void {
    const calcMatrix = this.host.calcMatrix;
    if (parentMatrix && currentMatrix) parentMatrix.multiply(currentMatrix, calcMatrix);
    const dx = bx - ax;
    const dy = by - ay;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len === 0) return;
    const al0 = aLineWidth * (by - ay) / len;
    const al1 = aLineWidth * (ax - bx) / len;
    const bl0 = bLineWidth * (by - ay) / len;
    const bl1 = bLineWidth * (ax - bx) / len;
    const lx0 = bx - bl0;
    const ly0 = by - bl1;
    const lx1 = ax - al0;
    const ly1 = ay - al1;
    const lx2 = bx + bl0;
    const ly2 = by + bl1;
    const lx3 = ax + al0;
    const ly3 = ay + al1;
    const brX = calcMatrix.getX(lx0, ly0);
    const brY = calcMatrix.getY(lx0, ly0);
    const blX = calcMatrix.getX(lx1, ly1);
    const blY = calcMatrix.getY(lx1, ly1);
    const trX = calcMatrix.getX(lx2, ly2);
    const trY = calcMatrix.getY(lx2, ly2);
    const tlX = calcMatrix.getX(lx3, ly3);
    const tlY = calcMatrix.getY(lx3, ly3);
    const tint = this.host.strokeTint;
    this.batchQuad(tlX, tlY, blX, blY, brX, brY, trX, trY, 0, 0, 1, 1, tint.TL, tint.TR, tint.BL, tint.BR, 2);
    if (lineWidth <= 2) return;
    const prev = this.host.prevQuad;
    const first = this.host.firstQuad;
    if (index > 0 && prev[4]) {
      this.batchQuad(tlX, tlY, blX, blY, prev[0], prev[1], prev[2], prev[3], 0, 0, 1, 1, tint.TL, tint.TR, tint.BL, tint.BR, 2);
    } else {
      first[0] = tlX;
      first[1] = tlY;
      first[2] = blX;
      first[3] = blY;
      first[4] = 1;
    }
    if (closePath && first[4]) {
      this.batchQuad(brX, brY, trX, trY, first[0], first[1], first[2], first[3], 0, 0, 1, 1, tint.TL, tint.TR, tint.BL, tint.BR, 2);
    } else {
      prev[0] = brX;
      prev[1] = brY;
      prev[2] = trX;
      prev[3] = trY;
      prev[4] = 1;
    }
  }
}
